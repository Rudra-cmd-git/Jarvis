use serde::Serialize;

use crate::db::{new_id, now_iso, record_activity, AppState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    pub kind: String,
    pub content: String,
    pub created_at: String,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Automation {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub created_at: String,
    pub last_run_at: Option<String>,
}

pub fn list(state: &AppState) -> Result<Vec<Memory>, String> {
    let conn = state.db.lock().expect("db lock");
    let mut stmt = conn
        .prepare("SELECT id, kind, content, created_at, pinned FROM memories ORDER BY pinned DESC, created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Memory {
                id: row.get(0)?,
                kind: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
                pinned: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn add(state: &AppState, kind: &str, content: &str) -> Result<Memory, String> {
    let content = content.trim();
    if content.is_empty() {
        return Err("Memory content cannot be empty".into());
    }
    if content.len() > 4000 {
        return Err("Memory content is too long (max 4000 characters)".into());
    }
    if !["preference", "fact", "note"].contains(&kind) {
        return Err("Unknown memory kind".into());
    }
    let id = new_id();
    let created = now_iso();
    let conn = state.db.lock().expect("db lock");
    conn.execute(
        "INSERT INTO memories (id, kind, content, created_at, pinned) VALUES (?1, ?2, ?3, ?4, 0)",
        rusqlite::params![id, kind, content, created],
    )
    .map_err(|e| format!("Could not save memory: {e}"))?;
    record_activity(&conn, "memory", "Memory saved", Some(kind), "success");
    Ok(Memory {
        id,
        kind: kind.into(),
        content: content.into(),
        created_at: created,
        pinned: false,
    })
}

pub fn delete(state: &AppState, id: &str) -> Result<(), String> {
    let conn = state.db.lock().expect("db lock");
    let changed = conn
        .execute("DELETE FROM memories WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Memory not found".into());
    }
    record_activity(&conn, "memory", "Memory deleted", None, "success");
    Ok(())
}

pub fn toggle_pin(state: &AppState, id: &str) -> Result<(), String> {
    let conn = state.db.lock().expect("db lock");
    conn.execute(
        "UPDATE memories SET pinned = CASE pinned WHEN 0 THEN 1 ELSE 0 END WHERE id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear(state: &AppState) -> Result<(), String> {
    let conn = state.db.lock().expect("db lock");
    conn.execute("DELETE FROM memories", []).map_err(|e| e.to_string())?;
    record_activity(&conn, "memory", "All memories cleared", None, "success");
    Ok(())
}

pub fn prompt_block(state: &AppState) -> String {
    let items = match list(state) {
        Ok(v) => v,
        Err(_) => return String::new(),
    };
    if items.is_empty() {
        return String::new();
    }
    let mut out = String::from("User-approved memories (use only when relevant):\n");
    for m in items.iter().take(40) {
        out.push_str(&format!("- [{}] {}\n", m.kind, m.content.replace('\n', " ")));
    }
    out
}

pub fn automations(state: &AppState) -> Result<Vec<Automation>, String> {
    let conn = state.db.lock().expect("db lock");
    let mut stmt = conn
        .prepare("SELECT id, name, prompt, created_at, last_run_at FROM automations ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Automation {
                id: row.get(0)?,
                name: row.get(1)?,
                prompt: row.get(2)?,
                created_at: row.get(3)?,
                last_run_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn save_automation(state: &AppState, id: Option<String>, name: &str, prompt: &str) -> Result<Automation, String> {
    let name = name.trim();
    let prompt = prompt.trim();
    if name.is_empty() || prompt.is_empty() {
        return Err("Automation name and prompt are required".into());
    }
    if name.len() > 80 || prompt.len() > 4000 {
        return Err("Automation is too long".into());
    }
    let id = id.unwrap_or_else(new_id);
    let created = now_iso();
    {
        let conn = state.db.lock().expect("db lock");
        conn.execute(
            "INSERT INTO automations (id, name, prompt, created_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, prompt = excluded.prompt",
            rusqlite::params![id, name, prompt, created],
        )
        .map_err(|e| e.to_string())?;
    }
    let all = automations(state)?;
    all.into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| "Automation not found".into())
}

pub fn delete_automation(state: &AppState, id: &str) -> Result<(), String> {
    let conn = state.db.lock().expect("db lock");
    conn.execute("DELETE FROM automations WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn mark_automation_run(state: &AppState, id: &str) {
    let conn = state.db.lock().expect("db lock");
    let _ = conn.execute(
        "UPDATE automations SET last_run_at = ?1 WHERE id = ?2",
        rusqlite::params![now_iso(), id],
    );
}
