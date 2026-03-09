use crate::commands::types::CloudflaredInfo;
use crate::tunnel::download::CloudflaredDownloader;
use std::collections::HashSet;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct CloudflaredBinary {
    pub path: String,
    pub source: String,
    pub version: Option<String>,
}

fn candidate_paths() -> Vec<(String, String)> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    let mut push = |path: String, source: &str| {
        let key = path.to_lowercase();
        if !path.trim().is_empty() && seen.insert(key) {
            candidates.push((path, source.to_string()));
        }
    };

    if let Ok(path) = std::env::var("CLOUDFLARED_PATH") {
        push(path, "env");
    }

    push(".\\binaries\\cloudflared.exe".to_string(), "bundled");
    push(".\\src-tauri\\binaries\\cloudflared.exe".to_string(), "bundled");

    if let Ok(current_dir) = std::env::current_dir() {
        push(current_dir.join("binaries").join("cloudflared.exe").display().to_string(), "bundled");
        push(
            current_dir
                .join("src-tauri")
                .join("binaries")
                .join("cloudflared.exe")
                .display()
                .to_string(),
            "bundled",
        );
    }

    push("cloudflared".to_string(), "path");
    candidates
}

fn read_version(command_path: &str) -> Option<String> {
    let output = std::process::Command::new(command_path)
        .arg("--version")
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}

pub fn detect_cloudflared() -> CloudflaredInfo {
    for (path, source) in candidate_paths() {
        if let Some(version) = read_version(&path) {
            return CloudflaredInfo {
                found: true,
                path: Some(path),
                source: Some(source),
                version: Some(version),
            };
        }
    }

    CloudflaredInfo {
        found: false,
        path: None,
        source: None,
        version: None,
    }
}

pub fn resolve_cloudflared_binary(allow_download: bool) -> Option<CloudflaredBinary> {
    for (path, source) in candidate_paths() {
        if let Some(version) = read_version(&path) {
            return Some(CloudflaredBinary { path, source, version: Some(version) });
        }
    }

    if allow_download {
        let downloaded_path: Option<PathBuf> = CloudflaredDownloader::download_to_common_locations();
        if let Some(path) = downloaded_path {
            let path = path.to_string_lossy().to_string();
            return Some(CloudflaredBinary {
                version: read_version(&path),
                path,
                source: "downloaded".to_string(),
            });
        }
    }

    None
}
