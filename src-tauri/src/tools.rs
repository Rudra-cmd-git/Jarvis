use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::{new_id, now_iso, record_activity, AppState};
use crate::settings::{self, permission_enabled};
use crate::{memory, search};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub permission: String,
    pub category: String,
    pub requires_approval: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub ok: bool,
    pub summary: String,
    pub detail: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequest {
    pub id: String,
    pub tool: String,
    pub args: Value,
    pub reason: String,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ToolOutcome {
    Completed { result: ToolResult },
    ApprovalRequired { approval: ApprovalRequest },
    Denied { reason: String },
}

pub fn catalog() -> Vec<ToolInfo> {
    vec![
        info("open_app", "Open application", "Launch an allowlisted Windows application such as Notepad, Calculator, Explorer, Paint, Edge, Chrome, VS Code or Spotify.", "apps.launch", "Computer", false),
        info("open_url", "Open website", "Open an http(s) URL in the default browser.", "web.open", "Computer", true),
        info("open_folder", "Open folder", "Open a standard user folder (desktop, documents, downloads, pictures, music, videos) in Explorer.", "files.read", "Files", false),
        info("search_files", "Search files", "Search file names inside your approved folders.", "files.search", "Files", false),
        info("read_text_file", "Read text file", "Read a text-based file inside an approved folder.", "files.read", "Files", false),
        info("save_note", "Save note", "Save a persistent note to local memory.", "notes.write", "Memory", false),
        info("list_notes", "List notes", "List saved notes.", "notes.write", "Memory", false),
        info("delete_note", "Delete note", "Permanently delete a saved note.", "notes.delete", "Memory", true),
        info("web_search", "Web search", "Search the web through your configured search provider and return sources.", "external.send", "Web", true),
        info("system_info", "System information", "Report CPU, memory and operating system information for this PC.", "system.info", "System", false),
        info("datetime", "Date and time", "Report the current local date and time.", "system.info", "System", false),
    ]
}

fn info(id: &str, name: &str, description: &str, permission: &str, category: &str, approval: bool) -> ToolInfo {
    ToolInfo {
        id: id.into(),
        name: name.into(),
        description: description.into(),
        permission: permission.into(),
        category: category.into(),
        requires_approval: approval,
    }
}

pub fn catalog_for_prompt() -> String {
    let mut out = String::from(
        "Available tools. To use one, reply with a fenced block exactly like:\n\
         ```tool\n{\"tool\":\"open_app\",\"args\":{\"name\":\"notepad\"},\"reason\":\"why\"}\n```\n\
         Use at most one tool block per reply, only when the user clearly asks for an action. \
         After the block, add one short sentence about what you are doing. Tool results arrive in a follow-up turn.\n\
         Do not invent tools, and do not claim success before the result. Tools:\n",
    );
    for t in catalog() {
        out.push_str(&format!(
            "- {}: {} Args: {}\n",
            t.id,
            t.description,
            args_help(&t.id)
        ));
    }
    out.push_str(
        "If a task needs no tool, answer directly. Shell/terminal execution is not available by design.\n",
    );
    out
}

fn args_help(tool: &str) -> &'static str {
    match tool {
        "open_app" => "{\"name\":\"notepad\"}",
        "open_url" => "{\"url\":\"https://example.com\"}",
        "open_folder" => "{\"folder\":\"desktop\"}",
        "search_files" => "{\"query\":\"report\",\"folder\":\"documents\"}",
        "read_text_file" => "{\"path\":\"C:/Users/you/Documents/file.txt\"}",
        "save_note" => "{\"content\":\"text to remember\"}",
        "delete_note" => "{\"id\":\"note id\"}",
        "web_search" => "{\"query\":\"latest news\"}",
        "list_notes" | "system_info" | "datetime" => "{}",
        _ => "{}",
    }
}

fn str_arg(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("Missing required argument \"{key}\""))
}

pub fn preview(tool: &str, args: &Value) -> String {
    match tool {
        "web_search" => format!("Send a search query to your configured provider: \"{}\"", str_arg(args, "query").unwrap_or_default()),
        "delete_note" => format!("Permanently delete note {}.", str_arg(args, "id").unwrap_or_default()),
        "read_text_file" => format!("Read the contents of {}.", str_arg(args, "path").unwrap_or_default()),
        "search_files" => format!("Search your approved folders for \"{}\".", str_arg(args, "query").unwrap_or_default()),
        "open_app" => format!("Launch {}.", str_arg(args, "name").unwrap_or_default()),
        "open_url" => format!("Open {} in your browser.", str_arg(args, "url").unwrap_or_default()),
        "open_folder" => format!("Open your {} folder.", str_arg(args, "folder").unwrap_or_default()),
        "save_note" => "Save a note to local memory.".into(),
        _ => format!("Run tool {tool}."),
    }
}

fn user_home() -> Result<PathBuf, String> {
    std::env::var("USERPROFILE")
        .map(PathBuf::from)
        .map_err(|_| "Cannot locate the user profile folder".to_string())
}

fn folder_root(name: &str) -> Result<PathBuf, String> {
    let home = user_home()?;
    let sub = match name.to_ascii_lowercase().as_str() {
        "desktop" => "Desktop",
        "documents" | "docs" => "Documents",
        "downloads" => "Downloads",
        "pictures" => "Pictures",
        "music" => "Music",
        "videos" => "Videos",
        _ => return Err("Folder must be one of: desktop, documents, downloads, pictures, music, videos".into()),
    };
    Ok(home.join(sub))
}

fn approved_roots() -> Vec<PathBuf> {
    ["Desktop", "Documents", "Downloads"]
        .iter()
        .filter_map(|sub| user_home().ok().map(|h| h.join(sub)))
        .filter(|p| p.exists())
        .collect()
}

fn is_inside_allowed_roots(path: &Path) -> bool {
    let Ok(canonical) = std::fs::canonicalize(path) else {
        return false;
    };
    approved_roots().iter().any(|root| {
        std::fs::canonicalize(root)
            .map(|r| canonical.starts_with(r))
            .unwrap_or(false)
    })
}

fn shell_open(target: &str, via_start: bool) -> Result<(), String> {
    let mut cmd = std::process::Command::new("cmd");
    if via_start {
        cmd.args(["/C", "start", "", target]);
    } else {
        cmd.args(["/C", target]);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not launch: {e}"))
}

fn open_app(name: &str) -> Result<ToolResult, String> {
    let key = name.trim().to_ascii_lowercase();
    let (label, target, use_start) = match key.as_str() {
        "notepad" => ("Notepad", "notepad.exe", false),
        "calculator" | "calc" => ("Calculator", "calc.exe", false),
        "explorer" | "file explorer" | "files" => ("File Explorer", "explorer.exe", false),
        "paint" | "mspaint" => ("Paint", "mspaint.exe", false),
        "settings" => ("Windows Settings", "ms-settings:", true),
        "edge" | "microsoft edge" => ("Microsoft Edge", "msedge", true),
        "chrome" | "google chrome" => ("Google Chrome", "chrome", true),
        "firefox" => ("Firefox", "firefox", true),
        "vscode" | "vs code" | "code" => ("Visual Studio Code", "code", true),
        "spotify" => ("Spotify", "spotify", true),
        "taskmgr" => return Err("Task Manager is intentionally not allowlisted.".into()),
        _ => return Err(format!("Application \"{name}\" is not in the allowlist.")),
    };
    shell_open(target, use_start)?;
    Ok(ToolResult {
        ok: true,
        summary: format!("Launched {label}."),
        detail: Some(json!({ "application": label, "target": target })),
    })
}

fn validate_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Only http and https URLs can be opened.".into());
    }
    if trimmed.len() > 2048 {
        return Err("URL is too long.".into());
    }
    if trimmed.chars().any(|c| c.is_control() || c == '"' || c == '\'' || c == ' ') {
        return Err("URL contains invalid characters.".into());
    }
    Ok(trimmed.to_string())
}

fn search_files(query: &str, folder: Option<&str>) -> Result<ToolResult, String> {
    let query = query.trim();
    if query.len() < 2 {
        return Err("Search query must be at least 2 characters.".into());
    }
    let roots: Vec<PathBuf> = match folder {
        Some(f) => vec![folder_root(f)?],
        None => approved_roots(),
    };
    let needle = query.to_ascii_lowercase();
    let mut matches: Vec<Value> = vec![];
    for root in roots {
        walk(&root, &needle, &mut matches, 0, 4);
        if matches.len() >= 40 {
            break;
        }
    }
    Ok(ToolResult {
        ok: true,
        summary: format!("Found {} matching file(s).", matches.len()),
        detail: Some(json!({ "query": query, "files": matches })),
    })
}

fn walk(dir: &Path, needle: &str, out: &mut Vec<Value>, depth: usize, max_depth: usize) {
    if depth > max_depth || out.len() >= 40 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.eq_ignore_ascii_case("node_modules") || name.eq_ignore_ascii_case("target") {
            continue;
        }
        if name.to_ascii_lowercase().contains(needle) {
            let meta = entry.metadata().ok();
            out.push(json!({
                "name": name,
                "path": path.to_string_lossy(),
                "isDir": meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                "modified": meta.and_then(|m| m.modified().ok()).map(|t| {
                    chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()
                })
            }));
            if out.len() >= 40 {
                return;
            }
        }
        if path.is_dir() {
            walk(&path, needle, out, depth + 1, max_depth);
        }
    }
}

fn read_text_file(path: &str) -> Result<ToolResult, String> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err("File not found.".into());
    }
    if !p.is_file() {
        return Err("Path is not a file.".into());
    }
    if !is_inside_allowed_roots(&p) {
        return Err("File is outside your approved folders (Desktop, Documents, Downloads).".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = [
        "txt", "md", "json", "log", "csv", "yml", "yaml", "toml", "ini", "rs", "ts", "tsx", "js",
        "jsx", "py", "html", "css", "sql", "xml",
    ];
    if !allowed.contains(&ext.as_str()) {
        return Err(format!("Reading .{ext} files is not supported."));
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 256 * 1024 {
        return Err("File is larger than 256 KB.".into());
    }
    let content = std::fs::read_to_string(&p).map_err(|_| "File is not valid UTF-8 text.".to_string())?;
    let shown: String = content.chars().take(20_000).collect();
    Ok(ToolResult {
        ok: true,
        summary: format!("Read {} ({} characters).", p.file_name().unwrap_or_default().to_string_lossy(), content.chars().count()),
        detail: Some(json!({ "path": p.to_string_lossy(), "content": shown, "truncated": content.len() > shown.len() })),
    })
}

fn system_info() -> Result<ToolResult, String> {
    let script = "$os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor | Select-Object -First 1; [pscustomobject]@{os=$os.Caption; version=$os.Version; totalMem=[math]::Round($os.TotalVisibleMemorySize/1MB,1); freeMem=[math]::Round($os.FreePhysicalMemory/1MB,1); cpu=$cpu.Name; cores=$cpu.NumberOfLogicalProcessors; load=$cpu.LoadPercentage} | ConvertTo-Json -Compress";
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let output = cmd.output().map_err(|e| format!("Could not query system information: {e}"))?;
    if !output.status.success() {
        return Err("System information query failed.".into());
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail: Value = serde_json::from_str(&text).unwrap_or(json!({ "raw": text }));
    let os = detail.get("os").and_then(|v| v.as_str()).unwrap_or("Windows");
    let mem = detail.get("totalMem").and_then(|v| v.as_f64()).unwrap_or(0.0);
    Ok(ToolResult {
        ok: true,
        summary: format!("{os} · {mem:.1} GB RAM"),
        detail: Some(detail),
    })
}

pub async fn execute(state: &AppState, tool: &str, args: &Value) -> Result<ToolResult, String> {
    let cfg = settings::load(state);
    let info = catalog().into_iter().find(|t| t.id == tool);
    let Some(info) = info else {
        return Err(format!("Unknown tool \"{tool}\"."));
    };
    if !permission_enabled(&cfg, &info.permission) {
        return Err(format!("Permission \"{}\" is disabled. Enable it in Settings → Permissions.", info.permission));
    }
    match tool {
        "open_app" => open_app(&str_arg(args, "name")?),
        "open_url" => {
            let url = validate_url(&str_arg(args, "url")?)?;
            shell_open(&url, true)?;
            Ok(ToolResult { ok: true, summary: format!("Opened {url}"), detail: Some(json!({ "url": url })) })
        }
        "open_folder" => {
            let folder = str_arg(args, "folder")?;
            let path = folder_root(&folder)?;
            if !path.exists() {
                return Err(format!("Folder does not exist: {}", path.display()));
            }
            shell_open(&path.to_string_lossy(), false)?;
            Ok(ToolResult { ok: true, summary: format!("Opened {}", path.display()), detail: None })
        }
        "search_files" => search_files(
            &str_arg(args, "query")?,
            args.get("folder").and_then(|v| v.as_str()),
        ),
        "read_text_file" => read_text_file(&str_arg(args, "path")?),
        "save_note" => {
            let content = str_arg(args, "content")?;
            let note = memory::add(state, "note", &content)?;
            Ok(ToolResult {
                ok: true,
                summary: "Note saved locally.".into(),
                detail: Some(json!({ "note": note })),
            })
        }
        "list_notes" => {
            let notes: Vec<Value> = memory::list(state)?
                .into_iter()
                .filter(|m| m.kind == "note")
                .map(|m| json!({ "id": m.id, "content": m.content, "createdAt": m.created_at }))
                .collect();
            Ok(ToolResult {
                ok: true,
                summary: format!("{} saved note(s).", notes.len()),
                detail: Some(json!({ "notes": notes })),
            })
        }
        "delete_note" => {
            let id = str_arg(args, "id")?;
            memory::delete(state, &id)?;
            Ok(ToolResult { ok: true, summary: "Note deleted.".into(), detail: None })
        }
        "web_search" => {
            if !cfg.search.enabled || cfg.search.provider == "none" {
                return Err("No web search provider is configured. Add one in Integrations.".into());
            }
            let query = str_arg(args, "query")?;
            let results = search::run(state, &query).await?;
            let summary = format!("Found {} result(s) for \"{}\".", results.len(), query);
            Ok(ToolResult { ok: true, summary, detail: Some(json!({ "query": query, "results": results })) })
        }
        "system_info" => system_info(),
        "datetime" => Ok(ToolResult {
            ok: true,
            summary: chrono::Local::now().format("%A, %d %B %Y · %H:%M:%S").to_string(),
            detail: Some(json!({ "iso": chrono::Local::now().to_rfc3339() })),
        }),
        _ => Err(format!("Tool \"{tool}\" is not implemented.")),
    }
}

pub fn requires_approval(state: &AppState, tool: &str) -> bool {
    let cfg = settings::load(state);
    if !cfg.require_approvals {
        return false;
    }
    catalog()
        .into_iter()
        .find(|t| t.id == tool)
        .map(|t| t.requires_approval)
        .unwrap_or(false)
}

pub async fn run(state: &AppState, tool: &str, args: Value, reason: &str) -> Result<ToolOutcome, String> {
    let cfg = settings::load(state);
    let info = catalog()
        .into_iter()
        .find(|t| t.id == tool)
        .ok_or_else(|| format!("Unknown tool \"{tool}\"."))?;
    if !permission_enabled(&cfg, &info.permission) {
        return Ok(ToolOutcome::Denied {
            reason: format!("Permission \"{}\" is disabled in Settings → Permissions.", info.permission),
        });
    }
    if requires_approval(state, tool) {
        let id = new_id();
        let preview = preview(tool, &args);
        {
            let conn = state.db.lock().expect("db lock");
            conn.execute(
                "INSERT INTO approvals (id, tool, args, reason, status, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
                rusqlite::params![id, tool, args.to_string(), reason, now_iso()],
            )
            .map_err(|e| e.to_string())?;
            record_activity(&conn, "approval", "Approval requested", Some(&preview), "pending");
        }
        return Ok(ToolOutcome::ApprovalRequired {
            approval: ApprovalRequest { id, tool: tool.into(), args, reason: reason.into(), preview },
        });
    }
    let result = execute(state, tool, &args).await?;
    log_tool(state, tool, &result);
    Ok(ToolOutcome::Completed { result })
}

pub async fn respond_approval(state: &AppState, id: &str, approve: bool) -> Result<ToolOutcome, String> {
    let (tool, args, preview_text, status) = {
        let conn = state.db.lock().expect("db lock");
        conn.query_row(
            "SELECT tool, args, reason, status FROM approvals WHERE id = ?1",
            [id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?)),
        )
        .map_err(|_| "Approval request not found".to_string())?
    };
    if status != "pending" {
        return Err("This approval request has already been resolved.".into());
    }
    let args: Value = serde_json::from_str(&args).map_err(|e| e.to_string())?;
    if !approve {
        let conn = state.db.lock().expect("db lock");
        let _ = conn.execute("UPDATE approvals SET status = 'denied' WHERE id = ?1", [id]);
        record_activity(&conn, "approval", "Action denied", Some(&preview_text), "denied");
        return Ok(ToolOutcome::Denied { reason: "The user denied this action.".into() });
    }
    {
        let conn = state.db.lock().expect("db lock");
        let _ = conn.execute("UPDATE approvals SET status = 'approved' WHERE id = ?1", [id]);
    }
    let result = execute(state, &tool, &args).await?;
    log_tool(state, &tool, &result);
    Ok(ToolOutcome::Completed { result })
}

pub fn pending_approvals(state: &AppState) -> Result<Vec<ApprovalRequest>, String> {
    let conn = state.db.lock().expect("db lock");
    let mut stmt = conn
        .prepare("SELECT id, tool, args, reason FROM approvals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let id: String = r.get(0)?;
            let tool: String = r.get(1)?;
            let args: String = r.get(2)?;
            let reason: String = r.get(3)?;
            let parsed: Value = serde_json::from_str(&args).unwrap_or(json!({}));
            Ok(ApprovalRequest {
                preview: preview(&tool, &parsed),
                id,
                tool,
                args: parsed,
                reason,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn log_tool(state: &AppState, tool: &str, result: &ToolResult) {
    let conn = state.db.lock().expect("db lock");
    record_activity(
        &conn,
        "tool",
        &format!("Tool: {tool}"),
        Some(&result.summary),
        if result.ok { "success" } else { "failed" },
    );
}

#[derive(Debug, Clone, Deserialize)]
pub struct PendingToolCall {
    pub tool: String,
    pub args: Value,
    #[serde(default)]
    pub reason: String,
}

pub fn extract_tool_call(text: &str) -> Option<crate::ai::ToolCallRequest> {
    let mut rest = text;
    while let Some(start) = rest.find("```tool").or_else(|| rest.find("```jarvis_tool")) {
        let after = &rest[start..];
        let body_start = after.find('\n')?;
        let body = &after[body_start + 1..];
        let end = body.find("```")?;
        let json_text = body[..end].trim();
        let parsed: Result<PendingToolCall, _> = serde_json::from_str(json_text);
        if let Ok(call) = parsed {
            let known = catalog().into_iter().any(|t| t.id == call.tool);
            if known {
                return Some(crate::ai::ToolCallRequest {
                    tool: call.tool,
                    args: if call.args.is_null() { json!({}) } else { call.args },
                    reason: call.reason,
                });
            }
        }
        rest = &body[end + 3..];
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_a_valid_tool_block() {
        let text = "Working on it.\n```tool\n{\"tool\":\"open_app\",\"args\":{\"name\":\"notepad\"},\"reason\":\"user asked\"}\n```";
        let call = extract_tool_call(text).expect("tool call");
        assert_eq!(call.tool, "open_app");
        assert_eq!(call.args["name"], "notepad");
    }

    #[test]
    fn ignores_unknown_tools() {
        let text = "```tool\n{\"tool\":\"run_shell\",\"args\":{\"cmd\":\"whoami\"}}\n```";
        assert!(extract_tool_call(text).is_none());
    }

    #[test]
    fn blocks_non_http_urls() {
        assert!(validate_url("javascript:alert(1)").is_err());
        assert!(validate_url("file:///C:/Windows/System32").is_err());
        assert!(validate_url("https://example.com/path").is_ok());
    }
}
