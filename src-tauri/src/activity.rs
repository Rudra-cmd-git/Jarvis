use serde::Serialize;

use crate::db::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: Option<String>,
    pub status: String,
    pub created_at: String,
}

pub fn list(state: &AppState, limit: i64) -> Result<Vec<ActivityEntry>, String> {
    let conn = state.db.lock().expect("db lock");
    let mut stmt = conn
        .prepare("SELECT id, kind, title, detail, status, created_at FROM activity ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([limit.clamp(1, 200)], |r| {
            Ok(ActivityEntry {
                id: r.get(0)?,
                kind: r.get(1)?,
                title: r.get(2)?,
                detail: r.get(3)?,
                status: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn clear(state: &AppState) -> Result<(), String> {
    let conn = state.db.lock().expect("db lock");
    conn.execute("DELETE FROM activity", []).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn counts(state: &AppState) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().expect("db lock");
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM activity", [], |r| r.get(0)).unwrap_or(0);
    let failed: i64 = conn
        .query_row("SELECT COUNT(*) FROM activity WHERE status = 'failed'", [], |r| r.get(0))
        .unwrap_or(0);
    let pending: i64 = conn
        .query_row("SELECT COUNT(*) FROM approvals WHERE status = 'pending'", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(serde_json::json!({ "total": total, "failed": failed, "pendingApprovals": pending }))
}
