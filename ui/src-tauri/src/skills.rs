//! Saves a skill (a folder holding a `SKILL.md`) where Liam looks for skills:
//! `<project>/.agents/skills/<name>/` for a project, or `~/.agents/skills/<name>/` for the user.
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSaveInput {
    /// `project` or `global`.
    pub scope: String,
    pub project_path: Option<String>,
    pub name: String,
    pub content: String,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkillSaved {
    pub name: String,
    pub dir: String,
    /// Path of the written `SKILL.md`; this is what a turn's skill input points at.
    pub path: String,
}

/// Skill folder names are lowercase letters, digits and single hyphens, so they cannot
/// carry a path separator or `..` and can only ever name one folder under the skills root.
pub fn valid_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !name.starts_with('-')
        && !name.ends_with('-')
        && !name.contains("--")
}

/// The file must open with front matter whose `name` matches the folder and that has a `description`.
fn check_content(name: &str, content: &str) -> Result<(), String> {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return Err("SKILL.md must start with a `---` front matter block".into());
    }
    let (mut found_name, mut has_description, mut closed) = (None, false, false);
    for line in lines {
        let line = line.trim_end();
        if line.trim() == "---" {
            closed = true;
            break;
        }
        if let Some(value) = line.strip_prefix("name:") {
            found_name = Some(value.trim().trim_matches(['"', '\'']).to_owned());
        } else if let Some(value) = line.strip_prefix("description:") {
            has_description = !value.trim().trim_matches(['"', '\'']).is_empty();
        }
    }
    if !closed {
        return Err("The front matter block is not closed with `---`".into());
    }
    if found_name.as_deref() != Some(name) {
        return Err(format!("The front matter `name` must be `{name}`"));
    }
    if !has_description {
        return Err("The front matter needs a non-empty `description`".into());
    }
    Ok(())
}

fn skills_root(input: &SkillSaveInput) -> Result<PathBuf, String> {
    match input.scope.as_str() {
        "project" => {
            let project = PathBuf::from(input.project_path.as_deref().ok_or("This project has no folder")?);
            if !project.is_absolute() || !project.is_dir() {
                return Err("The project folder does not exist".into());
            }
            Ok(project.join(".agents").join("skills"))
        }
        "global" => {
            let home = std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(PathBuf::from)
                .filter(|path| path.is_absolute())
                .ok_or("Could not find the home folder")?;
            Ok(home.join(".agents").join("skills"))
        }
        _ => Err("Unknown skill location".into()),
    }
}

fn save_in(root: &Path, name: &str, content: &str, overwrite: bool) -> Result<SkillSaved, String> {
    if !valid_name(name) {
        return Err("Use 1-64 lowercase letters, digits and single hyphens for the skill name".into());
    }
    check_content(name, content)?;
    let dir = root.join(name);
    let path = dir.join("SKILL.md");
    if path.exists() && !overwrite {
        return Err(format!("A skill named `{name}` already exists here"));
    }
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    // Write beside the target and rename, so a failure never leaves a half-written SKILL.md.
    let temp = dir.join("SKILL.md.tmp");
    fs::write(&temp, content).map_err(|error| format!("Could not write {}: {error}", temp.display()))?;
    fs::rename(&temp, &path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        format!("Could not save {}: {error}", path.display())
    })?;
    Ok(SkillSaved { name: name.to_owned(), dir: dir.display().to_string(), path: path.display().to_string() })
}

#[tauri::command]
pub fn skill_save(input: SkillSaveInput) -> Result<SkillSaved, String> {
    let root = skills_root(&input)?;
    save_in(&root, &input.name, &input.content, input.overwrite)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOOD: &str = "---\nname: weekly-report\ndescription: Summarise the week\n---\n\n# Weekly report\n";

    fn scratch() -> PathBuf {
        std::env::temp_dir().join(format!("friday-skill-test-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn names_cannot_escape_the_skills_folder() {
        for bad in ["", "../x", "a/b", "a\\b", "UPPER", "-x", "x-", "a--b", "has space", "dot.name"] {
            assert!(!valid_name(bad), "{bad:?} should be rejected");
        }
        for good in ["weekly-report", "a", "x1-y2"] {
            assert!(valid_name(good), "{good:?} should be accepted");
        }
        assert!(!valid_name(&"a".repeat(65)));
    }

    #[test]
    fn saves_a_skill_and_refuses_to_overwrite_without_consent() {
        let root = scratch();
        let saved = save_in(&root, "weekly-report", GOOD, false).unwrap();
        assert!(Path::new(&saved.path).is_file());
        assert_eq!(fs::read_to_string(&saved.path).unwrap(), GOOD);
        assert!(!root.join("weekly-report").join("SKILL.md.tmp").exists());

        let again = save_in(&root, "weekly-report", GOOD, false).unwrap_err();
        assert!(again.contains("already exists"));

        let updated = GOOD.replace("Summarise the week", "Summarise the month");
        save_in(&root, "weekly-report", &updated, true).unwrap();
        assert_eq!(fs::read_to_string(&saved.path).unwrap(), updated);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn rejects_content_that_codex_would_not_load() {
        let root = scratch();
        for (content, expect) in [
            ("# no front matter", "front matter"),
            ("---\nname: weekly-report\ndescription: x\n", "not closed"),
            ("---\nname: other\ndescription: x\n---\n", "must be `weekly-report`"),
            ("---\nname: weekly-report\ndescription:   \n---\n", "description"),
        ] {
            let error = save_in(&root, "weekly-report", content, false).unwrap_err();
            assert!(error.contains(expect), "{error:?} should mention {expect:?}");
        }
        assert!(!root.exists(), "nothing should be created when validation fails");
    }

    #[test]
    fn a_project_scope_needs_an_existing_folder() {
        let input = |path: Option<&str>| SkillSaveInput {
            scope: "project".into(), project_path: path.map(str::to_owned), name: "x".into(), content: GOOD.into(), overwrite: false,
        };
        assert!(skills_root(&input(None)).is_err());
        assert!(skills_root(&input(Some("relative/path"))).is_err());
        assert!(skills_root(&input(Some("Z:\\definitely\\missing"))).is_err());
        let existing = std::env::temp_dir();
        assert_eq!(skills_root(&input(Some(existing.to_str().unwrap()))).unwrap(), existing.join(".agents").join("skills"));
    }
}
