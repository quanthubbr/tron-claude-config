use exonous::board;
use serde_json::{Value, json};
use std::fs;

#[test]
fn invalid_board_configuration_has_distinct_exit_and_no_writes() {
    let home = tempfile::tempdir().unwrap();
    let out = board::execute(home.path(), home.path(), &["render".into()]);
    assert_eq!(out.code, 3);
    assert!(out.stdout.is_empty());
    assert!(out.stderr.contains("Board não definido"));
    assert_eq!(fs::read_dir(home.path()).unwrap().count(), 0);
}

#[test]
fn board_native_preserves_board_authority_filters_and_classification_transaction() {
    let home = tempfile::tempdir().unwrap();
    let skill = home.path().join(".claude/skills/issue-board");
    let data = skill.join("data/acme-4");
    fs::create_dir_all(&data).unwrap();
    fs::write(
        skill.join("config.json"),
        json!({"owner":"acme","projectNumber":4}).to_string(),
    )
    .unwrap();
    fs::write(data.join("items.json"), json!({"me":"alice","items":[
        {"key":"acme/app#1","repo":"app","number":1,"title":"Checkout lento","assignees":["alice"],"boardPriority":"High","boardSize":"M","status":"Ready","body":"context","labels":[]},
        {"key":"acme/app#2","repo":"app","number":2,"title":"Outro usuário","assignees":["bob"],"boardPriority":"","boardSize":"","status":"Todo","body":"other","labels":[]}
    ]}).to_string()).unwrap();
    let body = home.path().join("classification.json");
    fs::write(
        &body,
        json!([{"key":"acme/app#1","type":"performance","priority":"P0","difficulty":3}])
            .to_string(),
    )
    .unwrap();
    board::command(
        home.path(),
        home.path(),
        &["classify".into(), body.to_string_lossy().into_owned()],
    )
    .unwrap();
    let output = board::command(
        home.path(),
        home.path(),
        &[
            "render".into(),
            "--json".into(),
            "--dificuldade".into(),
            "média".into(),
        ],
    )
    .unwrap();
    let view: Value = serde_json::from_str(&output).unwrap();
    assert_eq!(view["total"], 1);
    let row = &view["groups"][0]["rows"][0];
    assert_eq!(row["priority"], "P1");
    assert_eq!(row["difficulty"], 2);
    assert_eq!(row["prioritySuggested"], false);
    let before = fs::read(data.join("classification.json")).unwrap();
    fs::write(&body, json!([{"key":"acme/app#2","type":"bug","priority":"P2","difficulty":1},{"key":"bad","type":"bug","priority":"P2","difficulty":1}]).to_string()).unwrap();
    assert!(
        board::command(
            home.path(),
            home.path(),
            &["classify".into(), body.to_string_lossy().into_owned()]
        )
        .is_err()
    );
    assert_eq!(fs::read(data.join("classification.json")).unwrap(), before);
    let pending: Value = serde_json::from_str(
        &board::command(
            home.path(),
            home.path(),
            &["pending".into(), "--all".into()],
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(pending["issues"].as_array().unwrap().len(), 1);
    assert_eq!(pending["issues"][0]["key"], "acme/app#2");
    let mut cache: Value =
        serde_json::from_slice(&fs::read(data.join("items.json")).unwrap()).unwrap();
    cache["items"][0]["title"] = "unsafe\u{1b}[2J screen".into();
    cache["items"][0]["status"] = "Ready\u{1b}]52;payload\u{7}".into();
    fs::write(data.join("items.json"), cache.to_string()).unwrap();
    let rendered = board::command(
        home.path(),
        home.path(),
        &[
            "render".into(),
            "--por".into(),
            "status".into(),
            "--no-color".into(),
        ],
    )
    .unwrap();
    assert!(!rendered.contains('\u{1b}'));
    assert!(!rendered.contains('\u{7}'));
}
