// SPDX-FileCopyrightText: 2019-2022, The Tauri Programme in the Commons Conservancy
// SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, AchimLindt
//
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

const MAIN_WINDOW: &str = "main";
const CAPTURE_WINDOW: &str = "capture";
// passed by the autostart entry, see launched_by_autostart (docs/specs/tray-quick-capture.md)
const AUTOSTART_ARG: &str = "--autostart";
// tray menu -> main window events (names shared with utils/quickCapture.ts)
const QUICK_CAPTURE_OPEN_EVENT: &str = "quick-capture:open";
const APP_QUIT_REQUESTED_EVENT: &str = "app:quit-requested";
// the frontend gets this long to flush pending saves before "Quit" exits anyway
const QUIT_TIMEOUT: Duration = Duration::from_millis(2000);

static EXITING: AtomicBool = AtomicBool::new(false);

fn exit_app(app: &AppHandle) {
    if !EXITING.swap(true, Ordering::SeqCst) {
        app.exit(0);
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// True if the app was started by the autostart entry (it passes AUTOSTART_ARG); used by the
/// frontend for the "start minimized" setting.
#[tauri::command]
fn launched_by_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

/// Tray icon with the app icon. Left click shows the main window; the menu texts are English
/// because Rust does not know the UI locale (stored in the frontend's store).
#[cfg(desktop)]
fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let open_item = MenuItem::with_id(app, "tray-open", "Open", true, None::<&str>)?;
    let capture_item = MenuItem::with_id(app, "tray-quick-capture", "Quick capture", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &capture_item, &separator, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Kanri")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => show_main_window(app),
            // one code path: the main window opens the capture window like the global shortcut does
            "tray-quick-capture" => {
                let _ = app.emit_to(MAIN_WINDOW, QUICK_CAPTURE_OPEN_EVENT, ());
            }
            "tray-quit" => {
                // the main window flushes pending saves and destroys itself, which exits the app
                // (see on_window_event); the timeout covers a frontend that does not answer
                if app.emit_to(MAIN_WINDOW, APP_QUIT_REQUESTED_EVENT, ()).is_err()
                    || app.get_webview_window(MAIN_WINDOW).is_none()
                {
                    exit_app(app);
                    return;
                }
                let handle = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(QUIT_TIMEOUT);
                    exit_app(&handle);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        if std::path::Path::new("/dev/dri").exists()
            && std::env::var("WAYLAND_DISPLAY").is_err()
            && std::env::var("XDG_SESSION_TYPE").unwrap_or_default() == "x11"
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Avoid restoring an accidentally hidden window on startup.
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                // the capture window is placed on the monitor of the mouse pointer each time
                .with_denylist(&[CAPTURE_WINDOW])
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .invoke_handler(tauri::generate_handler![launched_by_autostart])
        .on_window_event(|window, event| {
            // closing the main window ends the app, even if the hidden capture window still exists
            // (with "close to tray" the frontend hides the main window instead of closing it)
            if window.label() == MAIN_WINDOW {
                if let WindowEvent::Destroyed = event {
                    exit_app(window.app_handle());
                }
            }
        })
        .setup(|app| {
            #[cfg(desktop)]
            {
                let _ = app
                    .handle()
                    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                        show_main_window(app);
                    }));
                app.handle()
                    .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;
                create_tray(app)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
