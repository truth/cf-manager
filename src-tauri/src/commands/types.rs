use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileType {
    Publish,
    Forward,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyTunnelConfig {
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
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TunnelConfig {
    Publish {
        id: String,
        name: String,
        token: String,
        #[serde(default)]
        hostname: Option<String>,
        #[serde(default)]
        origin_url: Option<String>,
        #[serde(default)]
        notes: Option<String>,
        #[serde(default)]
        tags: Option<Vec<String>>,
        created_at: String,
        updated_at: String,
    },
    Forward {
        id: String,
        name: String,
        target_hostname: String,
        local_bind_host: String,
        local_bind_port: u16,
        #[serde(default)]
        notes: Option<String>,
        #[serde(default)]
        tags: Option<Vec<String>>,
        created_at: String,
        updated_at: String,
    },
}

impl TunnelConfig {
    pub fn id(&self) -> &str {
        match self {
            Self::Publish { id, .. } | Self::Forward { id, .. } => id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            Self::Publish { name, .. } | Self::Forward { name, .. } => name,
        }
    }

    pub fn profile_type(&self) -> ProfileType {
        match self {
            Self::Publish { .. } => ProfileType::Publish,
            Self::Forward { .. } => ProfileType::Forward,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningTunnelStatus {
    pub tunnel_id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub profile_type: ProfileType,
    pub started_at: String,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub local_endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelStatus {
    pub running: bool,
    pub running_count: usize,
    pub tunnels: Vec<RunningTunnelStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflaredInfo {
    pub found: bool,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub ok: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub source: String,
}
