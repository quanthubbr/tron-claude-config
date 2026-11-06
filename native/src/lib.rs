pub mod board;
pub mod design_engine;
pub mod doc;
pub mod gate;
pub mod handoff;
pub mod install;
pub mod memory;
pub mod migrate;
pub mod payload;
pub mod pr;
pub mod project_memory;
pub mod reminder;
pub mod routing;
pub mod runtime;
pub mod sanitize;
pub mod selftest;
pub mod settings;
pub mod shell;
pub mod template;
pub mod token;
pub mod update;
pub mod vault;

pub const NATIVE_CAPABILITIES: &[&str] = &[
    "pyle",
    "ethos",
    "metron",
    "taxis-spawn",
    "taxis-session",
    "anamnesis",
    "kairos",
];
