use serde::Serialize;

use crate::db::{new_id, now_iso, record_activity, AppState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub provider_id: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub message_count: i64,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDetail {
    pub conversation: Conversation,
    pub messages: Vec<Message>,
}

fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        message_count: row.get(4)?,
        preview: row.get(5)?,
    })
}

pub fn list(state: &AppState, query: Option<String>) -> Result<Vec<Conversation>, String> {
    let conn = state.db.lock().expect("db lock");
    let q = query.unwrap_or_default().trim().to_string();
    let like = format!("%{q}%");
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.title, c.created_at, c.updated_at,
                    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id),
                    COALESCE((SELECT m.content FROM messages m WHERE m.conversation_id = c.id
                              ORDER BY m.created_at DESC LIMIT 1), '')
             FROM conversations c
             WHERE ?1 = '' OR c.title LIKE ?2
                OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ?2)
             ORDER BY c.updated_at DESC
             LIMIT 200",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![q, like], map_conversation)
        .map_err(|e| e.to_string())?;
    let mut out: Vec<Conversation> = rows.filter_map(|r| r.ok()).collect();
    for c in out.iter_mut() {
        c.preview = c.preview.chars().take(140).collect();
    }
    Ok(out)
}

pub fn ensure_conversation(state: &AppState, id: Option<String>) -> Result<String, String> {
    if let Some(id) = id {
        if !id.is_empty() {
            let conn = state.db.lock().expect("db lock");
            let exists: i64 = conn
                .query_row("SELECT COUNT(*) FROM conversations WHERE id = ?1", [&id], |r| r.get(0))
                .unwrap_or(0);
            drop(conn);
            if exists > 0 {
                return Ok(id);
            }
        }
    }
    let conv_id = new_id();
    let conn = state.db.lock().expect("db lock");
    let now = now_iso();
    conn.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, 'New conversation', ?2, ?2)",
        rusqlite::params![conv_id, now],
    )
    .map_err(|e| format!("Could not create conversation: {e}"))?;
    Ok(conv_id)
}

pub fn detail(state: &AppState, id: &str) -> Result<ConversationDetail, String> {
    let conn = state.db.lock().expect("db lock");
    let conversation = conn
        .query_row(
            "SELECT c.id, c.title, c.created_at, c.updated_at,
                    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id),
                    COALESCE((SELECT m.content FROM messages m WHERE m.conversation_id = c.id
                              ORDER BY m.created_at DESC LIMIT 1), '')
             FROM conversations c WHERE c.id = ?1",
            [id],
            map_conversation,
        )
        .map_err(|_| "Conversation not found".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, created_at, provider_id, model
             FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC LIMIT 500",
        )
        .map_err(|e| e.to_string())?;
    let messages = stmt
        .query_map([id], |row| {
            Ok(Message {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                provider_id: row.get(5)?,
                model: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(ConversationDetail { conversation, messages })
}

pub fn rename(state: &AppState, id: &str, title: &str) -> Result<(), String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err("Title cannot be empty".into());
    }
    let conn = state.db.lock().expect("db lock");
    let changed = conn
        .execute(
            "UPDATE conversations SET title = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![trimmed.chars().take(120).collect::<String>(), now_iso(), id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Conversation not found".into());
    }
    Ok(())
}

pub fn delete(state: &AppState, id: &str) -> Result<(), String> {
    let conn = state.db.lock().expect("db lock");
    conn.execute("DELETE FROM messages WHERE conversation_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    let changed = conn
        .execute("DELETE FROM conversations WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Conversation not found".into());
    }
    record_activity(&conn, "memory", "Conversation deleted", Some("Local conversation history removed"), "success");
    Ok(())
}

pub fn add_message(
    state: &AppState,
    conversation_id: &str,
    role: &str,
    content: &str,
    provider_id: Option<&str>,
    model: Option<&str>,
) -> Result<Message, String> {
    let id = new_id();
    let created = now_iso();
    let conn = state.db.lock().expect("db lock");
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at, provider_id, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, conversation_id, role, content, created, provider_id, model],
    )
    .map_err(|e| format!("Could not save message: {e}"))?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM messages WHERE conversation_id = ?1",
            [conversation_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if role == "user" && count <= 1 {
        let title: String = content.trim().chars().take(60).collect();
        let title = if title.is_empty() { "New conversation".to_string() } else { title };
        let _ = conn.execute(
            "UPDATE conversations SET title = ?1 WHERE id = ?2",
            rusqlite::params![title, conversation_id],
        );
    }
    let _ = conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![created, conversation_id],
    );
    Ok(Message {
        id,
        conversation_id: conversation_id.into(),
        role: role.into(),
        content: content.into(),
        created_at: created,
        provider_id: provider_id.map(|s| s.into()),
        model: model.map(|s| s.into()),
    })
}

pub fn history(state: &AppState, conversation_id: &str, limit: i64) -> Vec<(String, String)> {
    let conn = state.db.lock().expect("db lock");
    let mut stmt = match conn.prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY created_at DESC LIMIT ?2",
    ) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let rows = match stmt.query_map(rusqlite::params![conversation_id, limit], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    }) {
        Ok(rows) => rows,
        Err(_) => return vec![],
    };
    let mut out: Vec<(String, String)> = rows.filter_map(|r| r.ok()).collect();
    out.reverse();
    out
}

