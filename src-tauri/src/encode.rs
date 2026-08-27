//! The encode itself: spawn, stream progress, cancel, clean up.
//!
//! Rust never builds an ffmpeg command line. The frontend's `buildArgs()` is
//! the single source of truth for what runs, and the summary step renders that
//! same array — so this module receives a finished argument list and only
//! checks that it is sane before handing it to the sidecar.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::log;
use crate::probe::{run_sidecar, SidecarError, FFMPEG};

/// Shown when ffmpeg could not be started at all.
const MISSING_BINARY: &str = "Chybí součást aplikace. Spusť prosím `scripts/fetch-binaries.sh`.";

/// Shown when ffmpeg ran and gave up. The log link sits next to it.
const ENCODE_FAILED: &str = "Kompresi se nepodařilo dokončit. Zkus jiné nastavení, nebo se podívej do logu.";

/// Shown when the target folder cannot be written to.
const NO_WRITE_PERMISSION: &str = "Do této složky nemám oprávnění zapisovat. Zkus jinou.";

/// Shown when the argument list arrives malformed. The user cannot cause this;
/// it means the frontend and this module have drifted apart.
const BAD_ARGUMENTS: &str = "Nastavení komprese je poškozené. Zkus aplikaci restartovat.";

/// Shown when a poster could not be made. Never an error state — the video is
/// already finished by the time this can happen.
const POSTER_FAILED: &str = "Náhledový obrázek se nepodařilo vytvořit. Video je ale hotové.";

/// Roughly ten repaints a second. ffmpeg reports far more often than anyone
/// can read, and every extra event is a React render.
const EMIT_INTERVAL: Duration = Duration::from_millis(100);

/// Cap on how much stderr is kept per run before it goes to the log file.
const MAX_STDERR_BYTES: usize = 256 * 1024;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// Every ffmpeg process this app has running, keyed by job id.
///
/// The reader task owns the event stream; this map owns the handle needed to
/// kill it. `cancelled` is what tells the reader task that a process which
/// just died was killed on purpose rather than crashed.
#[derive(Default)]
pub struct EncodeState {
    running: Mutex<HashMap<String, CommandChild>>,
    cancelled: Mutex<HashSet<String>>,
}

impl EncodeState {
    fn register(&self, job_id: &str, child: CommandChild) {
        if let Ok(mut running) = self.running.lock() {
            running.insert(job_id.to_string(), child);
        }
    }

    /// Removes a job's handle, whether it is being killed or has finished.
    fn take(&self, job_id: &str) -> Option<CommandChild> {
        self.running.lock().ok()?.remove(job_id)
    }

    fn mark_cancelled(&self, job_id: &str) {
        if let Ok(mut cancelled) = self.cancelled.lock() {
            cancelled.insert(job_id.to_string());
        }
    }

    /// Whether this job was cancelled, clearing the flag as it reads it.
    fn take_cancelled(&self, job_id: &str) -> bool {
        self.cancelled
            .lock()
            .map(|mut cancelled| cancelled.remove(job_id))
            .unwrap_or(false)
    }

    /// Kills everything still running. Called when the window goes away, so
    /// closing the app mid-encode cannot leave an orphaned ffmpeg behind.
    pub fn kill_all(&self) {
        let Ok(mut running) = self.running.lock() else { return };

        for (job_id, child) in running.drain() {
            eprintln!("[encode] killing job {job_id} on shutdown");
            let _ = child.kill();
        }
    }
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

/// One progress tick. `job_id` lets the frontend drop events from a job it has
/// already walked away from.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    job_id: String,
    /// 0–100, clamped.
    percent: f64,
    /// Encoded video seconds per real second, or null before ffmpeg knows.
    speed: Option<f64>,
    /// Wall clock left, or null while it is still guesswork.
    eta_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompletePayload {
    job_id: String,
    exit_code: i32,
    output_path: String,
    output_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload {
    job_id: String,
    /// A finished Czech sentence. Never ffmpeg output.
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CancelledPayload {
    job_id: String,
}

/// What a poster run produced. Both halves are optional at the type level
/// because WebP is only made when asked for.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PosterResult {
    pub jpeg_path: String,
    pub jpeg_size_bytes: u64,
    pub webp_path: Option<String>,
    pub webp_size_bytes: Option<u64>,
}

// ---------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------

/// Characters that have no business being in an ffmpeg flag or a macOS path.
///
/// The sidecar is spawned directly rather than through a shell, so nothing
/// here can actually be interpreted — this is a second lock on the door. It is
/// deliberately narrow: `&`, `<`, `>`, `(`, `)` and a bare `$` are all legal in
/// real file names, and rejecting „Q&A rozhovor.mp4" would be a worse bug than
/// the one being guarded against.
const FORBIDDEN: [char; 5] = [';', '|', '`', '\n', '\r'];

fn validate(args: &[String]) -> Result<(), String> {
    if args.is_empty() {
        eprintln!("[encode] refusing an empty argument list");
        return Err(BAD_ARGUMENTS.to_string());
    }

    for arg in args {
        if arg.contains(&FORBIDDEN[..]) || arg.contains('\0') || arg.contains("$(") {
            eprintln!("[encode] refusing argument with shell metacharacters: {arg:?}");
            return Err(BAD_ARGUMENTS.to_string());
        }
    }

    Ok(())
}

/// `buildArgs` always puts the output file last, and the encode needs to know
/// it: a cancelled or failed run has to take its half-written file with it.
fn output_path_of(args: &[String]) -> PathBuf {
    PathBuf::from(args.last().cloned().unwrap_or_default())
}

/// A truncated MP4 has no moov atom and plays nowhere. Leaving one behind
/// after a cancel or a failure is worse than leaving nothing.
fn remove_partial(path: &Path) {
    if !path.exists() {
        return;
    }
    match std::fs::remove_file(path) {
        Ok(()) => println!("[encode] removed partial output {}", path.display()),
        Err(error) => eprintln!("[encode] cannot remove {}: {error}", path.display()),
    }
}

fn size_of(path: &Path) -> u64 {
    std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Progress parsing
// ---------------------------------------------------------------------------

/// The values accumulated from one `-progress` block.
///
/// ffmpeg writes one `key=value` per line and closes each block with
/// `progress=continue` (or `progress=end`), so the keys are collected as they
/// arrive and read out when the block closes.
#[derive(Default)]
struct ProgressBlock {
    /// Media time already encoded, in seconds.
    out_time_seconds: Option<f64>,
    /// Multiplier: 2.4 means „2.4 seconds of video per second of waiting".
    speed: Option<f64>,
}

impl ProgressBlock {
    /// Consumes one `key=value` line. Returns true when the block is complete.
    fn absorb(&mut self, line: &str) -> bool {
        let Some((key, value)) = line.split_once('=') else {
            return false;
        };
        let key = key.trim();
        let value = value.trim();

        match key {
            "out_time_us" => {
                if let Some(seconds) = parse_micros(value) {
                    self.out_time_seconds = Some(seconds);
                }
            }
            // Despite the name ffmpeg has always written microseconds here.
            // Only consulted when `out_time_us` is absent, so the quirk cannot
            // do any damage on builds that report both.
            "out_time_ms" => {
                if self.out_time_seconds.is_none() {
                    if let Some(seconds) = parse_micros(value) {
                        self.out_time_seconds = Some(seconds);
                    }
                }
            }
            "speed" => self.speed = parse_speed(value),
            "progress" => return true,
            _ => {}
        }

        false
    }
}

/// Parses a plain number, rejecting `N/A` and anything else ffmpeg improvises.
fn parse_number(value: &str) -> Option<f64> {
    value.parse::<f64>().ok().filter(|number| number.is_finite())
}

/// Microseconds of encoded media as seconds.
///
/// Before the first frame is written ffmpeg reports `AV_NOPTS_VALUE`, which
/// arrives as `-9223372036854775807`. Taken at face value it would turn the
/// ETA into a number of years, so anything negative is simply not a time yet.
fn parse_micros(value: &str) -> Option<f64> {
    parse_number(value)
        .filter(|micros| *micros >= 0.0)
        .map(|micros| micros / 1_000_000.0)
}

/// `"2.4x"` → `Some(2.4)`. `"N/A"` and `"0x"` → `None`.
fn parse_speed(value: &str) -> Option<f64> {
    let trimmed = value.trim().trim_end_matches('x').trim();
    parse_number(trimmed).filter(|speed| *speed > 0.0)
}

/// How far along the run is, as a percentage of the source duration.
fn percent_of(out_time_seconds: f64, duration_seconds: f64) -> f64 {
    // A file whose duration ffprobe could not read reports 0, and dividing by
    // it would put the shape proxy at NaN % for the whole run.
    if duration_seconds <= 0.0 || !duration_seconds.is_finite() {
        return 0.0;
    }
    ((out_time_seconds / duration_seconds) * 100.0).clamp(0.0, 100.0)
}

/// Wall clock left: the media still to encode, divided by the current rate.
fn eta_of(out_time_seconds: f64, duration_seconds: f64, speed: Option<f64>) -> Option<f64> {
    let speed = speed?;
    let remaining_media = (duration_seconds - out_time_seconds).max(0.0);
    let eta = remaining_media / speed;
    eta.is_finite().then_some(eta)
}

// ---------------------------------------------------------------------------
// The encode command
// ---------------------------------------------------------------------------

/// Runs one encode, streaming progress until ffmpeg stops.
///
/// Returns as soon as the process is spawned and registered; everything after
/// that reaches the frontend as an event, so the UI is never blocked on a
/// long-running invoke. `job_id` is generated per run and stamped on every
/// event, which is what makes a second encode after a cancel come up clean.
#[tauri::command]
pub async fn start_encode(
    app: AppHandle,
    state: State<'_, EncodeState>,
    args: Vec<String>,
    duration_seconds: f64,
    job_id: String,
) -> Result<(), String> {
    validate(&args)?;

    let output = output_path_of(&args);

    // Catching this here turns an ffmpeg failure ten seconds in into an
    // immediate, accurate sentence about the folder the user just picked.
    if let Some(parent) = output.parent() {
        if parent.as_os_str().is_empty() {
            // A bare file name: the current directory, which always exists.
        } else if !parent.is_dir() {
            eprintln!("[encode] output directory does not exist: {}", parent.display());
            return Err(NO_WRITE_PERMISSION.to_string());
        }
    }

    println!("[encode] job {job_id}: ffmpeg {}", args.join(" "));

    let command = app.shell().sidecar(FFMPEG).map_err(|error| {
        eprintln!("[encode] cannot resolve ffmpeg: {error}");
        MISSING_BINARY.to_string()
    })?;

    let (mut events, child) = command.args(&args).spawn().map_err(|error| {
        eprintln!("[encode] cannot spawn ffmpeg: {error}");
        MISSING_BINARY.to_string()
    })?;

    state.register(&job_id, child);

    let handle = app.clone();
    let duration = duration_seconds;
    let job = job_id.clone();

    tauri::async_runtime::spawn(async move {
        let mut block = ProgressBlock::default();
        let mut last_emit: Option<Instant> = None;
        let mut stderr = String::new();
        let mut last_percent = 0.0_f64;

        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let closed = block.absorb(line.trim());
                    if !closed {
                        continue;
                    }

                    let out_time = block.out_time_seconds.unwrap_or(0.0);
                    let percent = percent_of(out_time, duration);
                    let speed = block.speed;
                    // A block boundary resets the accumulator; `speed` is only
                    // reported every few blocks on some builds, so carry it.
                    block = ProgressBlock { out_time_seconds: None, speed };

                    // Ten a second is plenty, but never swallow a tick that
                    // moves the number — a stalled 97 % looks like a hang.
                    let due = last_emit
                        .map(|at| at.elapsed() >= EMIT_INTERVAL)
                        .unwrap_or(true);
                    if !due && (percent - last_percent).abs() < 1.0 {
                        continue;
                    }

                    last_emit = Some(Instant::now());
                    last_percent = percent;

                    let payload = ProgressPayload {
                        job_id: job.clone(),
                        percent,
                        speed,
                        eta_seconds: eta_of(out_time, duration, speed),
                    };

                    if let Err(error) = handle.emit("encode-progress", payload) {
                        eprintln!("[encode] cannot emit progress: {error}");
                    }
                }

                CommandEvent::Stderr(bytes) => {
                    // stderr is for the log file only. Nothing is parsed out of
                    // it — that is what `-progress pipe:1` is for.
                    let line = String::from_utf8_lossy(&bytes);
                    eprintln!("[ffmpeg] {}", line.trim_end());
                    if stderr.len() < MAX_STDERR_BYTES {
                        stderr.push_str(line.trim_end());
                        stderr.push('\n');
                    }
                }

                CommandEvent::Error(message) => {
                    eprintln!("[encode] stream error: {message}");
                    stderr.push_str(&format!("[stream error] {message}\n"));
                }

                CommandEvent::Terminated(payload) => {
                    let code = payload.code.unwrap_or(-1);
                    let signal = payload.signal;
                    println!("[encode] job {job} terminated: code {code:?} signal {signal:?}");

                    log::append(
                        &handle,
                        &format!(
                            "===== job {job} — exit {code} signal {signal:?} =====\n{stderr}\n",
                        ),
                    );

                    finish(&handle, &job, code, &output);
                    break;
                }

                _ => {}
            }
        }
    });

    Ok(())
}

/// Decides which of the three terminal events a finished process deserves.
///
/// A killed process and a failed one look identical from here, which is why
/// `cancel_encode` leaves a flag behind before it kills anything.
fn finish(app: &AppHandle, job_id: &str, exit_code: i32, output: &Path) {
    let state = app.state::<EncodeState>();
    // Whatever happened, this job is no longer something to kill on shutdown.
    let _ = state.take(job_id);

    if state.take_cancelled(job_id) {
        remove_partial(output);
        emit(app, "encode-cancelled", CancelledPayload { job_id: job_id.to_string() });
        return;
    }

    if exit_code != 0 {
        // A file that stops in the middle has no moov atom and plays nowhere;
        // leaving it next to the source only invites someone to upload it.
        remove_partial(output);
        emit(
            app,
            "encode-error",
            ErrorPayload { job_id: job_id.to_string(), message: ENCODE_FAILED.to_string() },
        );
        return;
    }

    if !output.exists() {
        eprintln!("[encode] ffmpeg exited 0 but wrote no file to {}", output.display());
        emit(
            app,
            "encode-error",
            ErrorPayload { job_id: job_id.to_string(), message: ENCODE_FAILED.to_string() },
        );
        return;
    }

    emit(
        app,
        "encode-complete",
        CompletePayload {
            job_id: job_id.to_string(),
            exit_code,
            output_path: output.to_string_lossy().into_owned(),
            output_size_bytes: size_of(output),
        },
    );
}

fn emit<P: Serialize + Clone>(app: &AppHandle, event: &str, payload: P) {
    if let Err(error) = app.emit(event, payload) {
        eprintln!("[encode] cannot emit `{event}`: {error}");
    }
}

/// Stops a running job.
///
/// The partial file is deleted by the reader task once the process is actually
/// gone — deleting it from here would race the encoder's own last write.
#[tauri::command]
pub async fn cancel_encode(
    state: State<'_, EncodeState>,
    job_id: String,
) -> Result<(), String> {
    // Set before the kill, so the reader task cannot see the process die and
    // call it a crash.
    state.mark_cancelled(&job_id);

    match state.take(&job_id) {
        Some(child) => {
            println!("[encode] cancelling job {job_id}");
            child.kill().map_err(|error| {
                eprintln!("[encode] cannot kill job {job_id}: {error}");
                "Kompresi se nepodařilo zastavit.".to_string()
            })
        }
        None => {
            // Already finished on its own between the click and this call.
            // Nothing will consume the flag that was just set, so clear it.
            state.take_cancelled(&job_id);
            println!("[encode] job {job_id} was no longer running");
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Poster generation
// ---------------------------------------------------------------------------

/// `clip-web.mp4` → `clip-web-poster.jpg`, in the same directory.
fn poster_path(video: &Path, extension: &str) -> PathBuf {
    let stem = video
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "poster".to_string());

    video.with_file_name(format!("{stem}-poster.{extension}"))
}

/// Extracts the poster frame from the **encoded output**, not the source.
///
/// Taking it from the finished file is what guarantees the image matches the
/// video's dimensions exactly, including any rounding the scale filter did.
#[tauri::command]
pub async fn generate_poster(
    app: AppHandle,
    video_path: String,
    time_seconds: f64,
    also_webp: bool,
) -> Result<PosterResult, String> {
    let video = PathBuf::from(&video_path);
    let time = if time_seconds.is_finite() && time_seconds > 0.0 {
        time_seconds
    } else {
        0.0
    };
    let time_string = format!("{time:.3}");

    let jpeg = poster_path(&video, "jpg");
    let jpeg_string = jpeg.to_string_lossy().into_owned();

    run_sidecar(
        &app,
        FFMPEG,
        &[
            "-v", "error",
            "-i", &video_path,
            "-ss", &time_string,
            "-frames:v", "1",
            "-q:v", "2",
            "-y",
            &jpeg_string,
        ],
    )
    .await
    .map_err(poster_error)?;

    if !jpeg.exists() {
        eprintln!("[poster] ffmpeg exited 0 but wrote nothing to {jpeg_string}");
        return Err(POSTER_FAILED.to_string());
    }

    println!("[poster] wrote {jpeg_string}");

    let mut result = PosterResult {
        jpeg_size_bytes: size_of(&jpeg),
        jpeg_path: jpeg_string,
        webp_path: None,
        webp_size_bytes: None,
    };

    if !also_webp {
        return Ok(result);
    }

    let webp = poster_path(&video, "webp");
    let webp_string = webp.to_string_lossy().into_owned();

    run_sidecar(
        &app,
        FFMPEG,
        &[
            "-v", "error",
            "-i", &video_path,
            "-ss", &time_string,
            "-frames:v", "1",
            "-c:v", "libwebp",
            "-quality", "78",
            "-y",
            &webp_string,
        ],
    )
    .await
    .map_err(poster_error)?;

    if !webp.exists() {
        eprintln!("[poster] ffmpeg exited 0 but wrote no webp to {webp_string}");
        return Err(POSTER_FAILED.to_string());
    }

    println!("[poster] wrote {webp_string}");

    result.webp_size_bytes = Some(size_of(&webp));
    result.webp_path = Some(webp_string);

    Ok(result)
}

fn poster_error(error: SidecarError) -> String {
    match error {
        SidecarError::Missing => MISSING_BINARY.to_string(),
        SidecarError::Failed => POSTER_FAILED.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_arguments_are_refused() {
        assert!(validate(&[]).is_err());
    }

    #[test]
    fn shell_metacharacters_are_refused() {
        let bad = ["a; rm -rf /".to_string()];
        assert!(validate(&bad).is_err());
        let bad = ["a | tee".to_string()];
        assert!(validate(&bad).is_err());
        let bad = ["$(whoami)".to_string()];
        assert!(validate(&bad).is_err());
    }

    #[test]
    fn ordinary_file_names_survive_validation() {
        // Ampersands, spaces, accents and parentheses are all legal on macOS
        // and all appear in real marketing exports.
        let args = vec![
            "-i".to_string(),
            "/Users/kdo/Videa/Q&A rozhovor (finální) — 2024.mov".to_string(),
            "/Users/kdo/Videa/Q&A rozhovor-web.mp4".to_string(),
        ];
        assert!(validate(&args).is_ok());
    }

    #[test]
    fn output_is_the_last_argument() {
        let args = vec!["-i".to_string(), "in.mov".to_string(), "out.mp4".to_string()];
        assert_eq!(output_path_of(&args), PathBuf::from("out.mp4"));
    }

    #[test]
    fn speed_strips_its_suffix_and_rejects_nonsense() {
        assert_eq!(parse_speed("2.4x"), Some(2.4));
        assert_eq!(parse_speed("0.98x"), Some(0.98));
        assert_eq!(parse_speed("N/A"), None);
        assert_eq!(parse_speed("0x"), None);
        assert_eq!(parse_speed(""), None);
    }

    #[test]
    fn a_progress_block_closes_on_the_progress_key() {
        let mut block = ProgressBlock::default();
        assert!(!block.absorb("frame=312"));
        assert!(!block.absorb("fps=48.2"));
        assert!(!block.absorb("out_time_us=13000000"));
        assert!(!block.absorb("speed=2.4x"));
        assert!(block.absorb("progress=continue"));

        assert_eq!(block.out_time_seconds, Some(13.0));
        assert_eq!(block.speed, Some(2.4));
    }

    #[test]
    fn out_time_us_wins_over_the_legacy_ms_key() {
        let mut block = ProgressBlock::default();
        block.absorb("out_time_us=13000000");
        block.absorb("out_time_ms=999");
        assert_eq!(block.out_time_seconds, Some(13.0));
    }

    #[test]
    fn the_no_pts_sentinel_is_not_a_timestamp() {
        // ffmpeg reports AV_NOPTS_VALUE until the first frame lands.
        let mut block = ProgressBlock::default();
        block.absorb("out_time_us=-9223372036854775807");
        block.absorb("out_time_ms=-9223372036854775807");
        assert_eq!(block.out_time_seconds, None);
    }

    #[test]
    fn speed_survives_ffmpegs_column_padding() {
        // Real output from the bundled build: `speed=  22x`.
        let mut block = ProgressBlock::default();
        block.absorb("speed=  22x");
        assert_eq!(block.speed, Some(22.0));
    }

    #[test]
    fn na_values_leave_the_block_empty() {
        let mut block = ProgressBlock::default();
        block.absorb("out_time_us=N/A");
        block.absorb("speed=N/A");
        assert_eq!(block.out_time_seconds, None);
        assert_eq!(block.speed, None);
    }

    #[test]
    fn percent_is_clamped_at_both_ends() {
        assert_eq!(percent_of(0.0, 10.0), 0.0);
        assert_eq!(percent_of(5.0, 10.0), 50.0);
        // ffmpeg routinely overshoots the reported duration by a frame or two.
        assert_eq!(percent_of(10.4, 10.0), 100.0);
        // A file whose duration could not be read must not divide by zero.
        assert_eq!(percent_of(5.0, 0.0), 0.0);
    }

    #[test]
    fn eta_needs_a_speed_to_exist() {
        assert_eq!(eta_of(5.0, 10.0, Some(2.5)), Some(2.0));
        assert_eq!(eta_of(5.0, 10.0, None), None);
        // Past the end: no negative countdown.
        assert_eq!(eta_of(12.0, 10.0, Some(2.0)), Some(0.0));
    }

    #[test]
    fn poster_takes_the_video_stem_plus_poster() {
        let video = PathBuf::from("/Users/kdo/Videa/rozhovor-web.mp4");
        assert_eq!(
            poster_path(&video, "jpg"),
            PathBuf::from("/Users/kdo/Videa/rozhovor-web-poster.jpg")
        );
        assert_eq!(
            poster_path(&video, "webp"),
            PathBuf::from("/Users/kdo/Videa/rozhovor-web-poster.webp")
        );
    }

    #[test]
    fn poster_survives_a_dotted_file_name() {
        let video = PathBuf::from("/tmp/klip.v2.final.mp4");
        assert_eq!(
            poster_path(&video, "jpg"),
            PathBuf::from("/tmp/klip.v2.final-poster.jpg")
        );
    }
}
