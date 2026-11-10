// Release builds are GUI applications. Without this attribute Windows gives the
// process a console, which is the stray command window that appeared beside the
// app. Debug builds keep the console so `npm run tauri dev` still shows logs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod automation;
mod commands;
mod core;
mod database;
mod diagnostics;
mod engines;
mod error;
mod queue;
mod shell;
mod tools;
mod utils;
mod workflow;

use crate::utils::paths;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalRect, PhysicalSize};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Explorer and the NSIS installer can start the app with a working directory
/// that has already been deleted. WebView2 refuses to initialise in that state
/// (`E_INVALIDARG`), which leaves the window blank, so fall back to the folder
/// that holds the executable.
fn restore_working_directory() {
    if std::env::current_dir().is_ok() {
        return;
    }
    let Some(directory) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf))
    else {
        return;
    };
    if std::env::set_current_dir(&directory).is_ok() {
        log::warn!(
            "the working directory was missing; using {} instead",
            directory.display()
        );
    }
}

const WINDOW_MARGIN_LOGICAL: f64 = 8.0;
const WINDOW_HORIZONTAL_DRAG_ROOM_LOGICAL: f64 = 96.0;

fn fitted_inner_size(
    inner: PhysicalSize<u32>,
    work: PhysicalRect<i32, u32>,
    frame: PhysicalSize<u32>,
    scale_factor: f64,
) -> PhysicalSize<u32> {
    let margin = (WINDOW_MARGIN_LOGICAL * scale_factor).round().max(0.0) as u32;
    let drag_room = (WINDOW_HORIZONTAL_DRAG_ROOM_LOGICAL * scale_factor)
        .round()
        .max(0.0) as u32;
    // A window as wide as the work area cannot follow the cursor horizontally.
    let width_fit = work
        .size
        .width
        .saturating_sub(frame.width)
        .saturating_sub(margin.saturating_mul(2));
    let width_with_drag_room = work
        .size
        .width
        .saturating_sub(frame.width)
        .saturating_sub(drag_room.saturating_mul(2));
    let max_width = width_fit.min(width_with_drag_room).max(1);
    let max_height = work
        .size
        .height
        .saturating_sub(frame.height)
        .saturating_sub(margin.saturating_mul(2))
        .max(1);
    PhysicalSize::new(inner.width.min(max_width), inner.height.min(max_height))
}

fn centered_outer_position(
    work: PhysicalRect<i32, u32>,
    outer: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let x = work.position.x as i64 + (work.size.width as i64 - outer.width as i64).div_euclid(2);
    let y = work.position.y as i64 + (work.size.height as i64 - outer.height as i64).div_euclid(2);
    PhysicalPosition::new(x as i32, y as i32)
}

fn fit_window_to_work_area(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()? else {
        return Ok(());
    };
    let inner = window.inner_size()?;
    let outer = window.outer_size()?;
    let frame = PhysicalSize::new(
        outer.width.saturating_sub(inner.width),
        outer.height.saturating_sub(inner.height),
    );
    let work = *monitor.work_area();
    let fitted = fitted_inner_size(inner, work, frame, monitor.scale_factor());
    if fitted != inner {
        window.set_size(fitted)?;
    }
    let fitted_outer = PhysicalSize::new(
        fitted.width.saturating_add(frame.width),
        fitted.height.saturating_add(frame.height),
    );
    window.set_position(centered_outer_position(work, fitted_outer))?;
    log::info!(
        "main window fitted: inner {}x{}, outer {}x{}, work area {}x{} at {},{}",
        fitted.width,
        fitted.height,
        fitted_outer.width,
        fitted_outer.height,
        work.size.width,
        work.size.height,
        work.position.x,
        work.position.y
    );
    Ok(())
}

fn main() {
    let process_started = std::time::Instant::now();
    restore_working_directory();

    // A GUI build has no stdout. Registering the stdout target in release was
    // pointless and could touch an invalid handle, so it stays debug-only.
    let log_targets = {
        let folder = Target::new(TargetKind::Folder {
            path: paths::logs_root(),
            file_name: Some("universal-converter".to_owned()),
        });
        #[cfg(debug_assertions)]
        {
            vec![folder, Target::new(TargetKind::Stdout)]
        }
        #[cfg(not(debug_assertions))]
        {
            vec![folder]
        }
    };

    tauri::Builder::default()
        // Must be the first plugin: a second launch forwards Explorer's paths
        // to this window instead of opening a duplicate application.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = shell::files_from_args(argv.into_iter().map(std::ffi::OsString::from));
            shell::focus_and_forward(app, paths);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                // Five rotating files of at most 10 MB: enough history to
                // diagnose a failure without letting logs grow forever.
                .max_file_size(10 * 1024 * 1024)
                .rotation_strategy(RotationStrategy::KeepSome(5))
                .targets(log_targets)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let setup_started = std::time::Instant::now();
            paths::ensure_storage_layout()?;
            log::info!("storage ready at {}", paths::data_root().display());
            commands::install(app.handle())?;
            // Same typed lookup the commands use, so a state-management mistake
            // shows up here instead of as a failed click later.
            if app.try_state::<commands::AppState>().is_none() {
                return Err("application state was not managed".into());
            }
            log::info!("engines and queue initialised");
            log::info!(
                "startup state ready in {} ms",
                setup_started.elapsed().as_millis()
            );

            let show = MenuItemBuilder::with_id("show", "Show Universal Converter").build(app)?;
            let queue = MenuItemBuilder::with_id("queue", "Open queue").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show, &queue, &quit])
                .build()?;
            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or("the application icon is missing")?;
            TrayIconBuilder::with_id("universal-converter")
                .icon(icon)
                .tooltip("Universal Converter — files stay on this PC")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "queue" => {
                        show_main_window(app);
                        let _ = app.emit("converter://navigate", "/queue");
                    }
                    "quit" => app.exit(0),
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
                })
                .build(app)?;
            log::info!("tray icon ready");
            let Some(window) = app.get_webview_window("main") else {
                // WebView2 occasionally refuses to create its controller. Say so
                // instead of leaving a blank window that looks hung forever.
                log::error!("the main window was created without a webview");
                use tauri_plugin_dialog::DialogExt;
                app.dialog()
                    .message(
                        "Universal Converter could not start its window. Install or repair the \
                         Microsoft Edge WebView2 Runtime, then try again.",
                    )
                    .title("Universal Converter could not start")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                    .blocking_show();
                return Err("the main window has no webview".into());
            };
            if let Err(error) = fit_window_to_work_area(&window) {
                log::warn!("could not fit the main window to the monitor work area: {error}");
            }
            if let Err(error) = window.show() {
                log::warn!("could not show the main window: {error}");
            }
            let _ = window.set_focus();
            log::info!(
                "main window shown in {} ms",
                process_started.elapsed().as_millis()
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::probe_files,
            commands::list_engines,
            commands::rescan_engines,
            commands::list_capabilities,
            commands::pdf_capabilities,
            commands::ocr_capabilities,
            commands::inspect_pdf,
            commands::inspect_pdf_deep,
            commands::extract_pdf_images,
            commands::compare_pdfs,
            commands::pdf_page_preview,
            commands::media_capabilities,
            commands::archive_capabilities,
            commands::inspect_archive,
            commands::document_sheets,
            commands::inspect_media,
            commands::media_thumbnail,
            commands::gif_preview,
            commands::submit_jobs,
            commands::list_jobs,
            commands::queue_stats,
            commands::cancel_job,
            commands::retry_job,
            commands::clear_finished_jobs,
            commands::load_history,
            commands::clear_history,
            commands::recent_files,
            commands::list_favorites,
            commands::set_favorite,
            commands::shell_integration,
            commands::set_shell_integration,
            commands::take_opened_files,
            commands::get_settings,
            commands::save_settings,
            commands::reset_settings,
            commands::app_info,
            commands::diagnostics_report,
            commands::export_diagnostics,
            commands::export_backup,
            commands::inspect_backup,
            commands::restore_backup,
            commands::clear_cache,
            commands::list_presets,
            commands::save_preset,
            commands::delete_preset,
            commands::list_automation_rules,
            commands::save_automation_rule,
            commands::delete_automation_rule,
            commands::automation_status,
            commands::set_automation_paused,
            commands::automation_logs,
            commands::clear_automation_log,
            commands::export_presets,
            commands::import_presets,
            commands::import_presets_file,
            commands::duplicate_preset,
            commands::install_default_presets,
            commands::list_workflows,
            commands::save_workflow,
            commands::delete_workflow,
            commands::start_workflow,
            commands::workflow_runs,
            commands::cancel_workflow_run,
            commands::clear_workflow_runs,
            commands::system_resources,
            commands::purge_temp_files,
            commands::forget_history,
            commands::storage_root,
            commands::image_info,
            commands::compare_images,
            commands::read_metadata,
            commands::edit_metadata,
            commands::remove_metadata,
            commands::compare_metadata,
            commands::file_info,
            commands::hash_files,
            commands::verify_checksum,
            commands::compare_files,
            commands::find_duplicates,
            commands::calculate_size,
            commands::inspect_signature,
            commands::export_text
        ])
        .build(tauri::generate_context!())
        .expect("Universal Converter could not start its window")
        .run(|handle, event| {
            if let tauri::RunEvent::Exit = event {
                commands::purge_on_exit(handle);
            }
        });
}

#[cfg(test)]
mod window_fit_tests {
    use super::*;

    fn work(x: i32, y: i32, width: u32, height: u32) -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(width, height),
        }
    }

    #[test]
    fn keeps_the_configured_size_when_it_fits() {
        let fitted = fitted_inner_size(
            PhysicalSize::new(1280, 820),
            work(0, 0, 1920, 1040),
            PhysicalSize::new(16, 39),
            1.0,
        );
        assert_eq!(fitted, PhysicalSize::new(1280, 820));
    }

    #[test]
    fn clamps_oversized_windows_to_the_work_area() {
        let cases = [
            (
                1.25,
                PhysicalSize::new(1600, 1025),
                PhysicalSize::new(18, 47),
                work(0, 0, 1920, 1032),
                PhysicalSize::new(1600, 965),
            ),
            (
                1.5,
                PhysicalSize::new(1920, 1050),
                PhysicalSize::new(22, 56),
                work(0, 0, 1920, 1020),
                PhysicalSize::new(1610, 940),
            ),
            (
                1.75,
                PhysicalSize::new(2240, 1435),
                PhysicalSize::new(26, 65),
                work(0, 0, 1920, 1015),
                PhysicalSize::new(1558, 922),
            ),
            (
                2.0,
                PhysicalSize::new(2560, 1640),
                PhysicalSize::new(30, 74),
                work(0, 0, 1920, 1010),
                PhysicalSize::new(1506, 904),
            ),
        ];
        for (scale, inner, frame, work_area, expected) in cases {
            assert_eq!(
                fitted_inner_size(inner, work_area, frame, scale),
                expected,
                "scale {scale}"
            );
        }
    }

    #[test]
    fn never_enlarges_a_smaller_window() {
        let fitted = fitted_inner_size(
            PhysicalSize::new(900, 600),
            work(0, 0, 1920, 1020),
            PhysicalSize::new(22, 56),
            1.5,
        );
        assert_eq!(fitted, PhysicalSize::new(900, 600));
    }

    #[test]
    fn centers_in_an_offset_work_area() {
        let position =
            centered_outer_position(work(1920, 0, 1920, 1020), PhysicalSize::new(1896, 996));
        assert_eq!(position, PhysicalPosition::new(1932, 12));
    }
}
