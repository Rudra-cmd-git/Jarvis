use serde::{Deserialize, Serialize};

use crate::db::{new_id, now_iso, AppState};
use crate::secrets;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub timeout_ms: i64,
    pub temperature: f64,
    pub max_tokens: i64,
    pub created_at: String,
    pub has_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub timeout_ms: i64,
    pub temperature: f64,
    pub max_tokens: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub message: String,
    pub models: Vec<String>,
}

const KINDS: [&str; 3] = ["openai", "gemini", "custom"];

fn validate(input: &ProviderInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("Provider name is required".into());
    }
    if input.name.len() > 80 {
        return Err("Provider name is too long".into());
    }
    if !KINDS.contains(&input.kind.as_str()) {
        return Err("Unknown provider type".into());
    }
    if input.model.trim().is_empty() {
        return Err("Model ID is required".into());
    }
    let url = input.base_url.trim();
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Base URL must start with http:// or https://".into());
    }
    if !(1000..=600_000).contains(&input.timeout_ms) {
        return Err("Timeout must be between 1 and 600 seconds".into());
    }
    if !(0.0..=2.0).contains(&input.temperature) {
        return Err("Temperature must be between 0 and 2".into());
    }
    if !(16..=32_000).contains(&input.max_tokens) {
        return Err("Max tokens must be between 16 and 32000".into());
    }
    Ok(())
}

pub fn list(state: &AppState) -> Result<Vec<Provider>, String> {
    let conn = state.db.lock().expect("db lock");
    let mut stmt = conn
        .prepare(
            "SELECT id, name, kind, base_url, model, enabled, timeout_ms, temperature, max_tokens, created_at
             FROM providers ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Provider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                base_url: row.get(3)?,
                model: row.get(4)?,
                enabled: row.get::<_, i64>(5)? != 0,
                timeout_ms: row.get(6)?,
                temperature: row.get(7)?,
                max_tokens: row.get(8)?,
                created_at: row.get(9)?,
                has_key: false,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out: Vec<Provider> = rows.filter_map(|r| r.ok()).collect();
    drop(stmt);
    drop(conn);
    for p in out.iter_mut() {
        p.has_key = secrets::has(&secrets::provider_account(&p.id));
    }
    Ok(out)
}

pub fn get(state: &AppState, id: &str) -> Result<Provider, String> {
    list(state)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Provider not found".to_string())
}

pub fn save(state: &AppState, input: ProviderInput) -> Result<Provider, String> {
    validate(&input)?;
    let id = input.id.clone().unwrap_or_else(new_id);
    {
        let conn = state.db.lock().expect("db lock");
        conn.execute(
            "INSERT INTO providers (id, name, kind, base_url, model, enabled, timeout_ms, temperature, max_tokens, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, kind = excluded.kind, base_url = excluded.base_url,
                model = excluded.model, enabled = excluded.enabled, timeout_ms = excluded.timeout_ms,
                temperature = excluded.temperature, max_tokens = excluded.max_tokens",
            rusqlite::params![
                id,
                input.name.trim(),
                input.kind,
                input.base_url.trim().trim_end_matches('/'),
                input.model.trim(),
                if input.enabled { 1 } else { 0 },
                input.timeout_ms,
                input.temperature,
                input.max_tokens,
                now_iso()
            ],
        )
        .map_err(|e| format!("Could not save provider: {e}"))?;
    }
    get(state, &id)
}

pub fn delete(state: &AppState, id: &str) -> Result<(), String> {
    let mut settings = crate::settings::load(state);
    if settings.active_provider_id.as_deref() == Some(id) {
        settings.active_provider_id = None;
    }
    if settings.backup_provider_id.as_deref() == Some(id) {
        settings.backup_provider_id = None;
    }
    let _ = crate::settings::save(state, &settings);
    {
        let conn = state.db.lock().expect("db lock");
        conn.execute("DELETE FROM providers WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }
    secrets::delete(&secrets::provider_account(id))?;
    Ok(())
}

pub fn set_key(state: &AppState, id: &str, key: &str) -> Result<Provider, String> {
    get(state, id)?;
    secrets::set(&secrets::provider_account(id), key.trim())?;
    get(state, id)
}

pub fn clear_key(state: &AppState, id: &str) -> Result<Provider, String> {
    get(state, id)?;
    secrets::delete(&secrets::provider_account(id))?;
    get(state, id)
}

pub fn api_key(id: &str) -> Option<String> {
    secrets::get(&secrets::provider_account(id))
}

fn models_url(provider: &Provider) -> String {
    let base = provider.base_url.trim_end_matches('/');
    match provider.kind.as_str() {
        "gemini" => format!("{base}/models"),
        _ => format!("{base}/models"),
    }
}

pub async fn test(state: &AppState, id: &str) -> Result<TestResult, String> {
    let provider = get(state, id)?;
    let key = api_key(id).ok_or("No API key stored for this provider")?;
    let started = std::time::Instant::now();
    let url = models_url(&provider);
    let mut req = state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_millis(provider.timeout_ms.min(30_000) as u64));
    req = if provider.kind == "gemini" {
        req.header("x-goog-api-key", &key)
    } else {
        req.bearer_auth(&key)
    };
    let response = req.send().await;
    let latency_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Ok(TestResult {
                    ok: false,
                    latency_ms,
                    message: friendly_error(status.as_u16(), &body),
                    models: vec![],
                });
            }
            let mut models: Vec<String> = vec![];
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                let arr = json
                    .get("data")
                    .and_then(|v| v.as_array())
                    .or_else(|| json.get("models").and_then(|v| v.as_array()));
                if let Some(arr) = arr {
                    for item in arr.iter().take(50) {
                        let raw = item
                            .get("id")
                            .or_else(|| item.get("name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let name = raw.trim_start_matches("models/");
                        if !name.is_empty() {
                            models.push(name.to_string());
                        }
                    }
                }
            }
            Ok(TestResult {
                ok: true,
                latency_ms,
                message: format!("Connected — HTTP {}", status.as_u16()),
                models,
            })
        }
        Err(e) => Ok(TestResult {
            ok: false,
            latency_ms,
            message: if e.is_timeout() {
                "Connection timed out".into()
            } else if e.is_connect() {
                "Could not connect to the endpoint".into()
            } else {
                format!("Request failed: {e}")
            },
            models: vec![],
        }),
    }
}

pub fn friendly_error(status: u16, body: &str) -> String {
    let excerpt = body.chars().take(240).collect::<String>();
    match status {
        401 | 403 => "Authentication failed. Check the API key and its permissions.".into(),
        402 => "Quota exhausted or payment required for this API key.".into(),
        404 => format!("Endpoint not found (HTTP 404). {excerpt}"),
        429 => "Rate limit or quota exceeded. Try again later or switch providers.".into(),
        500..=599 => format!("Provider service error (HTTP {status}). {excerpt}"),
        _ => format!("Request failed (HTTP {status}). {excerpt}"),
    }
}
