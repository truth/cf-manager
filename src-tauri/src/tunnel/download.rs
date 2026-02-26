use std::fs;
use std::path::PathBuf;
use thiserror::Error;

const CLOUDFLARED_LATEST_URL: &str = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
const CLOUDFLARED_VERSION_URL: &str =
    "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";

#[derive(Error, Debug)]
pub enum DownloadError {
    #[error("Failed to fetch version info: {0}")]
    VersionFetchError(String),
    #[error("Failed to download cloudflared: {0}")]
    DownloadError(String),
    #[error("Failed to save cloudflared: {0}")]
    SaveError(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub struct CloudflaredDownloader;

impl CloudflaredDownloader {
    /// Get the download URL for the current platform
    #[cfg(windows)]
    pub fn get_download_url() -> String {
        CLOUDFLARED_LATEST_URL.to_string()
    }

    #[cfg(not(windows))]
    pub fn get_download_url() -> String {
        // For non-Windows, construct URL based on platform
        #[cfg(target_os = "macos")]
        {
            "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz".to_string()
        }
        #[cfg(target_os = "linux")]
        {
            "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64".to_string()
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            CLOUDFLARED_LATEST_URL.to_string()
        }
    }

    /// Get the target binary name for the current platform
    #[cfg(windows)]
    pub fn get_binary_name() -> String {
        "cloudflared.exe".to_string()
    }

    #[cfg(not(windows))]
    pub fn get_binary_name() -> String {
        "cloudflared".to_string()
    }

    /// Get the default binaries directory
    pub fn get_binaries_dir() -> PathBuf {
        let mut path = std::env::current_exe().unwrap_or_default();
        path.pop(); // Remove executable name

        // If running from target/release, go up one level
        if path.file_name().map(|s| s == "release").unwrap_or(false) {
            path.pop();
        }

        path.join("binaries")
    }

    /// Download cloudflared to the specified directory
    pub fn download_to(dir: &PathBuf) -> Result<PathBuf, DownloadError> {
        let url = Self::get_download_url();
        let binary_name = Self::get_binary_name();

        // Create directory if not exists
        fs::create_dir_all(dir)?;

        let target_path = dir.join(&binary_name);

        // Skip download if file already exists
        if target_path.exists() {
            return Ok(target_path);
        }

        // Download the file
        let response = reqwest::blocking::get(&url)
            .map_err(|e| DownloadError::DownloadError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(DownloadError::DownloadError(format!(
                "HTTP error: {} - {}",
                response.status().as_u16(),
                response.status().canonical_reason().unwrap_or("Unknown")
            )));
        }

        // Save to file
        let bytes = response
            .bytes()
            .map_err(|e| DownloadError::DownloadError(e.to_string()))?;

        fs::write(&target_path, &bytes).map_err(|e| DownloadError::SaveError(e.to_string()))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&target_path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&target_path, perms)?;
        }

        Ok(target_path)
    }

    /// Try to download cloudflared to common locations
    pub fn download_to_common_locations() -> Option<PathBuf> {
        // Try multiple common locations
        let candidates = vec![
            Some(Self::get_binaries_dir()),
            std::env::current_dir()
                .ok()
                .map(|p| p.join("binaries")),
            std::env::current_dir()
                .ok()
                .map(|p| p.join("src-tauri").join("binaries")),
        ];

        for dir in candidates.into_iter().flatten() {
            match Self::download_to(&dir) {
                Ok(path) => {
                    tracing::info!("Downloaded cloudflared to: {:?}", path);
                    return Some(path);
                }
                Err(e) => {
                    tracing::warn!("Failed to download to {:?}: {}", dir, e);
                }
            }
        }

        None
    }
}
