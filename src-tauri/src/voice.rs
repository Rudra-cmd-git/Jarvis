use base64::Engine;
use serde_json::Value;

use crate::db::AppState;
use crate::settings;
use crate::secrets;

pub const VOICE_ACCOUNT: &str = "voice.stt";

pub fn has_transcription_key() -> bool {
    secrets::has(VOICE_ACCOUNT)
}

pub fn set_transcription_key(key: &str) -> Result<(), String> {
    secrets::set(VOICE_ACCOUNT, key)
}

pub fn clear_transcription_key() -> Result<(), String> {
    secrets::delete(VOICE_ACCOUNT)
}

pub async fn transcribe(state: &AppState, audio_base64: &str, mime: &str) -> Result<String, String> {
    let cfg = settings::load(state);
    let url = cfg.voice.whisper_url.trim();
    if url.is_empty() {
        return Err("No speech-to-text endpoint configured. Set one in Settings → Voice.".into());
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Speech-to-text endpoint must be an http(s) URL.".into());
    }
    let cleaned: String = audio_base64
        .split(',')
        .last()
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if cleaned.len() > 40 * 1024 * 1024 {
        return Err("Recording is too large (max ~30 MB).".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cleaned.as_bytes())
        .map_err(|_| "Audio payload is not valid base64.".to_string())?;
    if bytes.len() < 1200 {
        return Err("Recording was empty or too short.".into());
    }
    let mime = if mime.starts_with("audio/") { mime } else { "audio/webm" };
    let ext = if mime.contains("wav") { "wav" } else if mime.contains("mp4") || mime.contains("m4a") { "m4a" } else { "webm" };
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(format!("speech.{ext}"))
        .mime_str(mime)
        .map_err(|e| e.to_string())?;
    let mut form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", cfg.voice.whisper_model.clone())
        .text("response_format", "json");
    if !cfg.voice.language.is_empty() {
        form = form.text("language", cfg.voice.language.split('-').next().unwrap_or("en").to_string());
    }
    let mut req = state
        .http
        .post(url)
        .timeout(std::time::Duration::from_secs(90))
        .multipart(form);
    if let Some(key) = secrets::get(VOICE_ACCOUNT) {
        req = req.bearer_auth(key);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Could not reach the speech-to-text endpoint. Is the local server running?".to_string()
            } else if e.is_timeout() {
                "Speech-to-text request timed out.".to_string()
            } else {
                format!("Speech-to-text request failed: {e}")
            }
        })?;
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(crate::providers::friendly_error(status.as_u16(), &body));
    }
    match serde_json::from_str::<Value>(&body) {
        Ok(v) => {
            let text = v
                .get("text")
                .and_then(|t| t.as_str())
                .or_else(|| v.get("transcription").and_then(|t| t.as_str()))
                .unwrap_or("")
                .trim()
                .to_string();
            if text.is_empty() {
                return Err("The speech service returned no text.".into());
            }
            Ok(text)
        }
        Err(_) => {
            let text = body.trim();
            if text.is_empty() {
                Err("The speech service returned an empty response.".into())
            } else {
                Ok(text.to_string())
            }
        }
    }
}
