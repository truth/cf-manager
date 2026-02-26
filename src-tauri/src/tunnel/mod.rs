use crate::commands::tunnel::TunnelStatus;
use crate::commands::types::LogEntry;
use std::collections::HashSet;
use std::sync::Arc as StdArc;
use tauri::{AppHandle, Emitter};
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::{info, warn};

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
    running: bool,
    tunnel_id: Option<String>,
    started_at: Option<String>,
    child: Option<tokio::process::Child>,
    startup_command: Option<String>,
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

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            running: false,
            tunnel_id: None,
            started_at: None,
            child: None,
            startup_command: None,
        }
    }

    pub fn get_status(&self) -> TunnelStatus {
        TunnelStatus {
            running: self.running,
            tunnel_id: self.tunnel_id.clone(),
            started_at: self.started_at.clone(),
        }
    }

    pub async fn start(
        &mut self,
        token: &str,
        app: AppHandle,
        logs: StdArc<Mutex<Vec<LogEntry>>>,
    ) -> Result<(), TunnelError> {
        if self.running {
            return Err(TunnelError::AlreadyRunning);
        }

        let trimmed_token = token.trim();
        if trimmed_token.is_empty() {
            return Err(TunnelError::StartFailed(
                "Token is empty. Please paste a valid Cloudflare tunnel token.".to_string(),
            ));
        }

        info!("Starting tunnel process");

        let _ = app.emit(
            "tunnel-status",
            serde_json::json!({
                "status": "starting",
                "message": "Starting tunnel process"
            }),
        );

        emit_and_store_log(
            &app,
            &logs,
            build_log("info", "Preparing tunnel startup command", "app"),
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

            let spawn = tokio::process::Command::new(&candidate.program)
                .args(candidate.args.iter().map(String::as_str))
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn();

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
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        self.child = Some(child);
        self.running = true;
        self.tunnel_id = Some(uuid::Uuid::new_v4().to_string());
        self.started_at = Some(chrono::Utc::now().to_rfc3339());
        self.startup_command = Some(startup_command.clone());

        emit_and_store_log(
            &app,
            &logs,
            build_log(
                "info",
                format!("Tunnel process started with command: {}", startup_command),
                "app",
            ),
        )
        .await;

        if let Some(stdout) = stdout {
            let app_clone = app.clone();
            let logs_clone = logs.clone();
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
                        build_log("info", trimmed.to_string(), "cloudflared"),
                    )
                    .await;

                    if trimmed.contains("Connection registered") {
                        let _ = app_clone.emit(
                            "tunnel-connected",
                            serde_json::json!({
                                "tunnel_id": "",
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
                        build_log(level, trimmed.to_string(), "cloudflared"),
                    )
                    .await;

                    if level == "error" {
                        let _ = app_clone.emit(
                            "tunnel-status",
                            serde_json::json!({
                                "status": "error",
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
                "tunnel_id": self.tunnel_id,
                "started_at": self.started_at,
                "command": self.startup_command,
            }),
        );

        info!("Tunnel started successfully");
        Ok(())
    }

    pub async fn stop(
        &mut self,
        app: AppHandle,
        logs: StdArc<Mutex<Vec<LogEntry>>>,
    ) -> Result<(), TunnelError> {
        if !self.running {
            return Err(TunnelError::NotRunning);
        }

        info!("Stopping tunnel process");

        emit_and_store_log(&app, &logs, build_log("info", "Stopping tunnel process", "app")).await;

        if let Some(mut child) = self.child.take() {
            if let Err(error) = child.kill().await {
                warn!("Failed to kill tunnel process: {}", error);
                emit_and_store_log(
                    &app,
                    &logs,
                    build_log("warn", format!("Failed to terminate process: {}", error), "app"),
                )
                .await;
            }
        }

        self.running = false;
        self.tunnel_id = None;
        self.started_at = None;
        self.startup_command = None;

        let _ = app.emit(
            "tunnel-status",
            serde_json::json!({
                "status": "stopped"
            }),
        );

        emit_and_store_log(&app, &logs, build_log("info", "Tunnel stopped", "app")).await;

        Ok(())
    }
}
