use crate::commands::types::{ProfileType, TunnelConfig};

#[derive(Debug, Clone)]
pub struct LaunchPlan {
    pub program: String,
    pub args: Vec<String>,
    pub display: String,
    pub profile_type: ProfileType,
    pub target: Option<String>,
    pub local_endpoint: Option<String>,
}

pub fn build_launch_plan(config: &TunnelConfig, program: String) -> LaunchPlan {
    match config {
        TunnelConfig::Publish { token, hostname, .. } => LaunchPlan {
            display: format!("{} tunnel run --token <hidden>", program),
            args: vec![
                "tunnel".to_string(),
                "run".to_string(),
                "--token".to_string(),
                token.clone(),
            ],
            profile_type: ProfileType::Publish,
            target: hostname.clone(),
            local_endpoint: None,
            program,
        },
        TunnelConfig::Forward {
            target_hostname,
            local_bind_host,
            local_bind_port,
            ..
        } => {
            let url = format!("http://{}:{}", local_bind_host, local_bind_port);
            LaunchPlan {
                display: format!(
                    "{} access tcp --hostname {} --url {}",
                    program, target_hostname, url
                ),
                args: vec![
                    "access".to_string(),
                    "tcp".to_string(),
                    "--hostname".to_string(),
                    target_hostname.clone(),
                    "--url".to_string(),
                    url.clone(),
                ],
                profile_type: ProfileType::Forward,
                target: Some(target_hostname.clone()),
                local_endpoint: Some(format!("{}:{}", local_bind_host, local_bind_port)),
                program,
            }
        }
    }
}
