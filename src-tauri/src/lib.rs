mod sessions;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let open = MenuItemBuilder::new("Open CogniFlow")
                .id("open")
                .build(app)?;
            let score = MenuItemBuilder::new("Current Score: --")
                .id("score")
                .enabled(false)
                .build(app)?;
            let quit = MenuItemBuilder::new("Quit").id("quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&open)
                .item(&score)
                .separator()
                .item(&quit)
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sessions::save_session,
            sessions::list_sessions,
            sessions::load_session,
            update_tray_score,
            trigger_notification,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn update_tray_score(app: tauri::AppHandle, score: u32) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray not found")?;

    let open = MenuItemBuilder::new("Open CogniFlow")
        .id("open")
        .build(&app)
        .map_err(|e| e.to_string())?;
    let score_item = MenuItemBuilder::new(format!("Current Score: {}", score))
        .id("score")
        .enabled(false)
        .build(&app)
        .map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::new("Quit")
        .id("quit")
        .build(&app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(&app)
        .item(&open)
        .item(&score_item)
        .separator()
        .item(&quit)
        .build()
        .map_err(|e| e.to_string())?;

    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

#[tauri::command]
fn trigger_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}
