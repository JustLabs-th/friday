//! Local app-server transport. stdout is JSONL; stderr never enters the protocol.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    process::Stdio,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
};

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>;
type Approvals = Arc<Mutex<HashMap<String, Value>>>;

#[derive(Default)]
pub struct Bridge {
    lifecycle: Mutex<()>,
    connection: Mutex<Option<Connection>>,
    generation: AtomicU64,
}

struct Connection {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    approvals: Approvals,
    next_id: u64,
    alive: Arc<AtomicBool>,
    info: Value,
}

fn executable() -> PathBuf {
    if let Some(path) = std::env::var_os("FRIDAY_CODEX_BIN") {
        return path.into();
    }
    let name = if cfg!(windows) { "codex.exe" } else { "codex" };
    let bundled = if cfg!(windows) { "liam-engine.exe" } else { "liam-engine" };
    // An installed Liam carries its own engine next to the app.
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())) {
        let path = dir.join("engine").join(bundled);
        if path.is_file() {
            return path;
        }
    }
    // Development builds can use the engine built from the source checkout.
    if cfg!(debug_assertions) {
        let target = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../codex-rs/target");
        for profile in ["debug", "release"] {
            let path = target.join(profile).join(name);
            if path.is_file() {
                return path;
            }
        }
    }
    #[cfg(windows)]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let path = PathBuf::from(local).join("Programs/OpenAI/Codex/bin/codex.exe");
        if path.is_file() {
            return path;
        }
    }
    name.into()
}

async fn write(stdin: &Mutex<ChildStdin>, message: &Value) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(message).map_err(|e| e.to_string())?;
    bytes.push(b'\n');
    let mut stdin = stdin.lock().await;
    stdin.write_all(&bytes).await.map_err(|e| e.to_string())?;
    stdin.flush().await.map_err(|e| e.to_string())
}

async fn request(bridge: &Bridge, method: &str, params: Value) -> Result<Value, String> {
    let (stdin, pending, id, rx) = {
        let mut guard = bridge.connection.lock().await;
        let connection = guard.as_mut().ok_or("Liam is not connected")?;
        if !connection.alive.load(Ordering::SeqCst) {
            return Err("Liam disconnected. Reconnect to continue.".into());
        }
        connection.next_id += 1;
        let id = connection.next_id;
        let (tx, rx) = oneshot::channel();
        connection.pending.lock().await.insert(id, tx);
        (connection.stdin.clone(), connection.pending.clone(), id, rx)
    };
    if let Err(error) = write(
        &stdin,
        &json!({"id": id, "method": method, "params": params}),
    )
    .await
    {
        pending.lock().await.remove(&id);
        return Err(error);
    }
    let result = match tokio::time::timeout(std::time::Duration::from_secs(90), rx).await {
        Ok(Ok(result)) => result,
        _ => Err(format!(
            "{method}: response timed out or Liam disconnected"
        )),
    };
    pending.lock().await.remove(&id);
    result
}

pub async fn disconnect(bridge: &Bridge) {
    if let Some(mut connection) = bridge.connection.lock().await.take() {
        connection.alive.store(false, Ordering::SeqCst);
        let _ = connection.child.kill().await;
        let _ = connection.child.wait().await;
    }
}

#[tauri::command]
pub async fn codex_connect(app: AppHandle, bridge: State<'_, Bridge>) -> Result<Value, String> {
    let _lifecycle = bridge.lifecycle.lock().await;
    {
        let guard = bridge.connection.lock().await;
        if let Some(connection) = guard.as_ref() {
            if connection.alive.load(Ordering::SeqCst) {
                return Ok(connection.info.clone());
            }
        }
    }
    disconnect(&bridge).await;
    let binary = executable();
    // The default project is a folder in the user's Documents, in development too, so it behaves like an
    // installed Liam (the source checkout is a Git repo that is not on the company Git server, which
    // would make saving work to Gitea skip). `LIAM_PROJECT_DIR` overrides it for a developer who wants to.
    let cwd = match std::env::var_os("LIAM_PROJECT_DIR").map(PathBuf::from).filter(|p| p.is_absolute()) {
        Some(dir) => dir,
        None => app
            .path()
            .document_dir()
            .map_err(|e| e.to_string())?
            .join("Liam"),
    };
    std::fs::create_dir_all(&cwd).map_err(|e| format!("Cannot create {}: {e}", cwd.display()))?;
    let cwd_text = cwd
        .to_string_lossy()
        .trim_start_matches("\\\\?\\")
        .to_owned();
    let mut command = Command::new(&binary);
    // Signed in to the company gateway: point this Liam run at it (nothing is written to ~/.codex).
    if let Some((args, key)) = crate::gateway_auth::codex_launch(&app) {
        command.args(args).env(crate::gateway_auth::GATEWAY_KEY_ENV, key);
    }
    // Liam's own engine folder, never the user's ~/.codex (their personal Codex sessions stay untouched).
    let home = crate::gateway_auth::user_home(&app).ok_or("Cannot create Liam's data folder")?;
    crate::platform_tools::install_skills(&home);
    command.env("CODEX_HOME", home);
    // Packages come from the company Nexus (curated), not the internet. These are read by npm,
    // pnpm, yarn and pip, so whatever the agent installs in a project goes through it.
    command
        .env("npm_config_registry", crate::NEXUS_NPM)
        .env("PIP_INDEX_URL", crate::NEXUS_PIP);
    // The company root CA ships with Liam: the engine and the tools the agent runs trust it from the
    // file, so nothing is written to the Windows certificate store.
    for (name, value) in crate::trust::tool_env() {
        command.env(name, value);
    }
    // Run the agent's commands in the Windows sandbox (no administrator rights needed): inside the
    // project folder they run without asking, and anything outside it, or on the network, still asks.
    // Without it every command, even listing a folder, needs the person's approval.
    #[cfg(windows)]
    command.args(["-c", r#"windows.sandbox="unelevated""#]);
    command
        .args(["app-server", "--listen", "stdio://"])
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|e| {
        format!(
            "Cannot start {}: {e}. Install Liam or set FRIDAY_CODEX_BIN.",
            binary.display()
        )
    })?;
    let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("Missing Liam stdin")?));
    let stdout = child.stdout.take().ok_or("Missing Liam stdout")?;
    let stderr = child.stderr.take().ok_or("Missing Liam stderr")?;
    let pending: Pending = Arc::default();
    let approvals: Approvals = Arc::default();
    let alive = Arc::new(AtomicBool::new(true));
    let generation = bridge.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let info = json!({"connectionId": generation, "binary": binary, "cwd": cwd_text});
    let reader_pending = pending.clone();
    let reader_approvals = approvals.clone();
    let reader_stdin = stdin.clone();
    let reader_alive = alive.clone();
    let reader_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if message.get("method").is_some() {
                if let Some(id) = message.get("id") {
                    let method = message["method"].as_str().unwrap_or("");
                    if matches!(
                        method,
                        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
                    ) {
                        reader_approvals
                            .lock()
                            .await
                            .insert(id.to_string(), message.clone());
                        let _ = reader_app.emit(
                            "codex-approval",
                            json!({"connectionId": generation, "message": message}),
                        );
                    } else if method == "item/tool/call" {
                        // A company tool (Coolify, ...): run it through the gateway and hand back the text.
                        let id = id.clone();
                        let stdin = reader_stdin.clone();
                        let tool = message["params"]["tool"].as_str().unwrap_or("").to_owned();
                        let thread_id = message["params"]["threadId"].as_str().unwrap_or("").to_owned();
                        let arguments = message["params"]["arguments"].clone();
                        tauri::async_runtime::spawn(async move {
                            let (mut text, success) = crate::mcp_tools::call(&tool, arguments, &thread_id).await;
                            // Keep a runaway answer from filling the model's small context window.
                            if text.chars().count() > 12_000 {
                                text = text.chars().take(12_000).collect::<String>() + "\n…(truncated)";
                            }
                            let _ = write(&stdin, &json!({"id": id, "result": {
                                "contentItems": [{"type": "inputText", "text": text}],
                                "success": success
                            }})).await;
                        });
                    } else {
                        let _ = write(&reader_stdin, &json!({"id": id, "error": {"code": -32601, "message": "Friday cannot render this interactive request yet"}})).await;
                        let _ = reader_app.emit(
                            "codex-unsupported",
                            json!({"connectionId": generation, "message": message}),
                        );
                    }
                } else {
                    // Retire approval requests as soon as the server resolves them or the turn ends.
                    if message["method"] == "turn/completed" {
                        let thread_id = message["params"]["threadId"].clone();
                        let turn_id = message["params"]["turn"]["id"].clone();
                        reader_approvals.lock().await.retain(|_, request| {
                            request["params"]["threadId"] != thread_id
                                || request["params"]["turnId"] != turn_id
                        });
                    } else if message["method"] == "serverRequest/resolved" {
                        let id = message["params"]["requestId"].to_string();
                        reader_approvals.lock().await.remove(&id);
                    }
                    let _ = reader_app.emit(
                        "codex-event",
                        json!({"connectionId": generation, "message": message}),
                    );
                }
            } else if let Some(id) = message.get("id").and_then(Value::as_u64) {
                if let Some(tx) = reader_pending.lock().await.remove(&id) {
                    let result = if let Some(error) = message.get("error") {
                        Err(error["message"]
                            .as_str()
                            .unwrap_or("Liam request failed")
                            .to_owned())
                    } else {
                        Ok(message.get("result").cloned().unwrap_or(Value::Null))
                    };
                    let _ = tx.send(result);
                }
            }
        }
        for (_, tx) in reader_pending.lock().await.drain() {
            let _ = tx.send(Err("Liam disconnected".into()));
        }
        reader_approvals.lock().await.clear();
        if reader_alive.swap(false, Ordering::SeqCst) {
            let _ = reader_app.emit("codex-disconnected", json!({"connectionId": generation}));
        }
    });
    // Drain stderr separately so diagnostics cannot corrupt JSONL or block the server.
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(_)) = lines.next_line().await {}
    });
    *bridge.connection.lock().await = Some(Connection {
        child,
        stdin: stdin.clone(),
        pending,
        approvals,
        alive,
        next_id: 0,
        info,
    });
    let initialized = request(&bridge, "initialize", json!({
        "clientInfo": {"name": "friday_desktop", "title": "Friday", "version": env!("CARGO_PKG_VERSION")},
        "capabilities": {"experimentalApi": true, "requiredHumanApproval": true}
    })).await;
    match initialized {
        Ok(result) => {
            write(&stdin, &json!({"method": "initialized"})).await?;
            let mut guard = bridge.connection.lock().await;
            let connection = guard
                .as_mut()
                .ok_or("Liam disconnected during initialization")?;
            connection.info["server"] = result;
            Ok(connection.info.clone())
        }
        Err(error) => {
            disconnect(&bridge).await;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn codex_request(
    bridge: State<'_, Bridge>,
    method: String,
    mut params: Value,
) -> Result<Value, String> {
    if method == "thread/start" {
        let tools = crate::mcp_tools::dynamic_tools().await;
        if !tools.is_empty() {
            params["dynamicTools"] = Value::Array(tools);
        }
        let cwd = params["cwd"]
            .as_str()
            .ok_or("Choose a project directory first")?;
        let path = PathBuf::from(cwd);
        if !path.is_absolute() || !path.is_dir() {
            return Err(format!(
                "Project directory does not exist or is not absolute: {cwd}"
            ));
        }
    }
    if !matches!(
        method.as_str(),
        "account/read"
            | "model/list"
            | "thread/start"
            | "thread/list"
            | "thread/resume"
            | "thread/read"
            | "thread/name/set"
            | "thread/archive"
            | "turn/start"
            | "turn/interrupt"
            // Read-only views for the Connectors page, and reloading the MCP configuration.
            | "mcpServerStatus/list"
            | "config/mcpServer/reload"
            | "app/list"
    ) {
        return Err(format!("Unsupported Liam method: {method}"));
    }
    if method == "turn/start" {
        // How the folder looks before this chat's first request, so the side panel can show what changed.
        if let Some(dir) = params["threadId"].as_str().and_then(crate::platform_tools::thread_dir) {
            crate::changes::note_baseline(params["threadId"].as_str().unwrap_or(""), &dir);
        }
    }
    let result = request(&bridge, &method, params.clone()).await?;
    if matches!(method.as_str(), "thread/start" | "thread/resume") {
        crate::platform_tools::remember_thread(&params, &result);
    }
    Ok(result)
}

#[tauri::command]
pub async fn codex_pending(bridge: State<'_, Bridge>) -> Result<Value, String> {
    let guard = bridge.connection.lock().await;
    let connection = guard.as_ref().ok_or("Liam is not connected")?;
    let requests: Vec<Value> = connection
        .approvals
        .lock()
        .await
        .values()
        .cloned()
        .collect();
    Ok(json!(requests))
}

#[tauri::command]
pub async fn codex_respond(
    bridge: State<'_, Bridge>,
    id: Value,
    decision: String,
) -> Result<(), String> {
    if !matches!(decision.as_str(), "accept" | "decline" | "cancel") {
        return Err("Only one-time approval decisions are supported".into());
    }
    let guard = bridge.connection.lock().await;
    let connection = guard.as_ref().ok_or("Liam is not connected")?;
    let request = connection
        .approvals
        .lock()
        .await
        .get(&id.to_string())
        .cloned()
        .ok_or("This approval expired or was already answered")?;
    write(
        &connection.stdin,
        &json!({"id": request["id"], "result": {"decision": decision}}),
    )
    .await?;
    connection.approvals.lock().await.remove(&id.to_string());
    Ok(())
}

#[tauri::command]
pub async fn codex_disconnect(bridge: State<'_, Bridge>) -> Result<(), String> {
    let _lifecycle = bridge.lifecycle.lock().await;
    disconnect(&bridge).await;
    Ok(())
}
