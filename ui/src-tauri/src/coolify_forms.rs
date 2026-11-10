//! Simple forms for the Coolify tools whose real input is a free-form `data` object.
//!
//! Coolify's `create_application`, `manage_application` and `manage_env` take `data` as an object with no
//! declared fields. The model (Qwen, through the gateway) answers such an object with `{}` every time, so
//! the request is always rejected. These forms list every field, and Liam builds the real call, including
//! the base64 Dockerfile the API wants.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Map, Value};

fn string_field(description: &str) -> Value {
    json!({"type": "string", "description": description})
}

/// The form tools to offer next to the ordinary Coolify tools.
pub fn specs() -> Vec<Value> {
    let place = |extra: Vec<(&str, Value)>, required: Vec<&str>| -> Value {
        let mut properties = Map::new();
        for (key, value) in [
            ("project_uuid", string_field("Project uuid (see Coolify-list_projects).")),
            ("environment_name", string_field("Environment name in that project. Default: production.")),
            ("server_uuid", string_field("Server uuid (see Coolify-list_servers).")),
            ("destination_uuid", string_field("Only when the server has several destinations.")),
            ("name", string_field("Name of the application.")),
            ("ports", string_field("Port the app listens on inside the container, e.g. 8000.")),
            ("domain", string_field("Optional public address, e.g. https://worklog.digitalx.srt")),
            (
                "deploy_now",
                json!({"type": "boolean", "description": "Start the first deployment right away. Default: true."}),
            ),
        ] {
            properties.insert(key.into(), value);
        }
        for (key, value) in extra {
            properties.insert(key.into(), value);
        }
        let mut required: Vec<&str> = vec!["project_uuid", "server_uuid", "name", "ports"].into_iter().chain(required).collect();
        required.dedup();
        json!({"type": "object", "properties": properties, "required": required})
    };
    vec![
        json!({"type": "function", "name": "Coolify-deploy_from_dockerfile",
            "description": "Create an application in Coolify from a Dockerfile and (by default) deploy it. Give the Dockerfile as plain text.",
            "inputSchema": place(vec![("dockerfile", string_field("The full Dockerfile text, not encoded."))], vec!["dockerfile"])}),
        json!({"type": "function", "name": "Coolify-deploy_from_image",
            "description": "Create an application in Coolify from a Docker image and (by default) deploy it.",
            "inputSchema": place(vec![
                ("image_name", string_field("Image name, e.g. registry.digitalx.srt/python")),
                ("image_tag", string_field("Image tag. Default: latest.")),
            ], vec!["image_name"])}),
        json!({"type": "function", "name": "Coolify-deploy_from_git",
            "description": "Create an application in Coolify from a public Git repository and (by default) deploy it.",
            "inputSchema": place(vec![
                ("git_repository", string_field("Repository address, e.g. https://git.digitalx.srt/team/app")),
                ("git_branch", string_field("Branch. Default: main.")),
                ("build_pack", json!({"type": "string", "enum": ["nixpacks", "railpack", "static", "dockerfile"], "description": "How to build it. Default: nixpacks."})),
            ], vec!["git_repository"])}),
        json!({"type": "function", "name": "Coolify-set_env",
            "description": "Set one environment variable on an application (creates it, or changes it if it exists).",
            "inputSchema": {"type": "object", "properties": {
                "application_uuid": string_field("Application uuid."),
                "key": string_field("Variable name."),
                "value": string_field("Variable value."),
            }, "required": ["application_uuid", "key", "value"]}}),
        json!({"type": "function", "name": "Coolify-set_domain",
            "description": "Set the public address of an application.",
            "inputSchema": {"type": "object", "properties": {
                "application_uuid": string_field("Application uuid."),
                "domain": string_field("Address, e.g. https://worklog.digitalx.srt"),
            }, "required": ["application_uuid", "domain"]}}),
    ]
}

/// Text of a field; numbers are accepted too (models often send a port as a number).
fn text(args: &Value, key: &str) -> Option<String> {
    match args.get(key)? {
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn need(args: &Value, key: &str) -> Result<String, String> {
    text(args, key).ok_or_else(|| format!("Missing \"{key}\". Give a value for it and call the tool again."))
}

/// The real Coolify call for a form tool: (tool name, arguments). `None` when it is not a form tool.
pub fn translate(name: &str, args: &Value) -> Option<Result<(String, Value), String>> {
    let kind = name.strip_prefix("Coolify-")?;
    let build = || -> Result<(String, Value), String> {
        match kind {
            "set_env" => Ok((
                "Coolify-manage_env".into(),
                json!({"action": "create", "resource": "application", "uuid": need(args, "application_uuid")?,
                       "data": {"key": need(args, "key")?, "value": args.get("value").map(|v| v.as_str().map(str::to_owned).unwrap_or_else(|| v.to_string())).unwrap_or_default()}}),
            )),
            "set_domain" => Ok((
                "Coolify-manage_application".into(),
                json!({"action": "update", "uuid": need(args, "application_uuid")?,
                       "data": {"domains": need(args, "domain")?}}),
            )),
            "deploy_from_dockerfile" | "deploy_from_image" | "deploy_from_git" => {
                let mut data = Map::new();
                data.insert("project_uuid".into(), need(args, "project_uuid")?.into());
                data.insert("environment_name".into(), text(args, "environment_name").unwrap_or_else(|| "production".into()).into());
                data.insert("server_uuid".into(), need(args, "server_uuid")?.into());
                data.insert("name".into(), need(args, "name")?.into());
                data.insert("ports_exposes".into(), need(args, "ports")?.into());
                if let Some(destination) = text(args, "destination_uuid") {
                    data.insert("destination_uuid".into(), destination.into());
                }
                if let Some(domain) = text(args, "domain") {
                    data.insert("domains".into(), domain.into());
                }
                data.insert("instant_deploy".into(), (args.get("deploy_now").and_then(Value::as_bool) != Some(false)).into());
                let action = match kind {
                    "deploy_from_dockerfile" => {
                        // Kept exactly as written (only a final newline is made sure of), unlike the short fields.
                        let mut dockerfile = args
                            .get("dockerfile")
                            .and_then(Value::as_str)
                            .filter(|text| !text.trim().is_empty())
                            .ok_or("Missing \"dockerfile\". Give the full Dockerfile text and call the tool again.")?
                            .to_string();
                        if !dockerfile.ends_with('\n') {
                            dockerfile.push('\n');
                        }
                        data.insert("dockerfile".into(), STANDARD.encode(dockerfile.as_bytes()).into());
                        "dockerfile"
                    }
                    "deploy_from_image" => {
                        data.insert("docker_registry_image_name".into(), need(args, "image_name")?.into());
                        data.insert("docker_registry_image_tag".into(), text(args, "image_tag").unwrap_or_else(|| "latest".into()).into());
                        "docker_image"
                    }
                    _ => {
                        data.insert("git_repository".into(), need(args, "git_repository")?.into());
                        data.insert("git_branch".into(), text(args, "git_branch").unwrap_or_else(|| "main".into()).into());
                        data.insert("build_pack".into(), text(args, "build_pack").unwrap_or_else(|| "nixpacks".into()).into());
                        "public"
                    }
                };
                Ok(("Coolify-create_application".into(), json!({"action": action, "data": data})))
            }
            _ => Err(String::new()),
        }
    };
    match kind {
        "set_env" | "set_domain" | "deploy_from_dockerfile" | "deploy_from_image" | "deploy_from_git" => Some(build()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dockerfile_form_builds_the_real_call_with_base64() {
        let args = json!({"project_uuid": "p", "server_uuid": "s", "name": "worklog", "ports": 8321,
                          "dockerfile": "FROM python:3.12-slim\n"});
        let (tool, call) = translate("Coolify-deploy_from_dockerfile", &args).unwrap().unwrap();
        assert_eq!(tool, "Coolify-create_application");
        assert_eq!(call["action"], "dockerfile");
        assert_eq!(call["data"]["ports_exposes"], "8321");
        assert_eq!(call["data"]["environment_name"], "production");
        assert_eq!(call["data"]["instant_deploy"], true);
        assert_eq!(call["data"]["dockerfile"], STANDARD.encode("FROM python:3.12-slim\n"));
    }

    #[test]
    fn missing_fields_are_reported_by_name() {
        let error = translate("Coolify-deploy_from_image", &json!({"project_uuid": "p"})).unwrap().unwrap_err();
        assert!(error.contains("server_uuid"));
    }

    #[test]
    fn ordinary_tools_are_left_alone() {
        assert!(translate("Coolify-list_servers", &json!({})).is_none());
        assert!(translate("Homarr-app_all", &json!({})).is_none());
    }
}
