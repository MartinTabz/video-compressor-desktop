//! Thin wrapper around the bundled ffmpeg / ffprobe sidecars.
//!
//! Everything the user could ever see from here is a plain Czech sentence.
//! The raw sidecar output goes to the console for debugging and never to the UI.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

/// Name of the ffmpeg sidecar as declared in `bundle.externalBin`.
/// Tauri appends the target triple to the file on disk; we pass the bare name.
pub const FFMPEG: &str = "ffmpeg";

/// Name of the ffprobe sidecar. Lives next to its sibling so there is one
/// place that knows what the binaries are called.
pub const FFPROBE: &str = "ffprobe";

/// Shown whenever a sidecar cannot be found or executed. The user cannot fix a
/// missing binary, but whoever set the machine up can.
const MISSING_BINARY: &str =
    "Chybí součást aplikace. Spusť prosím `scripts/fetch-binaries.sh`.";

/// Shown when ffprobe ran but could not make sense of the file.
const UNREADABLE_FILE: &str = "Soubor se nepodařilo načíst. Může být poškozený.";

/// Shown when the file is readable but carries no video we can work with.
const UNSUPPORTED_FILE: &str =
    "Tento typ souboru neumím zpracovat. Zkus MP4, MOV nebo AVI.";

/// Why a sidecar call did not produce usable output.
///
/// The distinction matters: a missing binary is a broken installation, while a
/// non-zero exit on a real file is almost always the file's fault.
pub enum SidecarError {
    /// The binary could not be resolved or spawned.
    Missing,
    /// The binary ran and exited non-zero.
    Failed,
}

/// Runs a bundled sidecar to completion and returns its stdout.
///
/// The underlying error and the full stderr are logged to the console instead
/// of being surfaced; the caller decides which Czech sentence fits.
pub async fn run_sidecar(
    app: &tauri::AppHandle,
    binary: &str,
    args: &[&str],
) -> Result<String, SidecarError> {
    let command = app.shell().sidecar(binary).map_err(|error| {
        eprintln!("[sidecar] cannot resolve `{binary}`: {error}");
        SidecarError::Missing
    })?;

    let output = command.args(args).output().await.map_err(|error| {
        eprintln!("[sidecar] cannot execute `{binary}`: {error}");
        SidecarError::Missing
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        eprintln!(
            "[sidecar] `{binary} {}` exited with {:?}\n{stderr}",
            args.join(" "),
            output.status.code()
        );
        return Err(SidecarError::Failed);
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
    // A `-version` call that fails at all means the installation is broken,
    // whichever way it failed.
    let output = run_sidecar(&app, FFMPEG, &["-version"])
        .await
        .map_err(|_| MISSING_BINARY.to_string())?;

    let first_line = output.lines().next().unwrap_or("").trim().to_string();

    if first_line.is_empty() {
        eprintln!("[sidecar] `ffmpeg -version` produced no output");
        return Err(MISSING_BINARY.to_string());
    }

    println!("[sidecar] {first_line}");
    Ok(first_line)
}

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

/// How the video reads on screen. Derived from the *display* dimensions, i.e.
/// after rotation has been applied.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Orientation {
    Portrait,
    Landscape,
    Square,
}

/// Everything the rest of the app needs to know about an input file.
///
/// Mirrors `VideoMetadata` in `src/types.ts`. `width` / `height` are display
/// dimensions with rotation already applied — they are the only pair that may
/// ever reach the scale filter.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub path: String,
    pub file_name: String,
    pub file_size_bytes: u64,
    pub width: u32,
    pub height: u32,
    pub orientation: Orientation,
    pub aspect_ratio: f64,
    /// Normalized to 0 / 90 / 180 / 270. Debugging only.
    pub rotation: i32,
    /// Pre-rotation stream dimensions. Debugging only.
    pub stream_width: u32,
    pub stream_height: u32,
    pub fps: f64,
    pub duration_seconds: f64,
    pub has_audio: bool,
    pub audio_codec: Option<String>,
    pub video_codec: Option<String>,
}

// --- ffprobe JSON shapes. Every field is optional; real files are inconsistent.

#[derive(Debug, Deserialize)]
struct ProbeOutput {
    #[serde(default)]
    streams: Vec<ProbeStream>,
    #[serde(default)]
    format: Option<ProbeFormat>,
}

#[derive(Debug, Deserialize)]
struct ProbeStream {
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    r_frame_rate: Option<String>,
    #[serde(default)]
    duration: Option<String>,
    #[serde(default)]
    codec_name: Option<String>,
    #[serde(default)]
    channels: Option<u32>,
    #[serde(default)]
    bit_rate: Option<String>,
    #[serde(default)]
    tags: Option<ProbeStreamTags>,
    #[serde(default)]
    side_data_list: Vec<ProbeSideData>,
}

#[derive(Debug, Deserialize)]
struct ProbeStreamTags {
    /// Pre-side-data files (older MOV/MP4) carry rotation as a string tag.
    #[serde(default)]
    rotate: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProbeSideData {
    /// ffprobe emits this as a number, but some builds quote it.
    #[serde(default)]
    rotation: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ProbeFormat {
    #[serde(default)]
    duration: Option<String>,
    #[serde(default)]
    size: Option<String>,
    #[serde(default)]
    format_name: Option<String>,
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/// Parses `r_frame_rate` — a fraction string such as `"60000/1001"`.
///
/// Variable-frame-rate files report all sorts of nonsense, so the result is
/// clamped to a sane range and falls back to 30 when parsing fails entirely.
fn parse_frame_rate(raw: Option<&str>) -> f64 {
    const FALLBACK: f64 = 30.0;
    const MIN: f64 = 1.0;
    const MAX: f64 = 240.0;

    let Some(raw) = raw else { return FALLBACK };
    let raw = raw.trim();

    let value = match raw.split_once('/') {
        Some((num, den)) => {
            let num: f64 = num.trim().parse().unwrap_or(f64::NAN);
            let den: f64 = den.trim().parse().unwrap_or(f64::NAN);
            if den == 0.0 {
                f64::NAN
            } else {
                num / den
            }
        }
        None => raw.parse().unwrap_or(f64::NAN),
    };

    if !value.is_finite() || value <= 0.0 {
        return FALLBACK;
    }

    // One decimal is all anyone reads; 29.97 stays 30.0 only if it rounds there.
    let rounded = (value * 10.0).round() / 10.0;
    rounded.clamp(MIN, MAX)
}

/// Normalizes a rotation of any sign or magnitude into 0 / 90 / 180 / 270.
fn normalize_rotation(degrees: f64) -> i32 {
    if !degrees.is_finite() {
        return 0;
    }
    let rounded = degrees.round() as i64;
    // Rust's `%` keeps the sign of the dividend, so add a turn before wrapping.
    (((rounded % 360) + 360) % 360) as i32
}

/// Pulls rotation out of a video stream, preferring modern side data over the
/// legacy `rotate` tag. Missing rotation means 0.
fn rotation_from_stream(stream: &ProbeStream) -> i32 {
    let from_side_data = stream.side_data_list.iter().find_map(|side| {
        side.rotation.as_ref().and_then(|value| match value {
            serde_json::Value::Number(number) => number.as_f64(),
            serde_json::Value::String(text) => text.trim().parse::<f64>().ok(),
            _ => None,
        })
    });

    let from_tag = stream
        .tags
        .as_ref()
        .and_then(|tags| tags.rotate.as_deref())
        .and_then(|text| text.trim().parse::<f64>().ok());

    normalize_rotation(from_side_data.or(from_tag).unwrap_or(0.0))
}

fn parse_f64(raw: Option<&str>) -> Option<f64> {
    raw.and_then(|text| text.trim().parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value >= 0.0)
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

/// Reads everything we need to know about `path`.
///
/// Two ffprobe calls: one for the first video stream plus container format,
/// one for the audio streams. Failure is always a finished Czech sentence.
#[tauri::command]
pub async fn probe_video(
    app: tauri::AppHandle,
    path: String,
) -> Result<VideoMetadata, String> {
    let video_json = run_sidecar(
        &app,
        FFPROBE,
        &[
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            // A single combined selector: ffprobe applies the last -show_entries
            // wholesale on some builds, so never split this across flags.
            "stream=width,height,r_frame_rate,duration,nb_frames,codec_name\
             :stream_side_data=rotation\
             :stream_tags=rotate\
             :format=duration,size,format_name",
            "-of",
            "json",
            &path,
        ],
    )
    .await
    .map_err(|error| match error {
        SidecarError::Missing => MISSING_BINARY.to_string(),
        SidecarError::Failed => UNREADABLE_FILE.to_string(),
    })?;

    let video: ProbeOutput = serde_json::from_str(&video_json).map_err(|error| {
        eprintln!("[probe] cannot parse ffprobe video JSON: {error}\n{video_json}");
        UNREADABLE_FILE.to_string()
    })?;

    let audio = probe_audio(&app, &path).await;
    let metadata = build_metadata(&path, video, audio)?;

    println!(
        "[probe] {} — stream {}x{} rotation {} => display {}x{} ({:?})",
        metadata.file_name,
        metadata.stream_width,
        metadata.stream_height,
        metadata.rotation,
        metadata.width,
        metadata.height,
        metadata.orientation
    );

    Ok(metadata)
}

/// Turns raw ffprobe output into the model the app works with.
///
/// Split out from the command so the rotation and orientation math can be
/// tested against JSON captured from real files.
fn build_metadata(
    path: &str,
    video: ProbeOutput,
    audio: Option<ProbeStream>,
) -> Result<VideoMetadata, String> {
    // No video stream at all — an audio file, an image, or something we do not
    // handle. That is a different sentence from "the file is broken".
    let Some(stream) = video.streams.into_iter().next() else {
        eprintln!("[probe] no video stream in `{path}`");
        return Err(UNSUPPORTED_FILE.to_string());
    };

    let (Some(stream_width), Some(stream_height)) = (stream.width, stream.height) else {
        eprintln!("[probe] video stream in `{path}` has no dimensions");
        return Err(UNSUPPORTED_FILE.to_string());
    };

    if stream_width == 0 || stream_height == 0 {
        eprintln!("[probe] video stream in `{path}` is {stream_width}x{stream_height}");
        return Err(UNSUPPORTED_FILE.to_string());
    }

    let rotation = rotation_from_stream(&stream);

    // Phone video is routinely stored as 1920x1080 with a rotation of ±90.
    // The display dimensions are the swapped ones, and they are the only pair
    // anything downstream is allowed to see.
    let (width, height) = if rotation % 180 == 90 {
        (stream_height, stream_width)
    } else {
        (stream_width, stream_height)
    };

    let orientation = if height > width {
        Orientation::Portrait
    } else if width > height {
        Orientation::Landscape
    } else {
        Orientation::Square
    };

    let format = video.format;

    let duration_seconds = parse_f64(stream.duration.as_deref())
        .or_else(|| parse_f64(format.as_ref().and_then(|f| f.duration.as_deref())))
        .unwrap_or(0.0);

    // The container's own size field is authoritative when present; the
    // filesystem is the fallback for formats that omit it.
    let file_size_bytes = format
        .as_ref()
        .and_then(|f| f.size.as_deref())
        .and_then(|text| text.trim().parse::<u64>().ok())
        .or_else(|| std::fs::metadata(path).ok().map(|meta| meta.len()))
        .unwrap_or(0);

    if let Some(format_name) = format.as_ref().and_then(|f| f.format_name.as_deref()) {
        println!("[probe] container: {format_name}");
    }

    let path_buf = PathBuf::from(path);
    let file_name = path_buf
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());

    Ok(VideoMetadata {
        path: path.to_string(),
        file_name,
        file_size_bytes,
        width,
        height,
        orientation,
        aspect_ratio: f64::from(width) / f64::from(height),
        rotation,
        stream_width,
        stream_height,
        fps: parse_frame_rate(stream.r_frame_rate.as_deref()),
        duration_seconds,
        has_audio: audio.is_some(),
        audio_codec: audio.and_then(|stream| stream.codec_name),
        video_codec: stream.codec_name,
    })
}

/// Returns the first audio stream, or `None` when the file is silent.
///
/// A failure here is never fatal: a file we cannot read audio from is treated
/// as a file without audio, and the audio step simply disappears.
async fn probe_audio(app: &tauri::AppHandle, path: &str) -> Option<ProbeStream> {
    let json = run_sidecar(
        app,
        FFPROBE,
        &[
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_name,channels,bit_rate",
            "-of",
            "json",
            path,
        ],
    )
    .await
    .ok()?;

    let output: ProbeOutput = serde_json::from_str(&json)
        .map_err(|error| eprintln!("[probe] cannot parse ffprobe audio JSON: {error}"))
        .ok()?;

    let stream = output.streams.into_iter().next()?;

    println!(
        "[probe] audio: {} ({} ch, {} bps)",
        stream.codec_name.as_deref().unwrap_or("?"),
        stream.channels.unwrap_or(0),
        stream.bit_rate.as_deref().unwrap_or("?")
    );

    Some(stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_rate_parses_ntsc_fractions() {
        // One decimal, so 59.94 stays visibly NTSC while 29.97 lands on 30.
        assert_eq!(parse_frame_rate(Some("60000/1001")), 59.9);
        assert_eq!(parse_frame_rate(Some("30000/1001")), 30.0);
        assert_eq!(parse_frame_rate(Some("24/1")), 24.0);
    }

    #[test]
    fn frame_rate_falls_back_and_clamps() {
        assert_eq!(parse_frame_rate(None), 30.0);
        assert_eq!(parse_frame_rate(Some("0/0")), 30.0);
        assert_eq!(parse_frame_rate(Some("nonsense")), 30.0);
        // Some VFR files report an absurd nominal rate.
        assert_eq!(parse_frame_rate(Some("90000/1")), 240.0);
    }

    #[test]
    fn rotation_normalizes_every_sign() {
        assert_eq!(normalize_rotation(-90.0), 270);
        assert_eq!(normalize_rotation(90.0), 90);
        assert_eq!(normalize_rotation(270.0), 270);
        assert_eq!(normalize_rotation(180.0), 180);
        assert_eq!(normalize_rotation(-180.0), 180);
        assert_eq!(normalize_rotation(360.0), 0);
        assert_eq!(normalize_rotation(f64::NAN), 0);
    }

    // --- Fixtures captured from the bundled ffprobe on real files. ---

    /// A phone-shaped clip: landscape stream, `rotation: -90` display matrix.
    const ROTATED_MOV: &str = r#"{
        "streams": [{
            "codec_name": "h264",
            "width": 1920,
            "height": 1080,
            "r_frame_rate": "30000/1001",
            "duration": "3.003000",
            "nb_frames": "90",
            "tags": {},
            "side_data_list": [{ "rotation": -90 }]
        }],
        "format": {
            "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
            "duration": "3.003000",
            "size": "2326748"
        }
    }"#;

    /// A natively vertical clip with one audio stream.
    const VERTICAL_MP4: &str = r#"{
        "streams": [{
            "codec_name": "h264",
            "width": 1080,
            "height": 1920,
            "r_frame_rate": "30/1",
            "duration": "5.000000",
            "nb_frames": "150",
            "tags": {}
        }],
        "format": {
            "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
            "duration": "5.000000",
            "size": "4173259"
        }
    }"#;

    /// The legacy shape: rotation as a string tag rather than side data.
    const LEGACY_TAG_MOV: &str = r#"{
        "streams": [{
            "codec_name": "h264",
            "width": 1920,
            "height": 1080,
            "r_frame_rate": "30/1",
            "tags": { "rotate": "90" }
        }],
        "format": { "duration": "4.000000", "size": "100000" }
    }"#;

    const AAC_STREAM: &str = r#"{
        "streams": [{ "codec_name": "aac", "channels": 1, "bit_rate": "69341" }]
    }"#;

    fn parse(json: &str) -> ProbeOutput {
        serde_json::from_str(json).expect("fixture must parse")
    }

    fn first_stream(json: &str) -> Option<ProbeStream> {
        parse(json).streams.into_iter().next()
    }

    #[test]
    fn rotated_phone_video_reports_swapped_display_dimensions() {
        let meta = build_metadata("/tmp/rotated.mov", parse(ROTATED_MOV), None).unwrap();

        assert_eq!((meta.stream_width, meta.stream_height), (1920, 1080));
        assert_eq!(meta.rotation, 270, "-90 normalizes to 270");
        assert_eq!((meta.width, meta.height), (1080, 1920));
        assert!(matches!(meta.orientation, Orientation::Portrait));
        assert_eq!(meta.fps, 30.0);
        assert!(!meta.has_audio);
        assert_eq!(meta.file_name, "rotated.mov");
    }

    #[test]
    fn native_vertical_video_needs_no_swap() {
        let meta = build_metadata(
            "/tmp/vertical.mp4",
            parse(VERTICAL_MP4),
            first_stream(AAC_STREAM),
        )
        .unwrap();

        assert_eq!(meta.rotation, 0);
        assert_eq!((meta.width, meta.height), (1080, 1920));
        assert!(matches!(meta.orientation, Orientation::Portrait));
        assert_eq!(meta.file_size_bytes, 4_173_259);
        assert_eq!(meta.duration_seconds, 5.0);
        assert!(meta.has_audio);
        assert_eq!(meta.audio_codec.as_deref(), Some("aac"));
    }

    #[test]
    fn legacy_rotate_tag_is_honoured_when_side_data_is_absent() {
        let meta = build_metadata("/tmp/old.mov", parse(LEGACY_TAG_MOV), None).unwrap();

        assert_eq!(meta.rotation, 90);
        assert_eq!((meta.width, meta.height), (1080, 1920));
        assert!(matches!(meta.orientation, Orientation::Portrait));
    }

    #[test]
    fn a_file_without_a_video_stream_is_unsupported_not_broken() {
        let empty: ProbeOutput = serde_json::from_str(r#"{"streams": []}"#).unwrap();
        assert_eq!(
            build_metadata("/tmp/song.mp3", empty, None).unwrap_err(),
            UNSUPPORTED_FILE
        );
    }

    #[test]
    fn a_silent_file_probes_cleanly_with_has_audio_false() {
        let meta = build_metadata("/tmp/silent.mp4", parse(VERTICAL_MP4), None).unwrap();
        assert!(!meta.has_audio);
        assert_eq!(meta.audio_codec, None);
    }

    #[test]
    fn quarter_turns_swap_dimensions_and_half_turns_do_not() {
        for rotation in [90, 270] {
            assert_eq!(rotation % 180, 90, "rotation {rotation} must swap");
        }
        for rotation in [0, 180] {
            assert_ne!(rotation % 180, 90, "rotation {rotation} must not swap");
        }
    }
}
