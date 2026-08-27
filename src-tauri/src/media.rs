//! Everything the UI needs from ffmpeg that is not an encode.
//!
//! Phase 3 uses this for two things: the thumbnail on the video info card and
//! the live poster-frame preview. Both are throwaway files written into the
//! app's cache directory, from where the asset protocol can serve them.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use tauri::Manager;

use crate::probe::{run_sidecar, FFMPEG};

/// Shown when a preview frame could not be produced. Never fatal — the card
/// simply falls back to a placeholder — but the user deserves a sentence.
const FRAME_FAILED: &str = "Náhled snímku se nepodařilo vytvořit.";

/// Subdirectory of the app cache that holds extracted frames.
const FRAMES_DIR: &str = "frames";

/// Where extracted frames live: `<app cache>/frames`, created on first use.
fn frames_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_cache_dir().map_err(|error| {
        eprintln!("[media] no app cache dir: {error}");
        FRAME_FAILED.to_string()
    })?;

    let dir = base.join(FRAMES_DIR);
    std::fs::create_dir_all(&dir).map_err(|error| {
        eprintln!("[media] cannot create {}: {error}", dir.display());
        FRAME_FAILED.to_string()
    })?;

    Ok(dir)
}

/// A stable file name for one (file, time, size) combination.
///
/// Scrubbing the poster slider revisits the same timestamps constantly, so a
/// content-addressed name turns the second visit into a no-op.
fn frame_name(path: &str, time_seconds: f64, width: u32, height: u32) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    // Milliseconds: finer than the slider can express, coarse enough to hit.
    ((time_seconds * 1000.0).round() as i64).hash(&mut hasher);
    width.hash(&mut hasher);
    height.hash(&mut hasher);
    format!("frame-{:016x}.jpg", hasher.finish())
}

/// Extracts a single frame and returns the absolute path to the JPEG.
///
/// `width` and `height` are computed by the frontend from the **display**
/// dimensions and are always concrete even integers — the same rule that
/// governs the encode, so a vertical clip yields a vertical thumbnail.
#[tauri::command]
pub async fn extract_frame(
    app: tauri::AppHandle,
    path: String,
    time_seconds: f64,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let time = if time_seconds.is_finite() && time_seconds > 0.0 {
        time_seconds
    } else {
        0.0
    };

    let output = frames_dir(&app)?.join(frame_name(&path, time, width, height));

    // Same frame, same file: the slider scrubs back and forth constantly.
    if output.exists() {
        return Ok(output.to_string_lossy().into_owned());
    }

    let output_string = output.to_string_lossy().into_owned();
    let time_string = format!("{time:.3}");
    // Explicit integers on both sides. Never `-2`, never a fixed dimension.
    let scale = format!("scale={width}:{height}");

    run_sidecar(
        &app,
        FFMPEG,
        &[
            "-v",
            "error",
            "-y",
            // Seeking before -i is the fast path and is accurate enough here.
            "-ss",
            &time_string,
            "-i",
            &path,
            "-frames:v",
            "1",
            "-vf",
            &scale,
            "-q:v",
            "3",
            &output_string,
        ],
    )
    .await
    .map_err(|_| FRAME_FAILED.to_string())?;

    if !output.exists() {
        eprintln!("[media] ffmpeg reported success but wrote no frame for {path}");
        return Err(FRAME_FAILED.to_string());
    }

    Ok(output_string)
}

/// Whether a path already exists — the summary step asks before overwriting.
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    PathBuf::from(path).exists()
}

/// Reveals a file in the platform's file manager.
///
/// Failure is logged and swallowed: not being able to open Finder must never
/// interrupt a finished job.
#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg("-R").arg(&target).spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer")
        .arg(format!("/select,{}", target.display()))
        .spawn();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let result = std::process::Command::new("xdg-open")
        .arg(target.parent().unwrap_or(&target))
        .spawn();

    result.map(|_| ()).map_err(|error| {
        eprintln!("[media] cannot reveal {}: {error}", target.display());
        "Složku se nepodařilo otevřít.".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_names_are_stable_and_distinct() {
        let a = frame_name("/tmp/a.mov", 1.0, 540, 960);
        assert_eq!(a, frame_name("/tmp/a.mov", 1.0, 540, 960));
        assert_ne!(a, frame_name("/tmp/a.mov", 2.0, 540, 960));
        assert_ne!(a, frame_name("/tmp/b.mov", 1.0, 540, 960));
        assert_ne!(a, frame_name("/tmp/a.mov", 1.0, 270, 480));
        assert!(a.ends_with(".jpg"));
    }
}
