//! The ffmpeg log file.
//!
//! Everything ffmpeg says on stderr goes here and nowhere else. The UI shows
//! finished Czech sentences; this file is what someone opens when a sentence
//! is not enough. A single rotation keeps it from growing without bound.

use std::io::Write;
use std::path::PathBuf;

use tauri::Manager;

/// Current log. The previous one is kept next to it as `ffmpeg.log.1`.
const LOG_NAME: &str = "ffmpeg.log";

/// Rotate once the current log passes this. One megabyte is a few dozen runs.
const LOG_MAX_BYTES: u64 = 1_048_576;

/// Shown if the log itself cannot be opened — rare, and never fatal.
const LOG_UNAVAILABLE: &str = "Soubor s logem se nepodařilo otevřít.";

/// `<app log dir>/ffmpeg.log`, with the directory created on first use.
pub fn log_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|error| {
        eprintln!("[log] no app log dir: {error}");
        LOG_UNAVAILABLE.to_string()
    })?;

    std::fs::create_dir_all(&dir).map_err(|error| {
        eprintln!("[log] cannot create {}: {error}", dir.display());
        LOG_UNAVAILABLE.to_string()
    })?;

    Ok(dir.join(LOG_NAME))
}

/// Appends one block of text, rotating first if the file has grown too large.
///
/// Failures are logged and swallowed: not being able to write the log must
/// never take down an encode that is otherwise fine.
pub fn append(app: &tauri::AppHandle, block: &str) {
    let Ok(path) = log_file(app) else { return };

    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > LOG_MAX_BYTES {
            // One generation back is enough to catch "it worked a minute ago".
            let previous = path.with_extension("log.1");
            if let Err(error) = std::fs::rename(&path, &previous) {
                eprintln!("[log] cannot rotate {}: {error}", path.display());
            }
        }
    }

    let opened = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path);

    match opened {
        Ok(mut file) => {
            if let Err(error) = file.write_all(block.as_bytes()) {
                eprintln!("[log] cannot write {}: {error}", path.display());
            }
        }
        Err(error) => eprintln!("[log] cannot open {}: {error}", path.display()),
    }
}

/// Opens the log in whatever the system uses for plain text.
///
/// Wired to the „Otevřít log" link, which only appears in the error state.
#[tauri::command]
pub fn open_log(app: tauri::AppHandle) -> Result<(), String> {
    let path = log_file(&app)?;

    // The link is only offered after a failure, so the file exists by then —
    // except when the very first thing that failed was creating it.
    if !path.exists() {
        append(&app, "");
    }

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&path).spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(&path)
        .spawn();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let result = std::process::Command::new("xdg-open").arg(&path).spawn();

    result.map(|_| ()).map_err(|error| {
        eprintln!("[log] cannot open {}: {error}", path.display());
        LOG_UNAVAILABLE.to_string()
    })
}
