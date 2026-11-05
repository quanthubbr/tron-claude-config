use regex::Regex;
use std::sync::OnceLock;

fn patterns() -> &'static Vec<(Regex, &'static str)> {
    static PATTERNS: OnceLock<Vec<(Regex, &str)>> = OnceLock::new();
    PATTERNS.get_or_init(|| [
        (r"(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----.*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)", "private_key"),
        (r"(?i)\bbearer\s+[A-Za-z0-9._\-+/=]{16,}", "bearer_token"),
        (r"\bsk-[A-Za-z0-9_-]{16,}", "api_key"),
        (r"\b(?:sk|rk)_live_[A-Za-z0-9_-]{16,}", "stripe_key"),
        (r"\bgh[pousr]_[A-Za-z0-9]{20,}", "github_token"),
        (r"\bgithub_pat_[A-Za-z0-9_]{20,}", "github_token"),
        (r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b", "aws_key"),
        (r"\bAIza[A-Za-z0-9_-]{30,}", "google_api_key"),
        (r"\b1//[0-9A-Za-z_-]{20,}", "google_oauth"),
        (r"\bEAA[A-Za-z0-9]{20,}", "meta_token"),
        (r"\b\d{6,10}:AA[A-Za-z0-9_-]{30,}\b", "telegram_token"),
        (r"\bxox[abprs]-[A-Za-z0-9-]{10,}", "slack_token"),
        (r"\bxapp-[A-Za-z0-9-]{10,}", "slack_token"),
        (r"\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}", "jwt"),
        (r"\b[a-zA-Z][a-zA-Z0-9+.-]*://[^:/\s]+:[^@\s]+@[^\s]+", "url_credentials"),
        (r#"(?i)\b[A-Za-z0-9_-]*(?:authorization|password|passwd|secret|token|api[_-]?key)["']?\s*[:=]\s*["']?[^\s"',;]{6,}"#, "credential"),
    ].into_iter().map(|(pattern, label)| (Regex::new(pattern).expect("static redaction pattern"), label)).collect())
}

pub fn sanitize(text: &str) -> String {
    static STRIP: OnceLock<Regex> = OnceLock::new();
    let strip = STRIP.get_or_init(|| Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x{200b}-\x{200f}\x{202a}-\x{202e}\x{2060}-\x{2064}\x{2066}-\x{2069}\x{feff}]").expect("static control pattern"));
    let mut out = strip.replace_all(text, "").into_owned();
    for (pattern, label) in patterns() {
        out = pattern
            .replace_all(&out, format!("(redacted:{label})"))
            .into_owned();
    }
    out
}

pub fn line(text: &str, max: usize) -> String {
    let clean = sanitize(text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if clean.chars().count() <= max {
        return clean;
    }
    format!(
        "{}…",
        clean
            .chars()
            .take(max.saturating_sub(1))
            .collect::<String>()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captured_secrets_and_terminal_controls_never_reach_history() {
        let key = format!("sk-{}", "a".repeat(24));
        let github = format!("ghp_{}", "b".repeat(24));
        let sample = format!(
            "OPENAI_API_KEY={key}\ntoken {github}\npostgres://app:hunter2@db.local/shop\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz\nplain \x1b[31mred\x1b[0m\u{200b} text"
        );
        let out = sanitize(&sample);
        for secret in [
            &key,
            &github,
            "hunter2",
            "MIIEow",
            "abcdefghijklmnopqrstuvwxyz",
        ] {
            assert!(!out.contains(secret));
        }
        assert!(out.contains("(redacted:private_key)"));
        assert!(out.ends_with("plain red text"));
    }

    #[test]
    fn single_line_redacts_before_truncating() {
        let sample = format!("\n password={}\tvisible", "a".repeat(24));
        assert_eq!(line(&sample, 10), "(redacted…");
        assert_eq!(line("one  two\nthree", 100), "one two three");
    }
}
