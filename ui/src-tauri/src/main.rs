#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod changes;
mod codex;
mod coolify_forms;
mod files;
mod gateway_auth;
mod gitea_auth;
mod mcp_tools;
mod platform_tools;
mod publish;
mod scheduler;
mod skills;
mod trust;

/// The company package registry (Nexus).
pub const NEXUS_NPM: &str = "https://nexus.digitalx.srt/repository/npm-group/";
pub const NEXUS_PIP: &str = "https://nexus.digitalx.srt/repository/pypi-hosted/simple";
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
            files::open_local_file,
            changes::git_changes,
            trust::trust_status,
            trust::trust_install,
            gateway_auth::gateway_status,
            gateway_auth::gateway_login,
            gateway_auth::gateway_logout,
            gitea_auth::gitea_status,
            gitea_auth::gitea_login,
            gitea_auth::gitea_logout,
            publish::publish_changes,
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
