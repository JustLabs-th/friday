//! Friday's own MCP client for the company gateway (Bifrost).
//!
//! Codex hands MCP tools to the model as a `namespace` tool type, which the gateway drops before the
//! model sees it. So Friday calls the MCP endpoint itself and gives the agent plain `function` tools
//! (Codex "dynamic tools"); the call comes back to us as an `item/tool/call` request.
use serde_json::{json, Value};
use std::time::Duration;
use tokio::sync::Mutex;

const ENDPOINT: &str = "https://bifrost.digitalx.srt/mcp";
/// MCP clients (exact names, the gateway filters by them) and the few tools of each worth giving the
/// agent: enough to run the job, small enough for the model's context window.
const CLIENTS: &[(&str, &[&str])] = &[
    (
        "Coolify",
        &[
            "get_infrastructure_overview", "list_servers", "list_projects", "get_project",
            "list_resources", "list_applications", "get_application", "list_unhealthy_resources",
            "list_deployments", "get_deployment", "get_logs", "list_env_keys",
            "deploy", "cancel_deployment", "rollback_application",
            // create_application, manage_application and manage_env are offered as simple forms
            // (coolify_forms.rs): their free-form `data` object comes back from the model empty.
        ],
    ),
    (
        // The dashboard: list, add and edit the app tiles users open. Nothing destructive.
        "Homarr",
        &[
            "app_all", "app_search", "app_byId", "app_create", "app_update", "icon_findIcons",
            "icon_detectFavicon", "board_getAllBoards", "board_search", "integration_all",
        ],
    ),
];

static CACHE: Mutex<Option<Vec<Value>>> = Mutex::const_new(None);

fn http() -> Result<reqwest::Client, String> {
    crate::trust::http_builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())
}

/// One JSON-RPC round trip. The reply is either plain JSON or a single SSE `data:` event.
async fn rpc(
    http: &reqwest::Client,
    key: &str,
    client: &str,
    session: Option<&str>,
    body: Value,
) -> Result<(Option<String>, Value), String> {
    let mut request = http
        .post(ENDPOINT)
        .bearer_auth(key)
        .header("Accept", "application/json, text/event-stream")
        .header("Content-Type", "application/json")
        .header("x-bf-mcp-include-clients", client);
    if let Some(session) = session {
        request = request.header("Mcp-Session-Id", session);
    }
    let response = request
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("Cannot reach the tool gateway: {e}"))?;
    let status = response.status();
    let session = response
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Tool gateway returned {status}"));
    }
    if text.trim().is_empty() {
        return Ok((session, Value::Null));
    }
    let payload = text
        .lines()
        .find_map(|line| line.strip_prefix("data:").map(str::trim))
        .unwrap_or(text.trim());
    let value: Value = serde_json::from_str(payload).map_err(|e| e.to_string())?;
    if let Some(error) = value.get("error") {
        return Err(error["message"]
            .as_str()
            .unwrap_or("The tool gateway reported an error")
            .to_owned());
    }
    Ok((session, value["result"].clone()))
}

async fn open(http: &reqwest::Client, key: &str, client: &str) -> Result<Option<String>, String> {
    let (session, _) = rpc(
        http,
        key,
        client,
        None,
        json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "friday", "version": env!("CARGO_PKG_VERSION")}
        }}),
    )
    .await?;
    rpc(
        http,
        key,
        client,
        session.as_deref(),
        json!({"jsonrpc": "2.0", "method": "notifications/initialized"}),
    )
    .await
    .ok();
    Ok(session)
}

/// The tools to hand to Codex when a thread starts. Empty when signed out or the gateway has no access.
pub async fn dynamic_tools() -> Vec<Value> {
    let Some(key) = crate::gateway_auth::stored_key() else {
        return Vec::new();
    };
    if let Some(cached) = CACHE.lock().await.as_ref() {
        return cached.clone();
    }
    let mut specs: Vec<Value> = Vec::new();
    for (client, allowed) in CLIENTS {
        let tools = async {
            let http = http()?;
            let session = open(&http, &key, client).await?;
            let (_, result) = rpc(
                &http,
                &key,
                client,
                session.as_deref(),
                json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
            )
            .await?;
            Ok::<_, String>(result["tools"].as_array().cloned().unwrap_or_default())
        }
        .await
        .unwrap_or_default();
        // The forms need the real tools behind them, so they appear only when the gateway grants those.
        if *client == "Coolify"
            && ["create_application", "manage_application", "manage_env"]
                .iter()
                .all(|t| tools.iter().any(|tool| tool["name"] == format!("Coolify-{t}")))
        {
            specs.extend(crate::coolify_forms::specs());
        }
        specs.extend(tools.into_iter().filter_map(|tool| {
            let name = tool["name"].as_str()?;
            let short = name.strip_prefix(&format!("{client}-"))?;
            if !allowed.contains(&short) {
                return None;
            }
            Some(json!({
                "type": "function",
                "name": name,
                "description": tool["description"].as_str().unwrap_or(""),
                "inputSchema": tool.get("inputSchema").cloned()
                    .unwrap_or_else(|| json!({"type": "object", "properties": {}})),
            }))
        }));
    }
    // Only remember a real answer, so a gateway hiccup is retried on the next thread.
    if !specs.is_empty() {
        *CACHE.lock().await = Some(specs.clone());
    }
    specs
}

/// Runs one tool and returns (text for the model, whether it worked).
pub async fn call(name: &str, arguments: Value) -> (String, bool) {
    let (name, arguments) = match crate::coolify_forms::translate(name, &arguments) {
        Some(Ok(real)) => real,
        Some(Err(message)) => return (message, false),
        None => (name.to_string(), arguments),
    };
    let name = name.as_str();
    let Some(key) = crate::gateway_auth::stored_key() else {
        return ("Not signed in to the company gateway.".into(), false);
    };
    let Some((client, _)) = CLIENTS
        .iter()
        .find(|(client, _)| name.starts_with(&format!("{client}-")))
    else {
        return (format!("Unknown tool: {name}"), false);
    };
    let outcome = async {
        let http = http()?;
        let session = open(&http, &key, client).await?;
        rpc(
            &http,
            &key,
            client,
            session.as_deref(),
            json!({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                   "params": {"name": name, "arguments": arguments}}),
        )
        .await
        .map(|(_, result)| result)
    }
    .await;
    match outcome {
        Ok(result) => {
            let text = result["content"]
                .as_array()
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item["text"].as_str())
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .filter(|text| !text.is_empty())
                .unwrap_or_else(|| result.to_string());
            (text, result["isError"].as_bool() != Some(true))
        }
        Err(error) => (error, false),
    }
}
