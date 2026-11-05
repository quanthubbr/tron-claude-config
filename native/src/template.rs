use crate::runtime::{self, Result};
use std::fs;
use std::path::{Path, PathBuf};
use unicode_normalization::UnicodeNormalization;

const BUNDLED: &str = include_str!("../../assets/machine/PR-TEMPLATE.md");
const LIMIT: u64 = 64 * 1024;

pub struct Template {
    pub path: String,
    pub body: String,
    pub sections: Vec<String>,
}

pub fn sections(text: &str) -> Vec<String> {
    let html = regex::Regex::new(r"(?s)<!--.*?-->").expect("static regex");
    let visible = html.replace_all(text, "");
    let mut fence = None;
    let mut sections = Vec::new();
    for line in visible.lines() {
        if line.starts_with("```") || line.starts_with("~~~") {
            let marker = &line[..3];
            if fence == Some(marker) {
                fence = None;
            } else if fence.is_none() {
                fence = Some(marker);
            }
            continue;
        }
        if fence.is_some() {
            continue;
        }
        if let Some(title) = line
            .strip_prefix("##")
            .filter(|t| t.starts_with([' ', '\t']))
        {
            sections.push(title.trim_matches([' ', '\t', '#', '\r']).to_owned());
        }
    }
    sections
}

fn usable(path: &Path) -> Option<String> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.len() > LIMIT {
        return None;
    }
    runtime::read_limited(path, LIMIT).ok()
}

fn find(dir: &Path) -> Option<PathBuf> {
    let mut entries = fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .collect::<Vec<_>>();
    entries.sort();
    entries.into_iter().find(|p| {
        p.file_name().is_some_and(|n| {
            n.to_string_lossy()
                .eq_ignore_ascii_case("pull_request_template.md")
        }) && usable(p).is_some()
    })
}

pub fn resolve(cwd: &Path, home: &Path) -> Template {
    let mut candidates = Vec::new();
    if let Ok(root) = runtime::repo_root(cwd) {
        for dir in [".github", "docs", ""] {
            if let Some(file) = find(&root.join(dir)) {
                candidates.push(file);
            }
        }
    }
    candidates.push(home.join(".claude/exonous/PR-TEMPLATE.md"));
    for path in candidates {
        if let Some(body) = usable(&path) {
            return Template {
                path: path.to_string_lossy().into_owned(),
                sections: sections(&body),
                body,
            };
        }
    }
    Template {
        path: "bundled:PR-TEMPLATE.md".into(),
        body: BUNDLED.into(),
        sections: sections(BUNDLED),
    }
}

pub fn validate(body: &str, template: &Template) -> Result<()> {
    let text = body.nfc().collect::<String>().to_lowercase();
    let missing = template
        .sections
        .iter()
        .filter(|s| !text.contains(&s.nfc().collect::<String>().to_lowercase()))
        .cloned()
        .collect::<Vec<_>>();
    if missing.is_empty() {
        return Ok(());
    }
    Err(format!(
        "PR body is missing: {}. Follow {} — all {} titles must appear (write N/A under a section that does not apply).",
        missing.join(", "),
        template.path,
        template.sections.len()
    ))
}

pub fn workflow(kind: &str) -> Result<&'static str> {
    let source = match kind {
        "commit" => include_str!("../../assets/skills/commit-changes/SKILL.md"),
        "pr" => include_str!("../../assets/skills/make-pr/SKILL.md"),
        _ => {
            return Err(format!(
                "unknown workflow \"{kind}\" — use one of: commit, pr"
            ));
        }
    };
    Ok(without_frontmatter(source))
}

fn without_frontmatter(source: &str) -> &str {
    source
        .strip_prefix("---\r\n")
        .or_else(|| source.strip_prefix("---\n"))
        .and_then(|s| {
            s.split_once("\r\n---\r\n")
                .or_else(|| s.split_once("\n---\n"))
                .map(|(_, body)| body.trim_start_matches(['\r', '\n']))
        })
        .unwrap_or(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workflow_frontmatter_accepts_both_checkout_line_endings() {
        assert_eq!(
            without_frontmatter("---\r\nname: commit\r\n---\r\n\r\nReview\r\n"),
            "Review\r\n"
        );
        assert_eq!(
            without_frontmatter("---\nname: commit\n---\n\nReview\n"),
            "Review\n"
        );
        assert_eq!(without_frontmatter("Review\n"), "Review\n");
    }

    #[test]
    fn required_titles_ignore_comments_fences_and_other_heading_levels() {
        assert_eq!(
            sections("## One ##\n<!--\n## hidden\n-->\n```md\n## code\n```\n### sub\n## Two"),
            ["One", "Two"]
        );
    }

    #[test]
    fn validation_normalizes_unicode_and_case() {
        let t = Template {
            path: "fixture".into(),
            body: String::new(),
            sections: vec!["Revisão".into()],
        };
        assert!(validate("REVISA\u{303}O", &t).is_ok());
        assert!(validate("", &t).unwrap_err().contains("Revisão"));
    }
}
