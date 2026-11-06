//! Durable local scheduling. Reserve and persist a run before contacting Liam.
use crate::codex::{self, Bridge};
use chrono::{TimeZone, Utc};
use chrono_tz::Tz;
use croner::Cron;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, io::Write, path::PathBuf, str::FromStr};
use tauri::{AppHandle, Emitter, Listener, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

const HISTORY_LIMIT: usize = 200;
const MAX_ACTIVE: usize = 4;

/// A skill a job runs explicitly: Liam loads it from `path` (its `SKILL.md`) for that turn.
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct SkillRef {
    pub name: String,
    pub path: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JobInput {
    pub id: Option<String>,
    pub name: String,
    pub cwd: String,
    pub prompt: String,
    pub cron: String,
    pub timezone: String,
    pub enabled: bool,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub project_prompt: Option<String>,
    pub timeout_minutes: u32,
    #[serde(default)]
    pub skill: Option<SkillRef>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    #[serde(flatten)]
    pub input: JobInput,
    pub next_run_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub job_id: String,
    pub job_name: String,
    pub cwd: String,
    pub status: String,
    pub trigger: String,
    pub scheduled_at: Option<i64>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub connection_id: Option<u64>,
    pub output: String,
    pub error: Option<String>,
    pub timeout_minutes: u32,
    pub stop_reason: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Store {
    version: u32,
    jobs: Vec<Job>,
    runs: Vec<Run>,
}

impl Default for Store {
    fn default() -> Self {
        Self {
            version: 1,
            jobs: vec![],
            runs: vec![],
        }
    }
}

fn active(status: &str) -> bool {
    matches!(
        status,
        "starting" | "running" | "waitingApproval" | "stopping"
    )
}

fn path_key(path: &str) -> String {
    let path = path.replace('\\', "/").trim_end_matches('/').to_owned();
    if cfg!(windows) {
        path.to_lowercase()
    } else {
        path
    }
}

fn next_occurrence(expression: &str, timezone: &str, now: i64) -> Result<i64, String> {
    if expression.split_whitespace().count() != 5 {
        return Err("Use a five-field cron expression: minute hour day month weekday".into());
    }
    let zone = Tz::from_str(timezone)
        .map_err(|_| "Invalid IANA time zone (for example Asia/Bangkok)".to_owned())?;
    let cron = Cron::from_str(expression).map_err(|e| format!("Invalid cron: {e}"))?;
    let time = zone
        .timestamp_millis_opt(now)
        .single()
        .ok_or("Invalid time")?;
    cron.find_next_occurrence(&time, false)
        .map(|time| time.timestamp_millis())
        .map_err(|e| format!("No next occurrence: {e}"))
}

fn validate(input: &JobInput, now: i64) -> Result<(), String> {
    if input.name.trim().is_empty() || input.prompt.trim().is_empty() {
        return Err("Name and prompt are required".into());
    }
    let path = PathBuf::from(&input.cwd);
    if !path.is_absolute() || !path.is_dir() {
        return Err("Choose an existing absolute project directory".into());
    }
    if !(1..=1440).contains(&input.timeout_minutes) {
        return Err("Maximum runtime must be 1–1440 minutes".into());
    }
    if let Some(effort) = input.effort.as_deref() {
        if !matches!(
            effort,
            "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra"
        ) {
            return Err("Invalid reasoning effort".into());
        }
    }
    if let Some(skill) = &input.skill {
        if skill.name.trim().is_empty() || !skill.path.ends_with("SKILL.md") || !PathBuf::from(&skill.path).is_absolute() {
            return Err("A skill needs a name and the absolute path of its SKILL.md".into());
        }
    }
    next_occurrence(&input.cron, &input.timezone, now)?;
    Ok(())
}

/// The turn's input: the skill, when the job has one, followed by the prompt.
fn turn_input(input: &JobInput) -> Value {
    let mut items = Vec::new();
    if let Some(skill) = &input.skill {
        items.push(json!({"type": "skill", "name": skill.name, "path": skill.path}));
    }
    items.push(json!({"type": "text", "text": input.prompt}));
    Value::Array(items)
}

impl Store {
    fn recover(&mut self, now: i64) -> Result<(), String> {
        if self.version != 1 {
            return Err("Unsupported scheduler data version".into());
        }
        for run in &mut self.runs {
            if active(&run.status) {
                run.status = "interrupted".into();
                run.finished_at = Some(now);
                run.error =
                    Some("Friday restarted before this run finished; it was not replayed".into());
            }
        }
        for job in &mut self.jobs {
            job.next_run_at = if job.input.enabled {
                Some(next_occurrence(&job.input.cron, &job.input.timezone, now)?)
            } else {
                None
            };
        }
        Ok(())
    }

    fn claim(
        &mut self,
        job_id: &str,
        manual: bool,
        now: i64,
    ) -> Result<Option<(Job, Run)>, String> {
        let index = self
            .jobs
            .iter()
            .position(|job| job.input.id.as_deref() == Some(job_id))
            .ok_or("Task not found")?;
        let job = self.jobs[index].clone();
        if !manual && (!job.input.enabled || job.next_run_at.is_none_or(|due| due > now)) {
            return Ok(None);
        }
        let busy = self.runs.iter().any(|run| {
            active(&run.status)
                && (run.job_id == job_id || path_key(&run.cwd) == path_key(&job.input.cwd))
        });
        if manual && busy {
            return Err("A task in this project directory is already running".into());
        }
        let at_capacity = self.runs.iter().filter(|run| active(&run.status)).count() >= MAX_ACTIVE;
        if manual && at_capacity {
            return Err("Four tasks are already active; wait for one to finish".into());
        }
        let missed = !manual && job.next_run_at.is_some_and(|due| now - due > 60_000);
        if !manual {
            self.jobs[index].next_run_at =
                Some(next_occurrence(&job.input.cron, &job.input.timezone, now)?);
        }
        while self.runs.len() >= HISTORY_LIMIT {
            let index = self
                .runs
                .iter()
                .rposition(|run| !active(&run.status))
                .ok_or("Run history is full")?;
            self.runs.remove(index);
        }
        let skipped = !manual && (busy || at_capacity || missed);
        let run = Run {
            id: Uuid::new_v4().to_string(),
            job_id: job_id.into(),
            job_name: job.input.name.clone(),
            cwd: job.input.cwd.clone(),
            status: if skipped { "skipped" } else { "starting" }.into(),
            trigger: if manual { "manual" } else { "schedule" }.into(),
            scheduled_at: if manual { None } else { job.next_run_at },
            started_at: now,
            finished_at: if skipped { Some(now) } else { None },
            thread_id: None,
            turn_id: None,
            connection_id: None,
            output: String::new(),
            error: if skipped {
                Some(
                    if busy {
                        "Project directory is busy"
                    } else if at_capacity {
                        "Scheduler is at capacity"
                    } else {
                        "Missed occurrence; no backlog replay"
                    }
                    .into(),
                )
            } else {
                None
            },
            timeout_minutes: job.input.timeout_minutes,
            stop_reason: None,
        };
        self.runs.insert(0, run.clone());
        Ok(if skipped { None } else { Some((job, run)) })
    }
}

pub struct Scheduler {
    data: Mutex<Store>,
    path: PathBuf,
    load_error: Option<String>,
}

fn save(path: &PathBuf, store: &Store) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temp = path.with_extension("json.tmp");
    let mut file = fs::File::create(&temp).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&temp, path).map_err(|e| format!("Cannot save scheduled tasks: {e}"))
}

impl Scheduler {
    pub fn load(path: PathBuf) -> Self {
        let loaded = (|| -> Result<Store, String> {
            let mut store = match fs::read(&path) {
                Ok(bytes) => serde_json::from_slice::<Store>(&bytes)
                    .map_err(|e| format!("Cannot read {}: {e}", path.display()))?,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Store::default(),
                Err(e) => return Err(format!("Cannot read {}: {e}", path.display())),
            };
            store.recover(Utc::now().timestamp_millis())?;
            save(&path, &store)?;
            Ok(store)
        })();
        match loaded {
            Ok(store) => Self {
                data: Mutex::new(store),
                path,
                load_error: None,
            },
            Err(error) => Self {
                data: Mutex::new(Store::default()),
                path,
                load_error: Some(error),
            },
        }
    }
    fn commit(&self, current: &mut Store, next: Store) -> Result<(), String> {
        if let Some(error) = &self.load_error {
            return Err(error.clone());
        }
        save(&self.path, &next)?;
        *current = next;
        Ok(())
    }
}

fn changed(app: &AppHandle) {
    let _ = app.emit("scheduler-changed", ());
}

#[tauri::command]
pub async fn scheduler_list(scheduler: State<'_, Scheduler>) -> Result<Value, String> {
    let data = scheduler.data.lock().await;
    Ok(json!({"jobs": data.jobs, "runs": data.runs, "error": scheduler.load_error}))
}

#[tauri::command]
pub async fn scheduler_preview(cron: String, timezone: String) -> Result<Vec<i64>, String> {
    let mut cursor = Utc::now().timestamp_millis();
    let mut result = vec![];
    for _ in 0..3 {
        cursor = next_occurrence(&cron, &timezone, cursor)?;
        result.push(cursor);
    }
    Ok(result)
}

#[tauri::command]
pub async fn scheduler_save(
    app: AppHandle,
    scheduler: State<'_, Scheduler>,
    mut input: JobInput,
) -> Result<Job, String> {
    let now = Utc::now().timestamp_millis();
    input.name = input.name.trim().into();
    input.prompt = input.prompt.trim().into();
    input.cwd = input.cwd.trim().into();
    input.cron = input.cron.trim().into();
    input.timezone = input.timezone.trim().into();
    validate(&input, now)?;
    let mut current = scheduler.data.lock().await;
    let mut next = current.clone();
    let existing = if let Some(id) = &input.id {
        Some(
            next.jobs
                .iter()
                .position(|job| job.input.id.as_ref() == Some(id))
                .ok_or("Task not found")?,
        )
    } else {
        None
    };
    if input.id.is_none() {
        input.id = Some(Uuid::new_v4().to_string());
    }
    let job = Job {
        next_run_at: if input.enabled {
            Some(next_occurrence(&input.cron, &input.timezone, now)?)
        } else {
            None
        },
        created_at: existing
            .map(|index| next.jobs[index].created_at)
            .unwrap_or(now),
        input,
    };
    if let Some(index) = existing {
        next.jobs[index] = job.clone();
    } else {
        next.jobs.insert(0, job.clone());
    }
    scheduler.commit(&mut current, next)?;
    drop(current);
    changed(&app);
    Ok(job)
}

#[tauri::command]
pub async fn scheduler_delete(
    app: AppHandle,
    scheduler: State<'_, Scheduler>,
    id: String,
) -> Result<(), String> {
    let mut current = scheduler.data.lock().await;
    if current
        .runs
        .iter()
        .any(|run| run.job_id == id && active(&run.status))
    {
        return Err("Stop the active run before deleting this task".into());
    }
    let mut next = current.clone();
    let before = next.jobs.len();
    next.jobs.retain(|job| job.input.id.as_deref() != Some(&id));
    if before == next.jobs.len() {
        return Err("Task not found".into());
    }
    next.runs.retain(|run| run.job_id != id);
    scheduler.commit(&mut current, next)?;
    drop(current);
    changed(&app);
    Ok(())
}

async fn claim(app: &AppHandle, id: &str, manual: bool) -> Result<Option<(Job, Run)>, String> {
    let scheduler = app.state::<Scheduler>();
    let mut current = scheduler.data.lock().await;
    let mut next = current.clone();
    let result = next.claim(id, manual, Utc::now().timestamp_millis())?;
    scheduler.commit(&mut current, next)?;
    drop(current);
    changed(app);
    Ok(result)
}

#[tauri::command]
pub async fn scheduler_run(app: AppHandle, id: String) -> Result<String, String> {
    let (job, run) = claim(&app, &id, true)
        .await?
        .ok_or("Task could not be started")?;
    let run_id = run.id.clone();
    tauri::async_runtime::spawn(execute(app, job, run));
    Ok(run_id)
}

async fn update_run(
    app: &AppHandle,
    id: &str,
    update: impl FnOnce(&mut Run),
) -> Result<(), String> {
    let scheduler = app.state::<Scheduler>();
    let mut current = scheduler.data.lock().await;
    let mut next = current.clone();
    if let Some(run) = next.runs.iter_mut().find(|run| run.id == id) {
        update(run);
    } else {
        return Err("Run not found".into());
    }
    scheduler.commit(&mut current, next)?;
    drop(current);
    changed(app);
    Ok(())
}

async fn should_stop(app: &AppHandle, id: &str) -> bool {
    let scheduler = app.state::<Scheduler>();
    let data = scheduler.data.lock().await;
    data.runs
        .iter()
        .find(|run| run.id == id)
        .is_none_or(|run| run.stop_reason.is_some() || !active(&run.status))
}

async fn call(app: &AppHandle, method: &str, params: Value) -> Result<Value, String> {
    codex::codex_request(app.state::<Bridge>(), method.to_owned(), params).await
}

async fn execute(app: AppHandle, job: Job, run: Run) {
    let result = async {
        let info = codex::codex_connect(app.clone(), app.state::<Bridge>()).await?;
        update_run(&app, &run.id, |record| record.connection_id = info["connectionId"].as_u64()).await?;
        if should_stop(&app, &run.id).await { return Err("Stopped before execution".to_owned()); }
        let thread = call(&app, "thread/start", json!({
            "cwd": job.input.cwd, "approvalPolicy": "on-request", "approvalsReviewer": "user", "sandbox": "workspace-write",
            "threadSource": "automation", "developerInstructions": job.input.project_prompt,
        })).await?;
        let thread_id = thread["thread"]["id"].as_str().ok_or("Missing thread ID")?.to_owned();
        update_run(&app, &run.id, |record| record.thread_id = Some(thread_id.clone())).await?;
        call(&app, "thread/name/set", json!({"threadId": thread_id, "name": format!("[Scheduled] {}", job.input.name)})).await?;
        if should_stop(&app, &run.id).await { return Err("Stopped before execution".into()); }
        let turn = call(&app, "turn/start", json!({
            "threadId": thread_id, "input": turn_input(&job.input),
            "model": job.input.model, "effort": job.input.effort,
        })).await?;
        let turn_id = turn["turn"]["id"].as_str().ok_or("Missing turn ID")?.to_owned();
        update_run(&app, &run.id, |record| {
            record.turn_id = Some(turn_id.clone());
            if record.status == "starting" { record.status = "running".into(); }
        }).await?;
        if should_stop(&app, &run.id).await {
            let _ = call(&app, "turn/interrupt", json!({"threadId": thread_id, "turnId": turn_id})).await;
        }
        Ok::<(), String>(())
    }.await;
    if let Err(error) = result {
        let updated = update_run(&app, &run.id, |record| {
            if active(&record.status) {
                record.status = match record.stop_reason.as_deref() {
                    Some("timeout") => "timedOut",
                    Some(_) => "cancelled",
                    None => "failed",
                }
                .into();
                record.error = Some(error);
                record.finished_at = Some(Utc::now().timestamp_millis());
            }
        })
        .await;
        if let Err(error) = updated {
            let _ = app.emit("scheduler-error", error);
        }
    }
}

async fn stop(app: &AppHandle, id: &str, reason: &str) -> Result<(), String> {
    let scheduler = app.state::<Scheduler>();
    let mut current = scheduler.data.lock().await;
    let mut next = current.clone();
    let run = next
        .runs
        .iter_mut()
        .find(|run| run.id == id)
        .ok_or("Run not found")?;
    if !active(&run.status) {
        return Err("This run has already finished".into());
    }
    let previous_status = run.status.clone();
    run.status = "stopping".into();
    run.stop_reason = Some(reason.into());
    let thread_id = run.thread_id.clone();
    let turn_id = run.turn_id.clone();
    scheduler.commit(&mut current, next)?;
    drop(current);
    changed(app);
    if let (Some(thread_id), Some(turn_id)) = (thread_id, turn_id) {
        if let Err(error) = call(
            app,
            "turn/interrupt",
            json!({"threadId": thread_id, "turnId": turn_id}),
        )
        .await
        {
            update_run(app, id, |run| {
                if run.status == "stopping" {
                    run.status = previous_status;
                    run.stop_reason = None;
                    run.error = Some(format!("Could not stop run: {error}"));
                }
            })
            .await?;
            return Err(error);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn scheduler_stop(app: AppHandle, id: String) -> Result<(), String> {
    stop(&app, &id, "user").await
}

async fn receive(app: AppHandle, kind: &str, payload: Value) -> Result<(), String> {
    let scheduler = app.state::<Scheduler>();
    let mut current = scheduler.data.lock().await;
    let mut next = current.clone();
    let generation = payload["connectionId"].as_u64();
    let message = &payload["message"];
    let params = &message["params"];
    let thread_id = params["threadId"].as_str();
    let mut modified = false;
    for run in &mut next.runs {
        if run.connection_id != generation {
            continue;
        }
        if kind == "codex-disconnected" && active(&run.status) {
            run.status = "interrupted".into();
            run.error = Some("Liam disconnected".into());
            run.finished_at = Some(Utc::now().timestamp_millis());
            modified = true;
        } else if thread_id.is_some() && run.thread_id.as_deref() == thread_id {
            match message["method"].as_str().unwrap_or("") {
                "turn/started" if active(&run.status) => {
                    run.turn_id = params["turn"]["id"].as_str().map(str::to_owned);
                    if run.status == "starting" {
                        run.status = "running".into();
                    }
                    modified = true;
                }
                "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
                    if active(&run.status) =>
                {
                    run.status = "waitingApproval".into();
                    modified = true;
                }
                "serverRequest/resolved" if run.status == "waitingApproval" => {
                    run.status = "running".into();
                    modified = true;
                }
                "item/completed" if params["item"]["type"] == "agentMessage" => {
                    if let Some(text) = params["item"]["text"].as_str() {
                        if !run.output.is_empty() {
                            run.output.push_str("\n\n");
                        }
                        run.output.push_str(text);
                        if run.output.len() > 100_000 {
                            let mut end = 100_000;
                            while !run.output.is_char_boundary(end) {
                                end -= 1;
                            }
                            run.output.truncate(end);
                        }
                        modified = true;
                    }
                }
                "turn/completed" if active(&run.status) => {
                    run.status = match run.stop_reason.as_deref() {
                        Some("timeout") => "timedOut",
                        Some(_) => "cancelled",
                        None => match params["turn"]["status"].as_str() {
                            Some("completed") => "completed",
                            Some("interrupted") => "cancelled",
                            _ => "failed",
                        },
                    }
                    .into();
                    run.error = params["turn"]["error"]["message"]
                        .as_str()
                        .map(str::to_owned);
                    if run.status == "timedOut" {
                        run.error = Some("Maximum runtime reached".into());
                    }
                    run.finished_at = Some(Utc::now().timestamp_millis());
                    modified = true;
                }
                _ => {}
            }
        }
    }
    if modified {
        scheduler.commit(&mut current, next)?;
        drop(current);
        changed(&app);
    }
    Ok(())
}

async fn tick(app: &AppHandle) -> Result<(), String> {
    let scheduler = app.state::<Scheduler>();
    if let Some(error) = &scheduler.load_error {
        return Err(error.clone());
    }
    let now = Utc::now().timestamp_millis();
    let (due, expired) = {
        let data = scheduler.data.lock().await;
        (
            data.jobs
                .iter()
                .filter(|job| job.input.enabled && job.next_run_at.is_some_and(|time| time <= now))
                .filter_map(|job| job.input.id.clone())
                .collect::<Vec<_>>(),
            data.runs
                .iter()
                .filter(|run| {
                    active(&run.status)
                        && run.stop_reason.is_none()
                        && now - run.started_at >= i64::from(run.timeout_minutes) * 60_000
                })
                .map(|run| run.id.clone())
                .collect::<Vec<_>>(),
        )
    };
    for id in expired {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = stop(&handle, &id, "timeout").await {
                let _ = handle.emit("scheduler-error", error);
            }
        });
    }
    for id in due {
        if let Some((job, run)) = claim(app, &id, false).await? {
            tauri::async_runtime::spawn(execute(app.clone(), job, run));
        }
    }
    Ok(())
}

pub fn start(app: &AppHandle) {
    for kind in ["codex-event", "codex-approval", "codex-disconnected"] {
        let handle = app.clone();
        app.listen_any(kind, move |event| {
            if let Ok(payload) = serde_json::from_str::<Value>(event.payload()) {
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = receive(handle.clone(), kind, payload).await {
                        let _ = handle.emit("scheduler-error", error);
                    }
                });
            }
        });
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = tick(&handle).await {
                let _ = handle.emit("scheduler-error", error);
            }
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> JobInput {
        JobInput {
            id: Some("job".into()),
            name: "Check".into(),
            cwd: std::env::temp_dir().to_string_lossy().into(),
            prompt: "Reply OK".into(),
            cron: "0 9 * * 1-5".into(),
            timezone: "Asia/Bangkok".into(),
            enabled: true,
            model: None,
            effort: None,
            project_prompt: None,
            timeout_minutes: 60,
            skill: None,
        }
    }
    #[test]
    fn a_skill_job_sends_the_skill_before_the_prompt_and_rejects_a_bad_path() {
        let mut job = input();
        assert_eq!(turn_input(&job), json!([{"type": "text", "text": "Reply OK"}]));

        let path = std::env::temp_dir().join("demo").join("SKILL.md").to_string_lossy().into_owned();
        job.skill = Some(SkillRef { name: "demo".into(), path: path.clone() });
        assert_eq!(
            turn_input(&job),
            json!([{"type": "skill", "name": "demo", "path": path}, {"type": "text", "text": "Reply OK"}])
        );
        assert!(validate(&job, time("2026-01-05T00:00:00Z")).is_ok());

        job.skill = Some(SkillRef { name: "demo".into(), path: "relative/SKILL.md".into() });
        assert!(validate(&job, time("2026-01-05T00:00:00Z")).is_err());
        job.skill = Some(SkillRef { name: "demo".into(), path: std::env::temp_dir().join("notes.txt").to_string_lossy().into_owned() });
        assert!(validate(&job, time("2026-01-05T00:00:00Z")).is_err());
    }
    fn time(value: &str) -> i64 {
        chrono::DateTime::parse_from_rfc3339(value)
            .unwrap()
            .timestamp_millis()
    }
    fn store(now: i64) -> Store {
        Store {
            version: 1,
            jobs: vec![Job {
                input: input(),
                next_run_at: Some(now),
                created_at: now,
            }],
            runs: vec![],
        }
    }

    #[test]
    fn weekday_cron_uses_named_timezone_and_skips_weekend() {
        assert_eq!(
            next_occurrence("0 9 * * 1-5", "Asia/Bangkok", time("2026-11-06T02:00:00Z")).unwrap(),
            time("2026-11-09T02:00:00Z")
        );
        assert!(next_occurrence("* * * * * *", "Asia/Bangkok", 0).is_err());
        assert!(next_occurrence("* * * * *", "Not/AZone", 0).is_err());
        assert!(next_occurrence("99 * * * *", "UTC", 0).is_err());
    }
    #[test]
    fn dst_schedule_keeps_local_hour() {
        assert_eq!(
            next_occurrence(
                "0 9 * * *",
                "America/New_York",
                time("2026-03-07T14:00:00Z")
            )
            .unwrap(),
            time("2026-03-08T13:00:00Z")
        );
    }
    #[test]
    fn reservations_prevent_duplicates_and_workspace_overlap() {
        let now = time("2026-11-05T02:00:00Z");
        let mut data = store(now);
        assert!(data.claim("job", true, now).unwrap().is_some());
        assert!(data.claim("job", true, now).is_err());
        let mut other = data.jobs[0].clone();
        other.input.id = Some("other".into());
        data.jobs.push(other);
        assert!(data.claim("other", true, now).is_err());
        assert!(data.claim("other", false, now).unwrap().is_none());
        assert_eq!(data.runs[0].status, "skipped");
        assert!(data.jobs[1].next_run_at.unwrap() > now);
    }
    #[test]
    fn restart_never_replays_inflight_or_overdue_work() {
        let now = time("2026-11-05T02:00:00Z");
        let mut data = store(now);
        data.claim("job", true, now).unwrap();
        data.recover(now + 3_600_000).unwrap();
        assert_eq!(data.runs[0].status, "interrupted");
        assert!(data.jobs[0].next_run_at.unwrap() > now + 3_600_000);
    }
    #[test]
    fn late_occurrences_are_skipped_and_disabled_jobs_do_not_fire() {
        let now = time("2026-11-05T02:00:00Z");
        let mut data = store(now - 120_000);
        assert!(data.claim("job", false, now).unwrap().is_none());
        assert_eq!(data.runs[0].status, "skipped");
        data.jobs[0].input.enabled = false;
        data.jobs[0].next_run_at = Some(now);
        assert!(data.claim("job", false, now).unwrap().is_none());
        assert_eq!(data.runs.len(), 1);
    }
    #[test]
    fn store_round_trip_and_corrupt_data_is_not_overwritten() {
        let folder = std::env::temp_dir().join(format!("friday-scheduler-test-{}", Uuid::new_v4()));
        let path = folder.join("tasks.json");
        let data = store(Utc::now().timestamp_millis());
        save(&path, &data).unwrap();
        let loaded = Scheduler::load(path.clone());
        assert!(loaded.load_error.is_none());
        fs::write(&path, b"broken").unwrap();
        let loaded = Scheduler::load(path.clone());
        assert!(loaded.load_error.is_some());
        assert_eq!(fs::read(&path).unwrap(), b"broken");
        fs::remove_file(&path).unwrap();
        fs::remove_dir(folder).unwrap();
    }
}
