use std::sync::Arc as StdArc;
use tokio::sync::Mutex;
use tauri::State;
use crate::state::AppState;
use super::types::LogEntry;

#[tauri::command]
pub async fn get_logs(
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<LogEntry>, String> {
    let logs: StdArc<Mutex<Vec<LogEntry>>> = state.logs.clone();
    let guard = logs.lock().await;
    let limit = limit.unwrap_or(100);
    let start = guard.len().saturating_sub(limit);
    Ok(guard[start..].to_vec())
}

#[tauri::command]
pub async fn clear_logs(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let logs: StdArc<Mutex<Vec<LogEntry>>> = state.logs.clone();
    let mut guard = logs.lock().await;
    guard.clear();
    Ok(())
}
