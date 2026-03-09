use crate::cloudflared::binary;
use crate::commands::types::CloudflaredInfo;

#[tauri::command]
pub async fn detect_cloudflared() -> Result<CloudflaredInfo, String> {
    Ok(binary::detect_cloudflared())
}
