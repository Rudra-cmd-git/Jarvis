use serde::Serialize;

use crate::db::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub os: String,
    pub arch: String,
    pub data_dir: String,
    pub tauri_version: String,
}

pub fn app_info(handle: &tauri::AppHandle, state: &AppState) -> AppInfo {
    let pkg = handle.package_info();
    AppInfo {
        name: "JARVIS".into(),
        version: pkg.version.to_string(),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        tauri_version: tauri::VERSION.into(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu_name: String,
    pub cores: u32,
    pub load_percent: f32,
    pub total_mem_gb: f64,
    pub free_mem_gb: f64,
    pub os: String,
}

pub async fn snapshot() -> Result<SystemSnapshot, String> {
    let script = "$os=Get-CimInstance Win32_OperatingSystem; $cpu=Get-CimInstance Win32_Processor | Select-Object -First 1; [pscustomobject]@{os=$os.Caption; totalMem=[math]::Round($os.TotalVisibleMemorySize/1MB,1); freeMem=[math]::Round($os.FreePhysicalMemory/1MB,1); cpu=$cpu.Name; cores=$cpu.NumberOfLogicalProcessors; load=$cpu.LoadPercentage} | ConvertTo-Json -Compress";
    let output = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", script]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        cmd.output()
    })
    .await
    .map_err(|e| format!("System query failed: {e}"))?
    .map_err(|e| format!("System query failed: {e}"))?;
    if !output.status.success() {
        return Err("System information query failed.".into());
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "Could not parse system information.".to_string())?;
    Ok(SystemSnapshot {
        cpu_name: v.get("cpu").and_then(|x| x.as_str()).unwrap_or("Unknown CPU").to_string(),
        cores: v.get("cores").and_then(|x| x.as_u64()).unwrap_or(0) as u32,
        load_percent: v.get("load").and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
        total_mem_gb: v.get("totalMem").and_then(|x| x.as_f64()).unwrap_or(0.0),
        free_mem_gb: v.get("freeMem").and_then(|x| x.as_f64()).unwrap_or(0.0),
        os: v.get("os").and_then(|x| x.as_str()).unwrap_or("Windows").to_string(),
    })
}
