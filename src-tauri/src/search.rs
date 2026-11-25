use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::AppState;
use crate::secrets;
use crate::settings;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

pub async fn run(state: &AppState, query: &str) -> Result<Vec<SearchResult>, String> {
    let query = query.trim();
    if query.len() < 2 {
        return Err("Search query is too short.".into());
    }
    if query.chars().count() > 400 {
        return Err("Search query is too long.".into());
    }
    let cfg = settings::load(state);
    let search_cfg = &cfg.search;
    if !cfg.permissions.external_send {
        return Err("The \"external.send\" permission is disabled in Settings → Permissions.".into());
    }
    if !search_cfg.enabled || search_cfg.provider == "none" {
        return Err("No web search provider is configured. Add one in Integrations.".into());
    }
    let key = secrets::get(&secrets::search_account(&search_cfg.provider)).unwrap_or_default();
    let limit = search_cfg.max_results.clamp(1, 10) as usize;
    let client = &state.http;
    match search_cfg.provider.as_str() {
        "brave" => {
            if key.is_empty() {
                return Err("Brave Search API key is missing.".into());
            }
            let resp = client
                .get("https://api.search.brave.com/res/v1/web/search")
                .header("X-Subscription-Token", &key)
                .header("Accept", "application/json")
                .query(&[("q", query), ("count", &limit.to_string())])
                .timeout(std::time::Duration::from_secs(20))
                .send()
                .await
                .map_err(|e| format!("Search request failed: {e}"))?;
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(crate::providers::friendly_error(status.as_u16(), &body));
            }
            let v: Value = serde_json::from_str(&body).map_err(|_| "Search returned invalid JSON.".to_string())?;
            let items = v
                .pointer("/web/results")
                .and_then(|r| r.as_array())
                .cloned()
                .unwrap_or_default();
            Ok(items
                .into_iter()
                .take(limit)
                .filter_map(|item| {
                    Some(SearchResult {
                        title: item.get("title")?.as_str()?.to_string(),
                        url: item.get("url")?.as_str()?.to_string(),
                        snippet: item
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("")
                            .to_string(),
                    })
                })
                .collect())
        }
        "tavily" => {
            if key.is_empty() {
                return Err("Tavily API key is missing.".into());
            }
            let resp = client
                .post("https://api.tavily.com/search")
                .json(&json!({
                    "api_key": key,
                    "query": query,
                    "max_results": limit,
                    "include_answer": false
                }))
                .timeout(std::time::Duration::from_secs(25))
                .send()
                .await
                .map_err(|e| format!("Search request failed: {e}"))?;
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(crate::providers::friendly_error(status.as_u16(), &body));
            }
            let v: Value = serde_json::from_str(&body).map_err(|_| "Search returned invalid JSON.".to_string())?;
            let items = v.get("results").and_then(|r| r.as_array()).cloned().unwrap_or_default();
            Ok(items
                .into_iter()
                .take(limit)
                .filter_map(|item| {
                    Some(SearchResult {
                        title: item.get("title")?.as_str()?.to_string(),
                        url: item.get("url")?.as_str()?.to_string(),
                        snippet: item
                            .get("content")
                            .and_then(|d| d.as_str())
                            .unwrap_or("")
                            .chars()
                            .take(400)
                            .collect(),
                    })
                })
                .collect())
        }
        "searxng" => {
            let base = search_cfg.searx_url.trim().trim_end_matches('/');
            if base.is_empty() {
                return Err("SearXNG instance URL is missing.".into());
            }
            if !(base.starts_with("http://") || base.starts_with("https://")) {
                return Err("SearXNG URL must start with http:// or https://".into());
            }
            let resp = client
                .get(format!("{base}/search"))
                .query(&[("q", query), ("format", "json")])
                .timeout(std::time::Duration::from_secs(25))
                .send()
                .await
                .map_err(|e| format!("Search request failed: {e}"))?;
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(crate::providers::friendly_error(status.as_u16(), &body));
            }
            let v: Value = serde_json::from_str(&body).map_err(|_| "SearXNG returned invalid JSON (enable JSON output on the instance).".to_string())?;
            let items = v.get("results").and_then(|r| r.as_array()).cloned().unwrap_or_default();
            Ok(items
                .into_iter()
                .take(limit)
                .filter_map(|item| {
                    Some(SearchResult {
                        title: item.get("title")?.as_str()?.to_string(),
                        url: item.get("url")?.as_str()?.to_string(),
                        snippet: item
                            .get("content")
                            .and_then(|d| d.as_str())
                            .unwrap_or("")
                            .chars()
                            .take(400)
                            .collect(),
                    })
                })
                .collect())
        }
        other => Err(format!("Unknown search provider \"{other}\".")),
    }
}

