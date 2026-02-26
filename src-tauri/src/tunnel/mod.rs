use crate::commands::tunnel::{RunningTunnelStatus, TunnelStatus};
use crate::commands::types::LogEntry;
use crate::tunnel::download::CloudflaredDownloader;
use std::collections::{HashMap, HashSet};
use std::sync::Arc as StdArc;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::{info, warn};

pub mod download;

const MAX_LOG_HISTORY: usize = 1_000;

#[derive(Error, Debug)]
pub enum TunnelError {
    #[error("Tunnel already running")]
    AlreadyRunning,
    #[error("Tunnel not running")]
    NotRunning,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Failed to start tunnel: {0}")]
    StartFailed(String),
}

pub struct TunnelManager {
    tunnels: HashMap<String, RunningTunnel>,
}

struct RunningTunnel {
    name: String,
    started_at: String,
    child: tokio::process::Child,
}

struct StartCommandCandidate {
    args: Vec<String>,
    display: String,
    program: String,
}

impl StartCommandCandidate {
    fn new(program: impl Into<String>, token: &str) -> Self {
        let program = program.into();
        Self {
            args: vec![
                "tunnel".to_string(),
                "run".to_string(),
                "--token".to_string(),
                token.to_string(),
            ],
            display: format!("{} tunnel run --token <hidden>", program),
            program,
        }
    }
}

fn append_candidate(
    candidates: &mut Vec<StartCommandCandidate>,
    seen_programs: &mut HashSet<String>,
    program: impl Into<String>,
    token: &str,
) {
    let program = program.into();
    if program.trim().is_empty() {
        return;
    }

    let key = program.to_lowercase();
    if seen_programs.insert(key) {
        candidates.push(StartCommandCandidate::new(program, token));
    }
}

fn build_start_command_candidates(token: &str) -> Vec<StartCommandCandidate> {
    let mut candidates = Vec::new();
    let mut seen_programs = HashSet::new();

    if let Ok(path) = std::env::var("CLOUDFLARED_PATH") {
        append_candidate(&mut candidates, &mut seen_programs, path, token);
    }

    append_candidate(
        &mut candidates,
        &mut seen_programs,
        ".\\binaries\\cloudflared.exe",
        token,
    );
    append_candidate(
        &mut candidates,
        &mut seen_programs,
        ".\\src-tauri\\binaries\\cloudflared.exe",
        token,
    );

    if let Ok(current_dir) = std::env::current_dir() {
        append_candidate(
            &mut candidates,
            &mut seen_programs,
            current_dir.join("binaries").join("cloudflared.exe").display().to_string(),
            token,
        );
        append_candidate(
            &mut candidates,
            &mut seen_programs,
            current_dir
                .join("src-tauri")
                .join("binaries")
                .join("cloudflared.exe")
                .display()
                .to_string(),
            token,
        );
    }

    append_candidate(&mut candidates, &mut seen_programs, "cloudflared", token);

    candidates
}

fn build_log(level: &str, message: impl Into<String>, source: &str) -> LogEntry {
    LogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        level: level.to_string(),
        message: message.into(),
        source: source.to_string(),
    }
}

async fn emit_and_store_log(app: &AppHandle, logs: &StdArc<Mutex<Vec<LogEntry>>>, log: LogEntry) {
    {
        let mut guard = logs.lock().await;
        guard.push(log.clone());
        if guard.len() > MAX_LOG_HISTORY {
            let overflow = guard.len() - MAX_LOG_HISTORY;
            guard.drain(0..overflow);
        }
    }

    let _ = app.emit("tunnel-log", &log);
    if log.level == "error" {
        let _ = app.emit("tunnel-error", &log);
    }
}

fn classify_stderr_level(line: &str) -> &'static str {
    let lowercase = line.to_lowercase();
    if lowercase.contains("error") || lowercase.contains("failed") {
        "error"
    } else if lowercase.contains("warn") {
        "warn"
    } else {
        "info"
    }
}

fn build_tunnel_source(tunnel_name: &str) -> String {
    format!("cloudflared:{}", tunnel_name)
}

fn build_starting_message(tunnel_name: &str) -> String {
    format!("Starting tunnel \"{}\"", tunnel_name)
}

fn build_started_message(tunnel_name: &str, startup_command: &str) -> String {
    format!(
        "Tunnel \"{}\" process started with command: {}",
        tunnel_name, startup_command
    )
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

impl TunnelManager {
    pub fn new() -> Self {
        Self { tunnels: HashMap::new() }
    }

    pub fn get_status(&self) -> TunnelStatus {
        let mut tunnels: Vec<RunningTunnelStatus> = self
            .tunnels
            .iter()
            .map(|(tunnel_id, item)| RunningTunnelStatus {
                tunnel_id: tunnel_id.clone(),
                name: item.name.clone(),
                started_at: item.started_at.clone(),
            })
            .collect();
        tunnels.sort_by(|a, b| a.name.cmp(&b.name));

        TunnelStatus {
            running: !tunnels.is_empty(),
            running_count: tunnels.len(),
            tunnels,
        }
    }

    pub async fn start(
        &mut self,
        tunnel_id: &str,
        tunnel_name: &str,
        token: &str,
        app: AppHandle,
        logs: StdArc<Mutex<Vec<LogEntry>>>,
    ) -> Result<(), TunnelError> {
        if self.tunnels.contains_key(tunnel_id) {
            return Err(TunnelError::AlreadyRunning);
        }

        let trimmed_token = token.trim();
        if trimmed_token.is_empty() {
            return Err(TunnelError::StartFailed(
                "Token is empty. Please paste a valid Cloudflare tunnel token.".to_string(),
            ));
        }

        info!("Starting tunnel process: {}", tunnel_name);

        let _ = app.emit(
            "tunnel-status",
            serde_json::json!({
                "status": "starting",
                "tunnel_id": tunnel_id,
                "name": tunnel_name,
                "message": build_starting_message(tunnel_name)
            }),
        );

        emit_and_store_log(
            &app,
            &logs,
            build_log("info", format!("Preparing startup command for \"{}\"", tunnel_name), "app"),
        )
        .await;

        let candidates = build_start_command_candidates(trimmed_token);
        let mut spawn_errors = Vec::new();
        let mut selected: Option<(tokio::process::Child, String)> = None;

        for candidate in candidates {
            emit_and_store_log(
                &app,
                &logs,
                build_log(
                    "info",
                    format!("Attempting startup command: {}", candidate.display),
                    "app",
                ),
            )
            .await;

            let mut std_command = std::process::Command::new(&candidate.program);
            std_command
                .args(candidate.args.iter().map(String::as_str))
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                std_command.creation_flags(CREATE_NO_WINDOW);
            }

            let mut command = tokio::process::Command::from(std_command);
            let spawn = command.spawn();

            match spawn {
                Ok(child) => {
                    selected = Some((child, candidate.display.clone()));
                    break;
                }
                Err(error) => {
                    let reason = format!("{} -> {}", candidate.display, error);
                    spawn_errors.push(reason.clone());
                    emit_and_store_log(&app, &logs, build_log("warn", reason, "app")).await;
                }
            }
        }

        let (mut child, startup_command) = match selected {
            Some(value) => value,
            None => {
                emit_and_store_log(
                    &app,
                    &logs,
                    build_log("info", "cloudflared not found, attempting to download...", "app"),
                )
                .await;

                let _ = app.emit(
                    "tunnel-status",
                    serde_json::json!({
                        "status": "downloading",
                        "tunnel_id": tunnel_id,
                        "name": tunnel_name,
                        "message": "cloudflared not found. Downloading..."
                    }),
                );

                let download_result = tokio::task::spawn_blocking(|| {
                    CloudflaredDownloader::download_to_common_locations()
                })
                .await
                .unwrap_or(None);

                if let Some(downloaded_path) = download_result {
                    let path_str = downloaded_path.to_string_lossy().to_string();
                    emit_and_store_log(
                        &app,
                        &logs,
                        build_log("info", format!("Successfully downloaded to {:?}", path_str), "app"),
                    )
                    .await;

                    let candidate = StartCommandCandidate::new(&path_str, trimmed_token);

                    let mut std_command = std::process::Command::new(&candidate.program);
                    std_command
                        .args(candidate.args.iter().map(String::as_str))
                        .stdout(std::process::Stdio::piped())
                        .stderr(std::process::Stdio::piped());

                    #[cfg(windows)]
                    {
                        use std::os::windows::process::CommandExt;
                        std_command.creation_flags(CREATE_NO_WINDOW);
                    }

                    let mut command = tokio::process::Command::from(std_command);
                    match command.spawn() {
                        Ok(new_child) => (new_child, candidate.display),
                        Err(error) => {
                            let friendly = format!("Failed to spawn downloaded cloudflared: {}", error);
                            emit_and_store_log(&app, &logs, build_log("error", friendly.clone(), "app")).await;
                            let _ = app.emit(
                                "tunnel-status",
                                serde_json::json!({ "status": "error", "message": friendly }),
                            );
                            return Err(TunnelError::StartFailed(friendly));
                        }
                    }
                } else {
                    let details = if spawn_errors.is_empty() {
                        "No startup command candidates available.".to_string()
                    } else {
                        spawn_errors.join(" | ")
                    };
                    let friendly = format!(
                        "Unable to launch cloudflared. Install cloudflared or configure CLOUDFLARED_PATH. Details: {}",
                        details
                    );

                    emit_and_store_log(&app, &logs, build_log("error", friendly.clone(), "app")).await;
                    let _ = app.emit(
                        "tunnel-status",
                        serde_json::json!({
                            "status": "error",
                            "message": friendly
                        }),
                    );

                    return Err(TunnelError::StartFailed(
                        "Unable to launch cloudflared. Install cloudflared or configure CLOUDFLARED_PATH.".to_string(),
                    ));
                }
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let started_at = chrono::Utc::now().to_rfc3339();
        self.tunnels.insert(
            tunnel_id.to_string(),
            RunningTunnel {
                name: tunnel_name.to_string(),
                started_at: started_at.clone(),
                child,
            },
        );

        emit_and_store_log(
            &app,
            &logs,
            build_log(
                "info",
                build_started_message(tunnel_name, &startup_command),
                "app",
            ),
        )
        .await;

        let tunnel_id_owned = tunnel_id.to_string();
        let tunnel_name_owned = tunnel_name.to_string();
        let tunnel_source = build_tunnel_source(&tunnel_name_owned);

        if let Some(stdout) = stdout {
            let app_clone = app.clone();
            let logs_clone = logs.clone();
            let tunnel_source_stdout = tunnel_source.clone();
            let tunnel_id_stdout = tunnel_id_owned.clone();
            let tunnel_name_stdout = tunnel_name_owned.clone();
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};

                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    emit_and_store_log(
                        &app_clone,
                        &logs_clone,
                        build_log("info", trimmed.to_string(), &tunnel_source_stdout),
                    )
                    .await;

                    if trimmed.contains("Connection registered") {
                        let _ = app_clone.emit(
                            "tunnel-connected",
                            serde_json::json!({
                                "tunnel_id": tunnel_id_stdout.clone(),
                                "name": tunnel_name_stdout.clone(),
                                "domain": ""
                            }),
                        );
                    }
                }
            });
        }

        if let Some(stderr) = stderr {
            let app_clone = app.clone();
            let logs_clone = logs.clone();
            let tunnel_source_stderr = tunnel_source;
            let tunnel_id_stderr = tunnel_id_owned;
            let tunnel_name_stderr = tunnel_name_owned;
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};

                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let level = classify_stderr_level(trimmed);
                    emit_and_store_log(
                        &app_clone,
                        &logs_clone,
                        build_log(level, trimmed.to_string(), &tunnel_source_stderr),
                    )
                    .await;

                    if level == "error" {
                        let _ = app_clone.emit(
                            "tunnel-status",
                            serde_json::json!({
                                "status": "error",
                                "tunnel_id": tunnel_id_stderr.clone(),
                                "name": tunnel_name_stderr.clone(),
                                "message": trimmed
                            }),
                        );
                    }
                }
            });
        }

        let _ = app.emit(
            "tunnel-status",
            serde_json::json!({
                "status": "running",
                "tunnel_id": tunnel_id,
                "name": tunnel_name,
                "started_at": started_at,
                "command": startup_command,
            }),
        );

        info!("Tunnel started successfully: {}", tunnel_name);
        Ok(())
    }

    pub async fn stop(
        &mut self,
        tunnel_id: &str,
        app: AppHandle,
        logs: StdArc<Mutex<Vec<LogEntry>>>,
    ) -> Result<(), TunnelError> {
        let mut tunnel = match self.tunnels.remove(tunnel_id) {
            Some(value) => value,
            None => return Err(TunnelError::NotRunning),
        };

        info!("Stopping tunnel process: {}", tunnel.name);

        emit_and_store_log(
            &app,
            &logs,
            build_log("info", format!("Stopping tunnel \"{}\"", tunnel.name), "app"),
        )
        .await;

        if let Err(error) = tunnel.child.kill().await {
            if error.kind() != std::io::ErrorKind::InvalidInput {
                warn!("Failed to kill tunnel process: {}", error);
                emit_and_store_log(
                    &app,
                    &logs,
                    build_log("warn", format!("Failed to terminate process: {}", error), "app"),
                )
                .await;
            }
        }

        let _ = app.emit(
            "tunnel-status",
            serde_json::json!({
                "status": "stopped",
                "tunnel_id": tunnel_id,
                "name": tunnel.name
            }),
        );

        emit_and_store_log(&app, &logs, build_log("info", "Tunnel stopped", "app")).await;

        Ok(())
    }

    pub async fn stop_all(&mut self, app: AppHandle, logs: StdArc<Mutex<Vec<LogEntry>>>) -> Result<(), TunnelError> {
        let tunnel_ids: Vec<String> = self.tunnels.keys().cloned().collect();
        if tunnel_ids.is_empty() {
            return Err(TunnelError::NotRunning);
        }

        for tunnel_id in tunnel_ids {
            let _ = self.stop(&tunnel_id, app.clone(), logs.clone()).await;
        }

        Ok(())
    }

    pub async fn refresh_runtime(&mut self, app: &AppHandle, logs: &StdArc<Mutex<Vec<LogEntry>>>) {
        let ids: Vec<String> = self.tunnels.keys().cloned().collect();
        let mut exited: Vec<(String, String, Option<i32>)> = Vec::new();

        for tunnel_id in ids {
            if let Some(tunnel) = self.tunnels.get_mut(&tunnel_id) {
                match tunnel.child.try_wait() {
                    Ok(Some(status)) => {
                        exited.push((
                            tunnel_id,
                            tunnel.name.clone(),
                            status.code(),
                        ));
                    }
                    Ok(None) => {}
                    Err(error) => {
                        exited.push((tunnel_id, tunnel.name.clone(), Some(-1)));
                        warn!("Failed to inspect tunnel process state: {}", error);
                    }
                }
            }
        }

        for (tunnel_id, tunnel_name, exit_code) in exited {
            self.tunnels.remove(&tunnel_id);
            let message = format!(
                "Tunnel \"{}\" exited{}",
                tunnel_name,
                exit_code
                    .map(|code| format!(" with code {}", code))
                    .unwrap_or_default()
            );
            emit_and_store_log(app, logs, build_log("warn", message.clone(), "app")).await;
            let _ = app.emit(
                "tunnel-status",
                serde_json::json!({
                    "status": "stopped",
                    "tunnel_id": tunnel_id,
                    "name": tunnel_name,
                    "message": message,
                }),
            );
        }

    }
}
