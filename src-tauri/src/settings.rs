use serde::{Deserialize, Serialize};

use crate::db::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Permissions {
    pub apps_launch: bool,
    pub web_open: bool,
    pub files_read: bool,
    pub files_search: bool,
    pub notes_write: bool,
    pub notes_delete: bool,
    pub system_info: bool,
    pub external_send: bool,
}

impl Default for Permissions {
    fn default() -> Self {
        Self {
            apps_launch: true,
            web_open: true,
            files_read: false,
            files_search: false,
            notes_write: true,
            notes_delete: false,
            system_info: true,
            external_send: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct VoiceSettings {
    pub tts_enabled: bool,
    pub auto_speak: bool,
    pub rate: f32,
    pub pitch: f32,
    pub voice: String,
    pub stt_mode: String,
    pub whisper_url: String,
    pub whisper_model: String,
    pub language: String,
}

impl Default for VoiceSettings {
    fn default() -> Self {
        Self {
            tts_enabled: true,
            auto_speak: false,
            rate: 1.0,
            pitch: 1.0,
            voice: String::new(),
            stt_mode: "auto".into(),
            whisper_url: "http://127.0.0.1:8080/v1/audio/transcriptions".into(),
            whisper_model: "whisper-1".into(),
            language: "en-US".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchSettings {
    pub provider: String,
    pub searx_url: String,
    pub max_results: u32,
    pub enabled: bool,
}

impl Default for SearchSettings {
    fn default() -> Self {
        Self {
            provider: "none".into(),
            searx_url: String::new(),
            max_results: 5,
            enabled: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: String,
    pub accent: String,
    pub reduced_motion: bool,
    pub memory_enabled: bool,
    pub notifications: bool,
    pub startup_view: String,
    pub history_limit: i64,
    pub require_approvals: bool,
    pub active_provider_id: Option<String>,
    pub backup_provider_id: Option<String>,
    pub permissions: Permissions,
    pub voice: VoiceSettings,
    pub search: SearchSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "midnight".into(),
            accent: "cyan".into(),
            reduced_motion: false,
            memory_enabled: true,
            notifications: true,
            startup_view: "dashboard".into(),
            history_limit: 20,
            require_approvals: true,
            active_provider_id: None,
            backup_provider_id: None,
            permissions: Permissions::default(),
            voice: VoiceSettings::default(),
            search: SearchSettings::default(),
        }
    }
}

impl AppSettings {
    pub fn sanitize(mut self) -> Self {
        let allowed_themes = ["midnight", "abyss", "graphite"];
        if !allowed_themes.contains(&self.theme.as_str()) {
            self.theme = "midnight".into();
        }
        let allowed_accents = ["cyan", "azure", "amber"];
        if !allowed_accents.contains(&self.accent.as_str()) {
            self.accent = "cyan".into();
        }
        let allowed_views = [
            "dashboard",
            "chat",
            "conversations",
            "memory",
            "tools",
            "automations",
            "integrations",
            "settings",
        ];
        if !allowed_views.contains(&self.startup_view.as_str()) {
            self.startup_view = "dashboard".into();
        }
        self.history_limit = self.history_limit.clamp(2, 60);
        self.voice.rate = self.voice.rate.clamp(0.5, 2.0);
        self.voice.pitch = self.voice.pitch.clamp(0.5, 2.0);
        if !["auto", "web", "whisper"].contains(&self.voice.stt_mode.as_str()) {
            self.voice.stt_mode = "auto".into();
        }
        self.search.max_results = self.search.max_results.clamp(1, 10);
        if !["none", "brave", "tavily", "searxng"].contains(&self.search.provider.as_str()) {
            self.search.provider = "none".into();
        }
        self
    }
}

pub fn load(state: &AppState) -> AppSettings {
    let conn = state.db.lock().expect("db lock");
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'app'", [], |row| row.get(0))
        .ok();
    match raw.and_then(|r| serde_json::from_str::<AppSettings>(&r).ok()) {
        Some(s) => s.sanitize(),
        None => AppSettings::default(),
    }
}

pub fn save(state: &AppState, settings: &AppSettings) -> Result<AppSettings, String> {
    let sanitized = settings.clone().sanitize();
    let json = serde_json::to_string(&sanitized).map_err(|e| e.to_string())?;
    let conn = state.db.lock().expect("db lock");
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('app', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [json],
    )
    .map_err(|e| format!("Could not save settings: {e}"))?;
    Ok(sanitized)
}

pub fn get(state: &AppState) -> Result<AppSettings, String> {
    Ok(load(state))
}

pub fn update(state: &AppState, new: AppSettings) -> Result<AppSettings, String> {
    save(state, &new)
}

pub fn permission_enabled(settings: &AppSettings, permission: &str) -> bool {
    let p = &settings.permissions;
    match permission {
        "apps.launch" => p.apps_launch,
        "web.open" => p.web_open,
        "files.read" => p.files_read,
        "files.search" => p.files_search,
        "notes.write" => p.notes_write,
        "notes.delete" => p.notes_delete,
        "system.info" => p.system_info,
        "external.send" => p.external_send,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_out_of_range_values() {
        let mut s = AppSettings::default();
        s.history_limit = 9999;
        s.theme = "neon".into();
        s.search.max_results = 99;
        s.voice.rate = 9.0;
        let s = s.sanitize();
        assert_eq!(s.history_limit, 60);
        assert_eq!(s.theme, "midnight");
        assert_eq!(s.search.max_results, 10);
        assert_eq!(s.voice.rate, 2.0);
    }
}
