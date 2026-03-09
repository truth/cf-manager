use std::collections::HashMap;
use std::sync::Arc as StdArc;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

use crate::commands::types::{LegacyTunnelConfig, TunnelConfig};
use crate::state::AppState;

const CONFIG_STORE_FILE: &str = "tunnels.json";
const CONFIG_STORE_KEY: &str = "configs";

fn load_configs_from_store(app: &AppHandle) -> Result<HashMap<String, TunnelConfig>, String> {
    let store = app
        .store(CONFIG_STORE_FILE)
        .map_err(|error| format!("Failed to open config store: {}", error))?;

    let Some(value) = store.get(CONFIG_STORE_KEY) else {
        return Ok(HashMap::new());
    };

    let configs: Vec<TunnelConfig> = match serde_json::from_value(value.clone()) {
        Ok(configs) => configs,
        Err(_) => {
            let legacy_configs: Vec<LegacyTunnelConfig> = serde_json::from_value(value.clone())
                .map_err(|error| format!("Failed to parse config store data: {}", error))?;

            legacy_configs
                .into_iter()
                .map(|config| TunnelConfig::Publish {
                    id: config.id,
                    name: config.name,
                    token: config.token,
                    hostname: None,
                    origin_url: None,
                    notes: config.notes,
                    tags: config.tags,
                    created_at: config.created_at,
                    updated_at: config.updated_at,
                })
                .collect()
        }
    };

    Ok(configs
        .into_iter()
        .map(|config| (config.id().to_string(), config))
        .collect())
}

fn persist_configs_to_store(
    app: &AppHandle,
    configs: &HashMap<String, TunnelConfig>,
) -> Result<(), String> {
    let store = app
        .store(CONFIG_STORE_FILE)
        .map_err(|error| format!("Failed to open config store: {}", error))?;

    let config_values: Vec<TunnelConfig> = configs.values().cloned().collect();
    let value = serde_json::to_value(&config_values)
        .map_err(|error| format!("Failed to serialize configs: {}", error))?;

    store.set(CONFIG_STORE_KEY.to_string(), value);
    store
        .save()
        .map_err(|error| format!("Failed to save config store: {}", error))
}

async fn sync_configs_from_store_if_needed(
    app: &AppHandle,
    configs: &StdArc<Mutex<HashMap<String, TunnelConfig>>>,
) -> Result<(), String> {
    let mut guard = configs.lock().await;
    if guard.is_empty() {
        *guard = load_configs_from_store(app)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_config(
    config: TunnelConfig,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    sync_configs_from_store_if_needed(&app, &configs).await?;

    let mut guard = configs.lock().await;
    guard.insert(config.id().to_string(), config);

    persist_configs_to_store(&app, &guard)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_config(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    sync_configs_from_store_if_needed(&app, &configs).await?;

    let mut guard = configs.lock().await;
    guard.remove(&id);

    persist_configs_to_store(&app, &guard)?;
    Ok(())
}

#[tauri::command]
pub async fn get_config(
    id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<TunnelConfig>, String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    sync_configs_from_store_if_needed(&app, &configs).await?;

    let guard = configs.lock().await;
    Ok(guard.get(&id).cloned())
}

#[tauri::command]
pub async fn list_tunnels(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<TunnelConfig>, String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    sync_configs_from_store_if_needed(&app, &configs).await?;

    let guard = configs.lock().await;
    Ok(guard.values().cloned().collect())
}

#[tauri::command]
pub async fn export_configs(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    sync_configs_from_store_if_needed(&app, &configs).await?;

    let guard = configs.lock().await;
    let config_values: Vec<TunnelConfig> = guard.values().cloned().collect();

    serde_json::to_string_pretty(&config_values).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_configs(
    json_data: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let import_configs: Vec<TunnelConfig> = match serde_json::from_str(&json_data) {
        Ok(configs) => configs,
        Err(_) => {
            let legacy_configs: Vec<LegacyTunnelConfig> = serde_json::from_str(&json_data)
                .map_err(|e| format!("Invalid JSON: {}", e))?;

            legacy_configs
                .into_iter()
                .map(|ic| TunnelConfig::Publish {
                    id: ic.id,
                    name: ic.name,
                    token: ic.token,
                    hostname: None,
                    origin_url: None,
                    notes: ic.notes,
                    tags: ic.tags,
                    created_at: ic.created_at,
                    updated_at: ic.updated_at,
                })
                .collect()
        }
    };

    let configs: StdArc<Mutex<HashMap<String, TunnelConfig>>> = state.configs.clone();
    sync_configs_from_store_if_needed(&app, &configs).await?;

    let mut guard = configs.lock().await;
    let mut count = 0;

    for config in import_configs {
        guard.insert(config.id().to_string(), config);
        count += 1;
    }

    persist_configs_to_store(&app, &guard)?;

    Ok(count)
}
