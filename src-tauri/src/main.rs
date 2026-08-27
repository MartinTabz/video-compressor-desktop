// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod encode;
mod log;
mod media;
mod probe;

use tauri::{Manager, RunEvent, WindowEvent};

use encode::EncodeState;

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(EncodeState::default())
        .invoke_handler(tauri::generate_handler![
            probe::check_ffmpeg,
            probe::probe_video,
            media::extract_frame,
            media::file_exists,
            media::reveal_in_file_manager,
            encode::start_encode,
            encode::cancel_encode,
            encode::generate_poster,
            log::open_log,
        ])
        .on_window_event(|window, event| {
            // Closing the window while ffmpeg is mid-frame would otherwise
            // leave the process running with nothing left to talk to.
            if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
                window.state::<EncodeState>().kill_all();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Quitting from the menu never raises a window event, so the same
        // cleanup has to hang off the app's own exit as well.
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            handle.state::<EncodeState>().kill_all();
        }
    });
}
