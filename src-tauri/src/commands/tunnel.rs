use crate::commands::config::get_config;
use crate::commands::types::{TunnelConfig, TunnelStatus, ValidationResult};
use crate::state::AppState;
use crate::tunnel::{TunnelError, TunnelManager};
use tauri::{AppHandle, State};

type MutexGuard<'a, T> = tokio::sync::MutexGuard<'a, T>;

fn map_start_error(error: TunnelError) -> String {
    match error {
        TunnelError::AlreadyRunning => "Tunnel is already running.".to_string(),
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

fn validate_config(config: &TunnelConfig) -> ValidationResult {
    let mut errors = Vec::new();
    let warnings = Vec::new();

    match config {
        TunnelConfig::Publish { name, token, .. } => {
            if name.trim().is_empty() {
                errors.push("Profile name is empty.".to_string());
            }
            if token.trim().is_empty() {
                errors.push("Token is empty. Please paste a valid Cloudflare tunnel token.".to_string());
            }
        }
        TunnelConfig::Forward {
            name,
            target_hostname,
            local_bind_host,
            local_bind_port,
            ..
        } => {
            if name.trim().is_empty() {
                errors.push("Profile name is empty.".to_string());
            }
            if target_hostname.trim().is_empty() {
                errors.push("Target hostname is empty.".to_string());
            }
            if local_bind_host.trim().is_empty() {
                errors.push("Local bind host is empty.".to_string());
            }
            if *local_bind_port == 0 {
                errors.push("Local bind port must be between 1 and 65535.".to_string());
            }
        }
    }

    ValidationResult {
        ok: errors.is_empty(),
        errors,
        warnings,
    }
}

#[tauri::command]
pub async fn start_profile(
    profile_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if profile_id.trim().is_empty() {
        return Err("Profile ID is empty.".to_string());
    }

    let config = get_config(profile_id.clone(), app.clone(), state.clone()).await?
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    let validation = validate_config(&config);
    if !validation.ok {
        return Err(validation.errors.join(" "));
    }

    let tunnel_manager = state.tunnel_manager.clone();
    let logs = state.logs.clone();
    let mut manager: MutexGuard<'_, TunnelManager> = tunnel_manager.lock().await;

    manager.start_profile(&config, app, logs).await.map_err(map_start_error)?;

    Ok("Profile started successfully.".to_string())
}

#[tauri::command]
pub async fn stop_profile(
    profile_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if profile_id.trim().is_empty() {
        return Err("Profile ID is empty.".to_string());
    }

    let tunnel_manager = state.tunnel_manager.clone();
    let logs = state.logs.clone();

    let mut manager: MutexGuard<'_, TunnelManager> = tunnel_manager.lock().await;
    manager.stop(profile_id.trim(), app, logs).await.map_err(map_stop_error)?;

    Ok("Profile stopped.".to_string())
}

#[tauri::command]
pub async fn stop_all_profiles(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let tunnel_manager = state.tunnel_manager.clone();
    let logs = state.logs.clone();

    let mut manager: MutexGuard<'_, TunnelManager> = tunnel_manager.lock().await;
    manager.stop_all(app, logs).await.map_err(map_stop_error)?;

    Ok("All profiles stopped.".to_string())
}

#[tauri::command]
pub async fn get_runtime_status(app: AppHandle, state: State<'_, AppState>) -> Result<TunnelStatus, String> {
    let tunnel_manager = state.tunnel_manager.clone();
    let logs = state.logs.clone();

    let mut manager: MutexGuard<'_, TunnelManager> = tunnel_manager.lock().await;
    manager.refresh_runtime(&app, &logs).await;

    Ok(manager.get_status())
}

#[tauri::command]
pub async fn validate_profile(
    profile_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ValidationResult, String> {
    if profile_id.trim().is_empty() {
        return Err("Profile ID is empty.".to_string());
    }

    let config = get_config(profile_id.clone(), app, state).await?
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    Ok(validate_config(&config))
}

