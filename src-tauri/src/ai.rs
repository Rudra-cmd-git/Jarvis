use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::db::{record_activity, AppState};
use crate::providers::{self, Provider};
use crate::settings::{self, AppSettings};
use crate::{conversations, memory, tools};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub conversation_id: Option<String>,
    pub provider_id: Option<String>,
    pub content: String,
    pub request_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinueRequest {
    pub conversation_id: String,
    pub provider_id: Option<String>,
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRequest {
    pub tool: String,
    pub args: Value,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResult {
    pub conversation_id: String,
    pub message: conversations::Message,
    pub tool: Option<ToolCallRequest>,
    pub provider_name: String,
    pub model: String,
    pub fallback_used: bool,
}

struct StreamOutcome {
    text: String,
    provider: Provider,
    fallback_used: bool,
}

fn emit(app: &AppHandle, event: &str, payload: Value) {
    let _ = app.emit(event, payload);
}

fn system_prompt(state: &AppState, cfg: &AppSettings) -> String {
    let mut prompt = String::from(
        "You are JARVIS, a personal AI assistant running natively on the user's Windows PC. \
         You are precise, calm, capable and honest. Never claim you performed an action unless a tool result confirms it. \
         If a tool is unavailable, denied or fails, say so plainly. Keep normal answers focused and practical; \
         use short paragraphs and plain formatting. Current local time is ",
    );
    prompt.push_str(&chrono::Local::now().format("%Y-%m-%d %H:%M").to_string());
    prompt.push_str(".\n\n");
    prompt.push_str(&tools::catalog_for_prompt());
    if cfg.memory_enabled {
        let block = memory::prompt_block(state);
        if !block.is_empty() {
            prompt.push_str("\n\n");
            prompt.push_str(&block);
        }
    }
    prompt
}

fn provider_messages(state: &AppState, cfg: &AppSettings, conversation_id: &str) -> Vec<(String, String)> {
    let history = conversations::history(state, conversation_id, cfg.history_limit.max(2));
    let mut out = vec![("system".to_string(), system_prompt(state, cfg))];
    for (role, content) in history {
        let role = match role.as_str() {
            "user" => "user",
            "assistant" => "assistant",
            "tool" => "user",
            _ => "assistant",
        };
        let content = content;
        out.push((role.to_string(), content));
    }
    out
}

fn resolve_providers(state: &AppState, cfg: &AppSettings, explicit: Option<String>) -> Result<(Provider, Option<Provider>), String> {
    let all = providers::list(state)?;
    let chosen = explicit
        .filter(|id| !id.is_empty())
        .or_else(|| cfg.active_provider_id.clone());
    let primary = match chosen {
        Some(id) => all.iter().find(|p| p.id == id).cloned(),
        None => all.iter().find(|p| p.enabled).cloned(),
    }
    .ok_or_else(|| "No AI provider configured. Add a provider in Integrations.".to_string())?;
    if !primary.enabled {
        return Err(format!("Provider \"{}\" is disabled.", primary.name));
    }
    let backup = cfg
        .backup_provider_id
        .clone()
        .filter(|id| id != &primary.id)
        .and_then(|id| all.into_iter().find(|p| p.id == id && p.enabled));
    Ok((primary, backup))
}

pub async fn send(app: &AppHandle, state: &AppState, req: ChatRequest) -> Result<ChatResult, String> {
    let cfg = settings::load(state);
    let text = req.content.trim();
    if text.is_empty() {
        return Err("Message is empty".into());
    }
    if text.chars().count() > 20_000 {
        return Err("Message is too long (max 20,000 characters)".into());
    }
    let (primary, backup) = resolve_providers(state, &cfg, req.provider_id)?;
    let conversation_id = conversations::ensure_conversation(state, req.conversation_id)?;
    conversations::add_message(state, &conversation_id, "user", text, None, None)?;
    {
        let conn = state.db.lock().expect("db lock");
        record_activity(&conn, "chat", "Message sent", Some(&primary.name), "running");
    }
    emit(
        app,
        "chat:status",
        json!({ "requestId": req.request_id, "phase": "connecting", "provider": primary.name }),
    );
    let outcome = stream_with_fallback(app, state, &cfg, &req.request_id, &primary, backup.as_ref(), &conversation_id).await;
    finish(app, state, &req.request_id, conversation_id, outcome)
}

pub async fn continue_chat(app: &AppHandle, state: &AppState, req: ContinueRequest) -> Result<ChatResult, String> {
    let cfg = settings::load(state);
    let (primary, backup) = resolve_providers(state, &cfg, req.provider_id)?;
    emit(
        app,
        "chat:status",
        json!({ "requestId": req.request_id, "phase": "connecting", "provider": primary.name }),
    );
    let outcome = stream_with_fallback(app, state, &cfg, &req.request_id, &primary, backup.as_ref(), &req.conversation_id).await;
    finish(app, state, &req.request_id, req.conversation_id, outcome)
}

fn finish(
    app: &AppHandle,
    state: &AppState,
    request_id: &str,
    conversation_id: String,
    outcome: Result<StreamOutcome, String>,
) -> Result<ChatResult, String> {
    state.clear_cancel(request_id);
    match outcome {
        Ok(out) => {
            let message = conversations::add_message(
                state,
                &conversation_id,
                "assistant",
                out.text.trim(),
                Some(&out.provider.id),
                Some(&out.provider.model),
            )?;
            let tool = tools::extract_tool_call(&out.text);
            {
                let conn = state.db.lock().expect("db lock");
                record_activity(
                    &conn,
                    "chat",
                    "Response generated",
                    Some(&format!("{} · {}", out.provider.name, out.provider.model)),
                    "success",
                );
            }
            emit(
                app,
                "chat:status",
                json!({
                    "requestId": request_id,
                    "phase": "done",
                    "provider": out.provider.name,
                    "model": out.provider.model,
                    "fallbackUsed": out.fallback_used
                }),
            );
            Ok(ChatResult {
                conversation_id,
                message,
                tool,
                provider_name: out.provider.name,
                model: out.provider.model,
                fallback_used: out.fallback_used,
            })
        }
        Err(err) => {
            let conn = state.db.lock().expect("db lock");
            record_activity(&conn, "chat", "Request failed", Some(&err), "failed");
            drop(conn);
            emit(
                app,
                "chat:status",
                json!({ "requestId": request_id, "phase": "error", "detail": err }),
            );
            Err(err)
        }
    }
}

async fn stream_with_fallback(
    app: &AppHandle,
    state: &AppState,
    cfg: &AppSettings,
    request_id: &str,
    primary: &Provider,
    backup: Option<&Provider>,
    conversation_id: &str,
) -> Result<StreamOutcome, String> {
    let messages = provider_messages(state, cfg, conversation_id);
    let cancel = state.cancel_flag(request_id);
    let first = stream_provider(app, state, primary, &messages, request_id, cancel.clone()).await;
    match first {
        Ok(text) => Ok(StreamOutcome { text, provider: primary.clone(), fallback_used: false }),
        Err(err) => {
            if cancel.load(Ordering::SeqCst) {
                return Err("Request cancelled".into());
            }
            if let Some(backup) = backup {
                emit(
                    app,
                    "chat:status",
                    json!({
                        "requestId": request_id,
                        "phase": "fallback",
                        "provider": backup.name,
                        "detail": err
                    }),
                );
                let cancel2 = state.cancel_flag(request_id);
                let text = stream_provider(app, state, backup, &messages, request_id, cancel2).await?;
                Ok(StreamOutcome { text, provider: backup.clone(), fallback_used: true })
            } else {
                Err(err)
            }
        }
    }
}

async fn stream_provider(
    app: &AppHandle,
    state: &AppState,
    provider: &Provider,
    messages: &[(String, String)],
    request_id: &str,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    let key = providers::api_key(&provider.id)
        .ok_or_else(|| format!("{} has no API key. Add one in Integrations.", provider.name))?;
    let mut text = String::new();
    if provider.kind == "gemini" {
        stream_gemini(app, state, provider, messages, request_id, &key, &cancel, &mut text).await?;
    } else {
        stream_openai(app, state, provider, messages, request_id, &key, &cancel, &mut text).await?;
    }
    if cancel.load(Ordering::SeqCst) {
        return Err("Request cancelled".into());
    }
    if text.trim().is_empty() {
        return Err("The provider returned an empty response.".into());
    }
    Ok(text)
}

fn map_chunk(app: &AppHandle, request_id: &str, delta: &str, text: &mut String) {
    if delta.is_empty() {
        return;
    }
    text.push_str(delta);
    emit(app, "chat:delta", json!({ "requestId": request_id, "text": delta }));
}

async fn stream_openai(
    app: &AppHandle,
    state: &AppState,
    provider: &Provider,
    messages: &[(String, String)],
    request_id: &str,
    key: &str,
    cancel: &Arc<AtomicBool>,
    out: &mut String,
) -> Result<(), String> {
    let url = format!("{}/chat/completions", provider.base_url.trim_end_matches('/'));
    let body = json!({
        "model": provider.model,
        "messages": messages.iter().map(|(r, c)| json!({ "role": r, "content": c })).collect::<Vec<_>>(),
        "stream": true,
        "temperature": provider.temperature,
        "max_tokens": provider.max_tokens
    });
    let resp = state
        .http
        .post(&url)
        .bearer_auth(key)
        .timeout(Duration::from_millis(provider.timeout_ms as u64))
        .json(&body)
        .send()
        .await
        .map_err(|e| describe_net_error(e))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(providers::friendly_error(status, &body));
    }
    stream_sse(resp, cancel, provider.timeout_ms as u64, |data| {
        if data == "[DONE]" {
            return Ok(false);
        }
        if let Ok(v) = serde_json::from_str::<Value>(data) {
            if let Some(delta) = v
                .pointer("/choices/0/delta/content")
                .and_then(|c| c.as_str())
            {
                map_chunk(app, request_id, delta, out);
            }
        }
        Ok(true)
    })
    .await
}

async fn stream_gemini(
    app: &AppHandle,
    state: &AppState,
    provider: &Provider,
    messages: &[(String, String)],
    request_id: &str,
    key: &str,
    cancel: &Arc<AtomicBool>,
    out: &mut String,
) -> Result<(), String> {
    let base = provider.base_url.trim_end_matches('/');
    let model = provider.model.trim_start_matches("models/");
    let url = format!("{base}/models/{model}:streamGenerateContent?alt=sse");
    let system_text = messages
        .iter()
        .find(|(r, _)| r == "system")
        .map(|(_, c)| c.clone())
        .unwrap_or_default();
    let contents: Vec<Value> = messages
        .iter()
        .filter(|(r, _)| r != "system")
        .map(|(role, content)| {
            json!({
                "role": if role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": content }]
            })
        })
        .collect();
    let body = json!({
        "systemInstruction": { "parts": [{ "text": system_text }] },
        "contents": contents,
        "generationConfig": {
            "temperature": provider.temperature,
            "maxOutputTokens": provider.max_tokens
        }
    });
    let resp = state
        .http
        .post(&url)
        .header("x-goog-api-key", key)
        .timeout(Duration::from_millis(provider.timeout_ms as u64))
        .json(&body)
        .send()
        .await
        .map_err(|e| describe_net_error(e))?;
    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(providers::friendly_error(status, &body));
    }
    stream_sse(resp, cancel, provider.timeout_ms as u64, |data| {
        if let Ok(v) = serde_json::from_str::<Value>(data) {
            if let Some(parts) = v
                .pointer("/candidates/0/content/parts")
                .and_then(|p| p.as_array())
            {
                for part in parts {
                    if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                        map_chunk(app, request_id, t, out);
                    }
                }
            }
        }
        Ok(true)
    })
    .await
}

fn describe_net_error(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "Request timed out. Check the endpoint or raise the provider timeout.".into()
    } else if e.is_connect() {
        "Could not connect to the provider endpoint.".into()
    } else {
        format!("Network request failed: {e}")
    }
}

async fn stream_sse<F>(
    resp: reqwest::Response,
    cancel: &Arc<AtomicBool>,
    timeout_ms: u64,
    mut on_data: F,
) -> Result<(), String>
where
    F: FnMut(&str) -> Result<bool, String>,
{
    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    let idle = Duration::from_millis(timeout_ms.clamp(5_000, 600_000));
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("Request cancelled".into());
        }
        let next = match tokio::time::timeout(idle, stream.next()).await {
            Ok(chunk) => chunk,
            Err(_) => {
                return Err(
                    "The provider stopped sending data before the response finished. Check the endpoint or raise its timeout."
                        .into(),
                )
            }
        };
        let Some(chunk) = next else { break };
        let bytes = chunk.map_err(|e| format!("Stream interrupted: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_string();
            buffer.drain(..=pos);
            if let Some(data) = line.strip_prefix("data:") {
                let data = data.trim();
                if data.is_empty() {
                    continue;
                }
                if !on_data(data)? {
                    return Ok(());
                }
            }
        }
    }
    Ok(())
}
