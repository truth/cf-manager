use crate::commands::tunnel::TunnelConfig;
use crate::commands::types::LogEntry;
use crate::tunnel::TunnelManager;
use std::collections::HashMap;
use std::sync::Arc as StdArc;
use tokio::sync::Mutex;

pub struct AppState {
    pub tunnel_manager: StdArc<Mutex<TunnelManager>>,
    pub configs: StdArc<Mutex<HashMap<String, TunnelConfig>>>,
    pub logs: StdArc<Mutex<Vec<LogEntry>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            tunnel_manager: StdArc::new(Mutex::new(TunnelManager::new())),
            configs: StdArc::new(Mutex::new(HashMap::new())),
            logs: StdArc::new(Mutex::new(Vec::new())),
        }
    }
}
