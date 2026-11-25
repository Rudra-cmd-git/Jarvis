mod activity;
mod ai;
mod commands;
mod conversations;
mod db;
mod memory;
mod providers;
mod search;
mod secrets;
mod settings;
mod system;
mod tools;
mod voice;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::open(&data_dir.join("jarvis.db"))
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            let state = db::AppState {
                db: Mutex::new(conn),
                http: reqwest::Client::builder()
                    .user_agent("JARVIS/0.1 (Windows desktop assistant)")
                    .build()?,
                data_dir,
                cancel: Mutex::new(std::collections::HashMap::new()),
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::system_snapshot,
            commands::settings_get,
            commands::settings_save,
            commands::providers_list,
            commands::provider_save,
            commands::provider_delete,
            commands::provider_set_key,
            commands::provider_clear_key,
            commands::provider_test,
            commands::chat_send,
            commands::chat_continue,
            commands::chat_cancel,
            commands::conversations_list,
            commands::conversation_get,
            commands::conversation_create,
            commands::conversation_rename,
            commands::conversation_delete,
            commands::conversation_add_message,
            commands::memory_list,
            commands::memory_add,
            commands::memory_delete,
            commands::memory_toggle_pin,
            commands::memory_clear,
            commands::automations_list,
            commands::automation_save,
            commands::automation_delete,
            commands::automation_mark_run,
            commands::activity_list,
            commands::activity_clear,
            commands::activity_counts,
            commands::tools_list,
            commands::tool_run,
            commands::approvals_list,
            commands::approval_respond,
            commands::search_health,
            commands::search_set_key,
            commands::search_clear_key,
            commands::search_run,
            commands::voice_transcribe,
            commands::voice_key_status,
            commands::voice_set_key,
            commands::voice_clear_key,
            commands::open_data_folder,
            commands::open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running JARVIS");
}
