use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::db::AppState;
use crate::settings::{self, AppSettings};
use crate::{
    activity, ai, conversations, memory, providers, search, secrets, system, tools, voice,
};

#[tauri::command]
pub fn app_info(handle: AppHandle, state: State<'_, AppState>) -> system::AppInfo {
    system::app_info(&handle, &state)
}

#[tauri::command]
pub async fn system_snapshot() -> Result<system::SystemSnapshot, String> {
    system::snapshot().await
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Result<AppSettings, String> {
    settings::get(&state)
}

#[tauri::command]
pub fn settings_save(state: State<'_, AppState>, settings: AppSettings) -> Result<AppSettings, String> {
    settings::update(&state, settings)
}

#[tauri::command]
pub fn providers_list(state: State<'_, AppState>) -> Result<Vec<providers::Provider>, String> {
    providers::list(&state)
}

#[tauri::command]
pub fn provider_save(state: State<'_, AppState>, input: providers::ProviderInput) -> Result<providers::Provider, String> {
    providers::save(&state, input)
}

#[tauri::command]
pub fn provider_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    providers::delete(&state, &id)
}

#[tauri::command]
pub fn provider_set_key(state: State<'_, AppState>, id: String, key: String) -> Result<providers::Provider, String> {
    providers::set_key(&state, &id, &key)
}

#[tauri::command]
pub fn provider_clear_key(state: State<'_, AppState>, id: String) -> Result<providers::Provider, String> {
    providers::clear_key(&state, &id)
}

#[tauri::command]
pub async fn provider_test(state: State<'_, AppState>, id: String) -> Result<providers::TestResult, String> {
    providers::test(&state, &id).await
}

#[tauri::command]
pub async fn chat_send(app: AppHandle, state: State<'_, AppState>, req: ai::ChatRequest) -> Result<ai::ChatResult, String> {
    ai::send(&app, &state, req).await
}

#[tauri::command]
pub async fn chat_continue(app: AppHandle, state: State<'_, AppState>, req: ai::ContinueRequest) -> Result<ai::ChatResult, String> {
    ai::continue_chat(&app, &state, req).await
}

#[tauri::command]
pub fn chat_cancel(state: State<'_, AppState>, request_id: String) {
    state.cancel_flag(&request_id).store(true, std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
pub fn conversations_list(state: State<'_, AppState>, query: Option<String>) -> Result<Vec<conversations::Conversation>, String> {
    conversations::list(&state, query)
}

#[tauri::command]
pub fn conversation_get(state: State<'_, AppState>, id: String) -> Result<conversations::ConversationDetail, String> {
    conversations::detail(&state, &id)
}

#[tauri::command]
pub fn conversation_add_message(state: State<'_, AppState>, conversation_id: String, role: String, content: String) -> Result<conversations::Message, String> {
    if role != "tool" && role != "assistant" {
        return Err("Only tool and assistant messages can be appended directly".into());
    }
    if content.trim().is_empty() {
        return Err("Message content is empty".into());
    }
    conversations::add_message(&state, &conversation_id, &role, content.trim(), None, None)
}

#[tauri::command]
pub fn conversation_create(state: State<'_, AppState>) -> Result<String, String> {
    conversations::ensure_conversation(&state, None)
}

#[tauri::command]
pub fn conversation_rename(state: State<'_, AppState>, id: String, title: String) -> Result<(), String> {
    conversations::rename(&state, &id, &title)
}

#[tauri::command]
pub fn conversation_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    conversations::delete(&state, &id)
}

#[tauri::command]
pub fn memory_list(state: State<'_, AppState>) -> Result<Vec<memory::Memory>, String> {
    memory::list(&state)
}

#[tauri::command]
pub fn memory_add(state: State<'_, AppState>, kind: String, content: String) -> Result<memory::Memory, String> {
    memory::add(&state, &kind, &content)
}

#[tauri::command]
pub fn memory_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    memory::delete(&state, &id)
}

#[tauri::command]
pub fn memory_toggle_pin(state: State<'_, AppState>, id: String) -> Result<(), String> {
    memory::toggle_pin(&state, &id)
}

#[tauri::command]
pub fn memory_clear(state: State<'_, AppState>) -> Result<(), String> {
    memory::clear(&state)
}

#[tauri::command]
pub fn automations_list(state: State<'_, AppState>) -> Result<Vec<memory::Automation>, String> {
    memory::automations(&state)
}

#[tauri::command]
pub fn automation_save(state: State<'_, AppState>, id: Option<String>, name: String, prompt: String) -> Result<memory::Automation, String> {
    memory::save_automation(&state, id, &name, &prompt)
}

#[tauri::command]
pub fn automation_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    memory::delete_automation(&state, &id)
}

#[tauri::command]
pub fn automation_mark_run(state: State<'_, AppState>, id: String) -> Result<(), String> {
    memory::mark_automation_run(&state, &id);
    Ok(())
}

#[tauri::command]
pub fn activity_list(state: State<'_, AppState>, limit: Option<i64>) -> Result<Vec<activity::ActivityEntry>, String> {
    activity::list(&state, limit.unwrap_or(40))
}

#[tauri::command]
pub fn activity_clear(state: State<'_, AppState>) -> Result<(), String> {
    activity::clear(&state)
}

#[tauri::command]
pub fn activity_counts(state: State<'_, AppState>) -> Result<Value, String> {
    activity::counts(&state)
}

#[tauri::command]
pub fn tools_list() -> Vec<tools::ToolInfo> {
    tools::catalog()
}

#[tauri::command]
pub async fn tool_run(state: State<'_, AppState>, tool: String, args: Value, reason: Option<String>) -> Result<tools::ToolOutcome, String> {
    tools::run(&state, &tool, args, reason.as_deref().unwrap_or("Requested from the command center")).await
}

#[tauri::command]
pub fn approvals_list(state: State<'_, AppState>) -> Result<Vec<tools::ApprovalRequest>, String> {
    tools::pending_approvals(&state)
}

#[tauri::command]
pub async fn approval_respond(state: State<'_, AppState>, id: String, approve: bool) -> Result<tools::ToolOutcome, String> {
    tools::respond_approval(&state, &id, approve).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHealth {
    pub provider: String,
    pub enabled: bool,
    pub has_key: bool,
    pub configured: bool,
}

#[tauri::command]
pub fn search_health(state: State<'_, AppState>) -> SearchHealth {
    let cfg = settings::load(&state);
    let provider = cfg.search.provider.clone();
    let has_key = if provider == "searxng" || provider == "none" {
        false
    } else {
        secrets::has(&secrets::search_account(&provider))
    };
    SearchHealth {
        configured: cfg.search.enabled && provider != "none" && (has_key || provider == "searxng"),
        provider,
        enabled: cfg.search.enabled,
        has_key,
    }
}

#[tauri::command]
pub fn search_set_key(state: State<'_, AppState>, provider: String, key: String) -> Result<(), String> {
    let cfg = settings::load(&state);
    let provider = if provider.is_empty() { cfg.search.provider } else { provider };
    if !["brave", "tavily", "searxng"].contains(&provider.as_str()) {
        return Err("Unknown search provider".into());
    }
    if provider == "searxng" {
        return Err("SearXNG does not use an API key.".into());
    }
    secrets::set(&secrets::search_account(&provider), key.trim())
}

#[tauri::command]
pub fn search_clear_key(_state: State<'_, AppState>, provider: String) -> Result<(), String> {
    secrets::delete(&secrets::search_account(&provider))
}

#[tauri::command]
pub async fn search_run(state: State<'_, AppState>, query: String) -> Result<Vec<search::SearchResult>, String> {
    search::run(&state, &query).await
}

#[tauri::command]
pub async fn voice_transcribe(state: State<'_, AppState>, audio_base64: String, mime: String) -> Result<String, String> {
    voice::transcribe(&state, &audio_base64, &mime).await
}

#[tauri::command]
pub fn voice_key_status() -> bool {
    voice::has_transcription_key()
}

#[tauri::command]
pub fn voice_set_key(key: String) -> Result<(), String> {
    voice::set_transcription_key(key.trim())
}

#[tauri::command]
pub fn voice_clear_key() -> Result<(), String> {
    voice::clear_transcription_key()
}

#[tauri::command]
pub fn open_data_folder(state: State<'_, AppState>) -> Result<(), String> {
    let path = state.data_dir.to_string_lossy().to_string();
    let mut cmd = std::process::Command::new("explorer");
    cmd.arg(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("Could not open the data folder: {e}"))
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Only http(s) links can be opened.".into());
    }
    if trimmed.len() > 2048 || trimmed.chars().any(|c| c.is_control() || c == '"' || c == ' ') {
        return Err("Invalid URL.".into());
    }
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/C", "start", "", trimmed]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("Could not open link: {e}"))
}
