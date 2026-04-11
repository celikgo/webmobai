use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerState {
    pub running: bool,
    pub port: u16,
    pub pid: Option<u32>,
}

pub struct AppState {
    pub mcp_server: Mutex<McpServerState>,
}

#[tauri::command]
fn get_mcp_status(state: State<AppState>) -> McpServerState {
    state.mcp_server.lock().unwrap().clone()
}

#[tauri::command]
fn set_mcp_status(state: State<AppState>, running: bool, port: u16, pid: Option<u32>) {
    let mut server = state.mcp_server.lock().unwrap();
    server.running = running;
    server.port = port;
    server.pid = pid;
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! WebMobAI is ready.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            mcp_server: Mutex::new(McpServerState {
                running: false,
                port: 3100,
                pid: None,
            }),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_mcp_status,
            set_mcp_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
