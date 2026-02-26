use crate::state::AppState;
use crate::tunnel::{TunnelError, TunnelManager};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelConfig {
    pub id: String,
    pub name: String,
    pub token: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelStatus {
    pub running: bool,
    pub tunnel_id: Option<String>,
    pub started_at: Option<String>,
}

type MutexGuard<'a, T> = tokio::sync::MutexGuard<'a, T>;

fn map_start_error(error: TunnelError) -> String {
    match error {
        TunnelError::AlreadyRunning => {
            "Tunnel is already running. Stop the current tunnel before starting another one.".to_string()
        }
        TunnelError::StartFailed(message) => message,
        TunnelError::Io(io_error) => format!("Unable to start tunnel due to system IO error: {}", io_error),
        TunnelError::NotRunning => "Tunnel is not running.".to_string(),
    }
}

fn map_stop_error(error: TunnelError) -> String {
    match error {
        TunnelError::NotRunning => "Tunnel is not running.".to_string(),
        TunnelError::Io(io_error) => format!("Unable to stop tunnel due to system IO error: {}", io_error),
        TunnelError::AlreadyRunning => "Tunnel is already running.".to_string(),
        TunnelError::StartFailed(message) => message,
    }
}

#[tauri::command]
pub async fn start_tunnel(
    token: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if token.trim().is_empty() {
        return Err("Token is empty. Please paste a valid Cloudflare tunnel token.".to_string());
    }

    let tunnel_manager = state.tunnel_manager.clone();
    let logs = state.logs.clone();

    let mut manager: MutexGuard<'_, TunnelManager> = tunnel_manager.lock().await;
    manager
        .start(token.trim(), app, logs)
        .await
        .map_err(map_start_error)?;

    Ok("Tunnel started successfully".to_string())
}

#[tauri::command]
pub async fn stop_tunnel(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let tunnel_manager = state.tunnel_manager.clone();
    let logs = state.logs.clone();

    let mut manager: MutexGuard<'_, TunnelManager> = tunnel_manager.lock().await;
    manager.stop(app, logs).await.map_err(map_stop_error)?;

    Ok("Tunnel stopped".to_string())
}

#[tauri::command]
pub async fn get_tunnel_status(state: State<'_, AppState>) -> Result<TunnelStatus, String> {
    let tunnel_manager = state.tunnel_manager.clone();

    let manager: MutexGuard<'_, TunnelManager> = tunnel_manager.lock().await;
    Ok(manager.get_status())
}
