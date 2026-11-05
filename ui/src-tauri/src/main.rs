#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod codex;
mod scheduler;
mod skills;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage(codex::Bridge::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            codex::codex_connect,
            codex::codex_request,
            codex::codex_respond,
            codex::codex_pending,
            codex::codex_disconnect,
            scheduler::scheduler_list,
            scheduler::scheduler_preview,
            scheduler::scheduler_save,
            scheduler::scheduler_delete,
            scheduler::scheduler_run,
            scheduler::scheduler_stop,
            skills::skill_save,
        ])
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("scheduled-tasks-v1.json");
            app.manage(scheduler::Scheduler::load(path));
            scheduler::start(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Could not build Friday")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                tauri::async_runtime::block_on(async {
                    codex::disconnect(&app.state::<codex::Bridge>()).await;
                });
            }
        });
}
