const SERVICE: &str = "jarvis.desktop";

#[cfg(windows)]
fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|e| format!("Credential store unavailable: {e}"))
}

#[cfg(not(windows))]
fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|e| format!("Credential store unavailable: {e}"))
}

pub fn set(account: &str, secret: &str) -> Result<(), String> {
    if secret.trim().is_empty() {
        return Err("Secret is empty".into());
    }
    entry(account)?
        .set_password(secret)
        .map_err(|e| format!("Could not store secret in Windows Credential Manager: {e}"))
}

pub fn get(account: &str) -> Option<String> {
    entry(account).ok().and_then(|e| e.get_password().ok())
}

pub fn has(account: &str) -> bool {
    get(account).is_some()
}

pub fn delete(account: &str) -> Result<(), String> {
    if let Ok(e) = entry(account) {
        match e.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Could not delete stored secret: {e}")),
        }
    } else {
        Ok(())
    }
}

pub fn provider_account(provider_id: &str) -> String {
    format!("provider.{provider_id}.api_key")
}

pub fn search_account(provider: &str) -> String {
    format!("search.{provider}.api_key")
}
