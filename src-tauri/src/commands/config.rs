use std::collections::HashMap;
use std::sync::Arc as StdArc;
use tokio::sync::Mutex;
use tauri::State;
use crate::state::AppState;
use crate::commands::tunnel::TunnelConfig;

#[tauri::command]
pub async fn save_config(
    config: TunnelConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    let mut guard = configs.lock().await;
    guard.insert(config.id.clone(), config);
    Ok(())
}

#[tauri::command]
pub async fn delete_config(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    let mut guard = configs.lock().await;
    guard.remove(&id);
    Ok(())
}

#[tauri::command]
pub async fn get_config(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<TunnelConfig>, String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    let guard = configs.lock().await;
    Ok(guard.get(&id).cloned())
}

#[tauri::command]
pub async fn list_tunnels(
    state: State<'_, AppState>,
) -> Result<Vec<TunnelConfig>, String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    let guard = configs.lock().await;
    Ok(guard.values().cloned().collect())
}

#[tauri::command]
pub async fn export_configs(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    let guard = configs.lock().await;
    let configs_vec: Vec<&TunnelConfig> = guard.values().collect();
    
    // Export as JSON (with tokens masked for security)
    #[derive(serde::Serialize)]
    struct ExportConfig {
        id: String,
        name: String,
        token: String,
        notes: Option<String>,
        tags: Option<Vec<String>>,
        created_at: String,
        updated_at: String,
    }
    
    let export_configs: Vec<ExportConfig> = configs_vec.iter().map(|c| {
        ExportConfig {
            id: c.id.clone(),
            name: c.name.clone(),
            token: c.token.clone(),
            notes: c.notes.clone(),
            tags: c.tags.clone(),
            created_at: c.created_at.clone(),
            updated_at: c.updated_at.clone(),
        }
    }).collect();
    
    serde_json::to_string_pretty(&export_configs)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_configs(
    json_data: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    #[derive(serde::Deserialize)]
    struct ImportConfig {
        id: Option<String>,
        name: String,
        token: String,
        notes: Option<String>,
        tags: Option<Vec<String>>,
        created_at: Option<String>,
        updated_at: Option<String>,
    }
    
    let import_configs: Vec<ImportConfig> = serde_json::from_str(&json_data)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    let mut guard = configs.lock().await;
    
    let now = chrono::Utc::now().to_rfc3339();
    let mut count = 0;
    
    for ic in import_configs {
        let config = TunnelConfig {
            id: ic.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            name: ic.name,
            token: ic.token,
            notes: ic.notes,
            tags: ic.tags,
            created_at: ic.created_at.unwrap_or_else(|| now.clone()),
            updated_at: ic.updated_at.unwrap_or_else(|| now.clone()),
        };
        guard.insert(config.id.clone(), config);
        count += 1;
    }
    
    Ok(count)
}
