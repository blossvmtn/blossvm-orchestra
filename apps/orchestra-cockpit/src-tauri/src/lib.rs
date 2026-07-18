// Orchestra cockpit — the native shell. Per ADR 0001 (D1), Rust is scoped to two
// jobs: resolve and spawn the one child process this app supervises (the Bun
// daemon), and hand the frontend the token it needs to talk to it. All business
// logic — worktrees, git, packets, receipts — lives in TypeScript in the daemon.
// The cockpit's UI talks to the daemon directly over HTTP, not through Rust.

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::Manager;

struct DaemonProcess(Mutex<Option<Child>>);

/// GUI-launched macOS apps get a minimal PATH that typically excludes a Homebrew
/// install — this is the single most likely P0 failure mode on JD's machine if
/// left implicit (docs/specs/2026-07-18-phase-0-constitutional-seed.md, step 2).
/// Check known install locations explicitly rather than trusting inherited PATH,
/// and fall back to a PATH search only as a last, logged resort.
fn resolve_bun_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.bun/bin/bun"),
        "/opt/homebrew/bin/bun".to_string(),
        "/usr/local/bin/bun".to_string(),
        format!("{home}/.cargo/bin/bun"),
    ];

    for candidate in candidates {
        let path = PathBuf::from(&candidate);
        if path.is_file() {
            return Ok(path);
        }
    }

    // Last resort — logged, not silent, so a stale PATH assumption is visible
    // instead of quietly working today and failing on the next machine.
    match Command::new("which").arg("bun").output() {
        Ok(out) if out.status.success() => {
            let found = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if found.is_empty() {
                Err("bun not found in known locations or PATH".to_string())
            } else {
                eprintln!("orchestra: resolved bun via inherited PATH ({found}) — known install locations were checked first and missed; consider filing this as a new candidate location.");
                Ok(PathBuf::from(found))
            }
        }
        _ => Err("bun not found in known locations or PATH".to_string()),
    }
}

fn daemon_script_path() -> PathBuf {
    // CARGO_MANIFEST_DIR is apps/orchestra-cockpit/src-tauri at compile time —
    // resolving from it avoids any ambiguity about the process's working
    // directory. Not valid for a packaged build (P5 concern, deferred per D3).
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/orchestra-daemon/src/daemon.ts")
}

fn spawn_daemon() -> Result<Child, String> {
    let bun = resolve_bun_path()?;
    let script = daemon_script_path();
    if !script.is_file() {
        return Err(format!("daemon script not found at {}", script.display()));
    }

    Command::new(bun)
        .arg("run")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("failed to spawn daemon: {e}"))
}

#[tauri::command]
fn get_daemon_token() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let token_path = PathBuf::from(home).join(".orchestra").join("daemon.token");

    // The daemon writes this file on startup; the cockpit may ask before it's
    // ready. A short bounded retry beats a UI that just fails once and gives up.
    for _ in 0..20 {
        if let Ok(token) = std::fs::read_to_string(&token_path) {
            let trimmed = token.trim().to_string();
            if !trimmed.is_empty() {
                return Ok(trimmed);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }

    Err(format!(
        "daemon token not found at {} after waiting — is the daemon running?",
        token_path.display()
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_daemon_token])
        .setup(|app| {
            match spawn_daemon() {
                Ok(child) => {
                    app.manage(DaemonProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!("orchestra: failed to start daemon — {e}");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // The daemon is this app's one supervised child (D1) — don't leave
            // it orphaned when the window closes.
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<DaemonProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
