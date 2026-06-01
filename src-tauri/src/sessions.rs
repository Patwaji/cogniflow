use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn sessions_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME environment variable not set".to_string())?;
    let dir = PathBuf::from(home).join(".cogniflow").join("sessions");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create sessions directory: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub fn save_session(session_json: String) -> Result<String, String> {
    let dir = sessions_dir()?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis();
    let path = dir.join(format!("{}.json", timestamp));
    fs::write(&path, &session_json)
        .map_err(|e| format!("Failed to write session file: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_sessions() -> Result<Vec<String>, String> {
    let dir = sessions_dir()?;
    let mut paths: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map(|ext| ext == "json").unwrap_or(false))
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    paths.sort();
    paths.reverse();
    Ok(paths)
}

#[tauri::command]
pub fn load_session(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session file: {}", e))
}
