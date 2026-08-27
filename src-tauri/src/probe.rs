//! Thin wrapper around the bundled ffmpeg / ffprobe sidecars.
//!
//! Everything the user could ever see from here is a plain Czech sentence.
//! The raw sidecar output goes to the console for debugging and never to the UI.

use tauri_plugin_shell::ShellExt;

/// Name of the ffmpeg sidecar as declared in `bundle.externalBin`.
/// Tauri appends the target triple to the file on disk; we pass the bare name.
pub const FFMPEG: &str = "ffmpeg";

/// Name of the ffprobe sidecar. Unused in phase 1, kept next to its sibling
/// so there is one place that knows what the binaries are called.
#[allow(dead_code)]
pub const FFPROBE: &str = "ffprobe";

/// Shown whenever a sidecar cannot be found or executed. The user cannot fix a
/// missing binary, but whoever set the machine up can.
const MISSING_BINARY: &str =
    "Chybí součást aplikace. Spusť prosím `scripts/fetch-binaries.sh`.";

/// Runs a bundled sidecar to completion and returns its stdout.
///
/// Returns a user-facing Czech message on failure. The underlying error and the
/// full stderr are logged to the console instead of being surfaced.
pub async fn run_sidecar(
    app: &tauri::AppHandle,
    binary: &str,
    args: &[&str],
) -> Result<String, String> {
    let command = app.shell().sidecar(binary).map_err(|error| {
        eprintln!("[sidecar] cannot resolve `{binary}`: {error}");
        MISSING_BINARY.to_string()
    })?;

    let output = command.args(args).output().await.map_err(|error| {
        eprintln!("[sidecar] cannot execute `{binary}`: {error}");
        MISSING_BINARY.to_string()
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        eprintln!(
            "[sidecar] `{binary} {}` exited with {:?}\n{stderr}",
            args.join(" "),
            output.status.code()
        );
        return Err(MISSING_BINARY.to_string());
    }

    // ffmpeg writes its banner to stderr for most invocations, so keep both.
    if !stderr.is_empty() {
        eprintln!("[sidecar] `{binary}` stderr:\n{stderr}");
    }

    Ok(stdout)
}

/// Verifies the bundled ffmpeg is present and executable.
///
/// On success returns the first line of `ffmpeg -version`, e.g.
/// `ffmpeg version 6.1.1-static https://...`.
#[tauri::command]
pub async fn check_ffmpeg(app: tauri::AppHandle) -> Result<String, String> {
    let output = run_sidecar(&app, FFMPEG, &["-version"]).await?;

    let first_line = output.lines().next().unwrap_or("").trim().to_string();

    if first_line.is_empty() {
        eprintln!("[sidecar] `ffmpeg -version` produced no output");
        return Err(MISSING_BINARY.to_string());
    }

    println!("[sidecar] {first_line}");
    Ok(first_line)
}
