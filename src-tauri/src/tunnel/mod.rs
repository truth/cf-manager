use crate::cloudflared::binary::resolve_cloudflared_binary;
use crate::cloudflared::command::{build_launch_plan, LaunchPlan};
use crate::commands::types::{LogEntry, RunningTunnelStatus, TunnelConfig, TunnelStatus};
use std::collections::HashMap;
use std::net::TcpListener;
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
    profile_type: crate::commands::types::ProfileType,
    started_at: String,
    target: Option<String>,
    local_endpoint: Option<String>,
    child: tokio::process::Child,
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

fn build_tunnel_source(profile_type: &crate::commands::types::ProfileType, tunnel_name: &str) -> String {
    let kind = match profile_type {
        crate::commands::types::ProfileType::Publish => "publish",
        crate::commands::types::ProfileType::Forward => "forward",
    };
    format!("cloudflared:{}:{}", kind, tunnel_name)
}

fn build_starting_message(tunnel_name: &str) -> String {
    format!("Starting profile \"{}\"", tunnel_name)
}

fn build_started_message(tunnel_name: &str, startup_command: &str) -> String {
    format!(
        "Profile \"{}\" process started with command: {}",
        tunnel_name, startup_command
    )
}

fn ensure_forward_port_available(config: &TunnelConfig) -> Result<(), TunnelError> {
    if let TunnelConfig::Forward {
        local_bind_host,
        local_bind_port,
        ..
    } = config
    {
        TcpListener::bind((local_bind_host.as_str(), *local_bind_port))
            .map(|listener| drop(listener))
            .map_err(|error| {
                TunnelError::StartFailed(format!(
                    "Unable to bind local endpoint {}:{}: {}",
                    local_bind_host, local_bind_port, error
                ))
            })?;
    }

    Ok(())
}

fn spawn_with_plan(plan: &LaunchPlan) -> Result<tokio::process::Child, std::io::Error> {
    let mut std_command = std::process::Command::new(&plan.program);
    std_command
        .args(plan.args.iter().map(String::as_str))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std_command.creation_flags(CREATE_NO_WINDOW);
    }

    tokio::process::Command::from(std_command).spawn()
}

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
                profile_type: item.profile_type.clone(),
                started_at: item.started_at.clone(),
                target: item.target.clone(),
                local_endpoint: item.local_endpoint.clone(),
            })
            .collect();
        tunnels.sort_by(|a, b| a.name.cmp(&b.name));

        TunnelStatus {
            running: !tunnels.is_empty(),
            running_count: tunnels.len(),
            tunnels,
        }
    }

    pub async fn start_profile(
        &mut self,
        config: &TunnelConfig,
        app: AppHandle,
        logs: StdArc<Mutex<Vec<LogEntry>>>,
    ) -> Result<(), TunnelError> {
        let tunnel_id = config.id().trim();
        let tunnel_name = config.name().trim();

        if self.tunnels.contains_key(tunnel_id) {
            return Err(TunnelError::AlreadyRunning);
        }

        ensure_forward_port_available(config)?;

        info!("Starting profile process: {}", tunnel_name);

        let _ = app.emit(
            "tunnel-status",
            serde_json::json!({
                "status": "starting",
                "tunnel_id": tunnel_id,
                "name": tunnel_name,
                "type": config.profile_type(),
                "message": build_starting_message(tunnel_name)
            }),
        );

        emit_and_store_log(
            &app,
            &logs,
            build_log("info", format!("Preparing startup command for \"{}\"", tunnel_name), "app"),
        )
        .await;

        let binary = resolve_cloudflared_binary(true).ok_or_else(|| {
            TunnelError::StartFailed(
                "Unable to launch cloudflared. Install cloudflared or configure CLOUDFLARED_PATH.".to_string(),
            )
        })?;

        emit_and_store_log(
            &app,
            &logs,
            build_log(
                "info",
                format!(
                    "Using cloudflared binary: {} ({}){}",
                    binary.path,
                    binary.source,
                    binary
                        .version
                        .as_ref()
                        .map(|v| format!(", version: {}", v))
                        .unwrap_or_default()
                ),
                "app",
            ),
        )
        .await;

        let plan = build_launch_plan(config, binary.path.clone());
        emit_and_store_log(
            &app,
            &logs,
            build_log("info", format!("Attempting startup command: {}", plan.display), "app"),
        )
        .await;

        let mut child = spawn_with_plan(&plan).map_err(|error| {
            TunnelError::StartFailed(format!("Unable to launch cloudflared with command {}: {}", plan.display, error))
        })?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let started_at = chrono::Utc::now().to_rfc3339();

        self.tunnels.insert(
            tunnel_id.to_string(),
            RunningTunnel {
                name: tunnel_name.to_string(),
                profile_type: plan.profile_type.clone(),
                started_at: started_at.clone(),
                target: plan.target.clone(),
                local_endpoint: plan.local_endpoint.clone(),
                child,
            },
        );

        emit_and_store_log(
            &app,
            &logs,
            build_log("info", build_started_message(tunnel_name, &plan.display), "app"),
        )
        .await;

        let tunnel_id_owned = tunnel_id.to_string();
        let tunnel_name_owned = tunnel_name.to_string();
        let profile_type_owned = plan.profile_type.clone();
        let target_owned = plan.target.clone();
        let local_endpoint_owned = plan.local_endpoint.clone();
        let tunnel_source = build_tunnel_source(&profile_type_owned, &tunnel_name_owned);

        if let Some(stdout) = stdout {
            let app_clone = app.clone();
            let logs_clone = logs.clone();
            let tunnel_source_stdout = tunnel_source.clone();
            let tunnel_id_stdout = tunnel_id_owned.clone();
            let tunnel_name_stdout = tunnel_name_owned.clone();
            let profile_type_stdout = profile_type_owned.clone();
            let target_stdout = target_owned.clone();
            let local_endpoint_stdout = local_endpoint_owned.clone();
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

                    if trimmed.contains("Connection registered") || trimmed.contains("Start listening") {
                        let _ = app_clone.emit(
                            "tunnel-status",
                            serde_json::json!({
                                "status": "running",
                                "tunnel_id": tunnel_id_stdout.clone(),
                                "name": tunnel_name_stdout.clone(),
                                "type": profile_type_stdout,
                                "target": target_stdout,
                                "local_endpoint": local_endpoint_stdout,
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
            let tunnel_id_stderr = tunnel_id_owned.clone();
            let tunnel_name_stderr = tunnel_name_owned.clone();
            let profile_type_stderr = profile_type_owned.clone();
            let target_stderr = target_owned.clone();
            let local_endpoint_stderr = local_endpoint_owned.clone();
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
                                "type": profile_type_stderr,
                                "target": target_stderr,
                                "local_endpoint": local_endpoint_stderr,
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
                "type": plan.profile_type,
                "started_at": started_at,
                "target": plan.target,
                "local_endpoint": plan.local_endpoint,
                "command": plan.display,
            }),
        );

        info!("Profile started successfully: {}", tunnel_name);
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

        info!("Stopping profile process: {}", tunnel.name);

        emit_and_store_log(
            &app,
            &logs,
            build_log("info", format!("Stopping profile \"{}\"", tunnel.name), "app"),
        )
        .await;

        if let Err(error) = tunnel.child.kill().await {
            if error.kind() != std::io::ErrorKind::InvalidInput {
                warn!("Failed to kill profile process: {}", error);
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
                "name": tunnel.name,
                "type": tunnel.profile_type,
                "target": tunnel.target,
                "local_endpoint": tunnel.local_endpoint,
            }),
        );

        emit_and_store_log(&app, &logs, build_log("info", "Profile stopped", "app")).await;

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
        let mut exited: Vec<(String, String, crate::commands::types::ProfileType, Option<String>, Option<String>, Option<i32>)> = Vec::new();

        for tunnel_id in ids {
            if let Some(tunnel) = self.tunnels.get_mut(&tunnel_id) {
                match tunnel.child.try_wait() {
                    Ok(Some(status)) => {
                        exited.push((
                            tunnel_id,
                            tunnel.name.clone(),
                            tunnel.profile_type.clone(),
                            tunnel.target.clone(),
                            tunnel.local_endpoint.clone(),
                            status.code(),
                        ));
                    }
                    Ok(None) => {}
                    Err(error) => {
                        exited.push((
                            tunnel_id,
                            tunnel.name.clone(),
                            tunnel.profile_type.clone(),
                            tunnel.target.clone(),
                            tunnel.local_endpoint.clone(),
                            Some(-1),
                        ));
                        warn!("Failed to inspect profile process state: {}", error);
                    }
                }
            }
        }

        for (tunnel_id, tunnel_name, profile_type, target, local_endpoint, exit_code) in exited {
            self.tunnels.remove(&tunnel_id);
            let message = format!(
                "Profile \"{}\" exited{}",
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
                    "type": profile_type,
                    "target": target,
                    "local_endpoint": local_endpoint,
                    "message": message,
                }),
            );
        }
    }
}
