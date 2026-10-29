//! Command line, same exe as the app: `__APP_ID__ stats <folder> [--report r.json] [--watch]`.
//! Runs without a window, for build scripts and CI. Exit codes: 0 done and nothing at the
//! `--fail-on` level, 1 issues at that level (or a failed step), 2 bad arguments or input.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc;

use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;

use crate::core::sample::{folder_stats, human_bytes, summary, StatsOptions};
use crate::core::{count_at_least, Issue, RunCtx, Severity};
use crate::utils::watch::{RunSummary, WatchConfig, Watcher};

const APP: &str = "__APP_NAME__";
const EXAMPLES: &str = "\
Examples:
  __APP_ID__ stats D:\\Art --report stats.json
  __APP_ID__ stats D:\\Art --exclude \"**/*.tmp\" --fail-on warn
  __APP_ID__ stats D:\\Art --watch

Exit codes: 0 done, 1 issues at the --fail-on level, 2 bad arguments or input.
In cmd.exe run `start /wait __APP_ID__.exe ...` to wait for the exit code.";

/// Subcommands the exe answers on the command line; any other first argument opens the window
/// (e.g. a file path from Explorer's "Open with").
const SUBCOMMANDS: &[&str] = &["stats", "help"];

#[derive(Parser, Debug)]
#[command(name = "__APP_ID__", version, about = "__APP_NAME__ — __TAGLINE__", after_help = EXAMPLES)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Count files and bytes by extension and list the largest files.
    Stats(StatsArgs),
}

#[derive(Args, Debug)]
pub struct StatsArgs {
    /// Folder to scan.
    pub folder: PathBuf,
    /// Only the folder itself, not its subfolders.
    #[arg(long)]
    pub no_recursive: bool,
    /// Glob to leave out (repeatable), e.g. "**/*.tmp".
    #[arg(long, value_name = "GLOB")]
    pub exclude: Vec<String>,
    #[command(flatten)]
    pub common: Common,
}

/// Flags every subcommand that fits them has.
#[derive(Args, Debug, Clone)]
pub struct Common {
    /// Write the whole result (the same structure the app shows) as JSON.
    #[arg(long, value_name = "FILE")]
    pub report: Option<PathBuf>,
    /// Run once, then again whenever an input changes; Ctrl+C stops (exit 0).
    #[arg(long)]
    pub watch: bool,
    /// Issue level that makes the exit code 1.
    #[arg(long, value_enum, default_value_t = FailOn::Error)]
    pub fail_on: FailOn,
    /// Only the summary line and errors.
    #[arg(long)]
    pub quiet: bool,
}

#[derive(ValueEnum, Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailOn {
    Warn,
    Error,
}

impl FailOn {
    pub fn severity(self) -> Severity {
        match self {
            FailOn::Warn => Severity::Warn,
            FailOn::Error => Severity::Error,
        }
    }
}

/// True when the process was started for the command line rather than the app window.
pub fn wants_cli(args: &[String]) -> bool {
    args.get(1).is_some_and(|a| SUBCOMMANDS.contains(&a.as_str()) || matches!(a.as_str(), "--help" | "-h" | "--version" | "-V"))
}

/// Release builds use the Windows GUI subsystem: borrow the calling terminal's console for output.
fn attach_console() {
    #[cfg(windows)]
    {
        extern "system" {
            fn AttachConsole(process_id: u32) -> i32;
        }
        const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
        unsafe {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
    }
}

// ---------------------------------------------------------------- output

/// Console output in the suite's format: a title line, one `OK  `/`WARN`/`FAIL`/`SKIP` line per step
/// with at most 20 detail lines (problems first), and a closing line.
pub struct Out {
    pub quiet: bool,
}

impl Out {
    pub fn title(&self, command: &str, target: &Path) {
        if !self.quiet {
            println!("{APP} {} — {command} on {}", env!("CARGO_PKG_VERSION"), target.display());
        }
    }

    pub fn step(&self, mark: &str, title: &str, summary: &str, details: &[String]) {
        let failed = mark == "FAIL";
        if self.quiet && !failed {
            println!("{mark} {title}: {summary}");
            for d in details.iter().filter(|d| d.trim_start().starts_with('!')).take(20) {
                println!("       {d}");
            }
            return;
        }
        println!("{mark} {title}: {summary}");
        let mut lines: Vec<&String> = details.iter().filter(|d| d.trim_start().starts_with('!')).collect();
        lines.extend(details.iter().filter(|d| !d.trim_start().starts_with('!')));
        for d in lines.iter().take(20) {
            println!("       {d}");
        }
        if details.len() > 20 {
            println!("       … {} more line(s) in the report", details.len() - 20);
        }
    }

    pub fn finish(&self, ok: bool, elapsed_ms: u64) {
        println!("{} in {elapsed_ms} ms", if ok { "Finished" } else { "Stopped after a failed step" });
    }
}

/// Detail lines for issues: `! message (path)` for errors, `message (path)` otherwise.
pub fn issue_lines(issues: &[Issue]) -> Vec<String> {
    issues
        .iter()
        .map(|i| {
            let at = i.path.as_deref().map(|p| format!(" ({p})")).unwrap_or_default();
            let bang = if i.severity == Severity::Error { "! " } else { "" };
            format!("{bang}{}{at}", i.message)
        })
        .collect()
}

pub fn mark_for(issues: &[Issue], cancelled: bool) -> &'static str {
    if cancelled {
        "SKIP"
    } else if count_at_least(issues, Severity::Error) > 0 {
        "FAIL"
    } else if count_at_least(issues, Severity::Warn) > 0 {
        "WARN"
    } else {
        "OK  "
    }
}

pub fn write_report<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    crate::utils::paths::write_atomic(path, json.as_bytes()).map_err(|e| format!("Cannot write report {}: {e}", path.display()))?;
    Ok(())
}

/// Block until Ctrl+C. Err when the handler cannot be installed.
fn wait_for_ctrl_c() -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    ctrlc::set_handler(move || {
        let _ = tx.send(());
    })
    .map_err(|e| e.to_string())?;
    let _ = rx.recv();
    Ok(())
}

// ---------------------------------------------------------------- commands

pub fn run(args: &[String]) -> i32 {
    attach_console();
    let cli = match Cli::try_parse_from(args) {
        Ok(c) => c,
        Err(e) => {
            let code = if e.use_stderr() { 2 } else { 0 };
            let _ = e.print();
            return code;
        }
    };
    match cli.command {
        Command::Stats(a) => stats(a),
    }
}

/// One Folder Stats run with its console lines and report. Err(exit code) when it could not run.
fn stats_once(folder: &Path, options: &StatsOptions, common: &Common) -> Result<i32, i32> {
    let out = Out { quiet: common.quiet };
    let cancel = AtomicBool::new(false);
    let report = folder_stats(folder, options, &RunCtx { progress: &|_, _, _| {}, cancel: &cancel }).map_err(|e| {
        eprintln!("{e}");
        2
    })?;
    let mut details: Vec<String> = report.by_ext.iter().take(10).map(|e| format!(".{:<8} {:>6} file(s) {:>10}", if e.ext.is_empty() { "(none)" } else { &e.ext }, e.files, human_bytes(e.bytes))).collect();
    details.extend(issue_lines(&report.issues));
    out.step(mark_for(&report.issues, report.cancelled), "Folder stats", &summary(&report), &details);
    if let Some(path) = &common.report {
        write_report(path, &report).map_err(|e| {
            eprintln!("{e}");
            1
        })?;
        if !out.quiet {
            println!("Report written to {}", path.display());
        }
    }
    let failed = count_at_least(&report.issues, common.fail_on.severity()) > 0;
    out.finish(!failed, report.elapsed_ms);
    Ok(if failed { 1 } else { 0 })
}

fn stats(a: StatsArgs) -> i32 {
    let options = StatsOptions { recursive: !a.no_recursive, exclude: a.exclude.clone() };
    Out { quiet: a.common.quiet }.title("stats", &a.folder);
    let first = match stats_once(&a.folder, &options, &a.common) {
        Ok(c) => c,
        Err(c) => return c,
    };
    if !a.common.watch {
        return first;
    }

    let config = WatchConfig { paths: vec![a.folder.clone()], recursive: options.recursive, exclude: options.exclude.clone(), ignore: a.common.report.iter().cloned().collect(), ..Default::default() };
    let (folder, common) = (a.folder.clone(), a.common.clone());
    let watch = Watcher::start(1, config, false, |_| {}, move |changed| {
        println!("— {} change(s), running again", changed.len());
        let code = stats_once(&folder, &options, &common).unwrap_or_else(|c| c);
        RunSummary { summary: String::new(), issues: code as usize, error: None }
    });
    let _watch = match watch {
        Ok(w) => w,
        Err(e) => {
            eprintln!("{e}");
            return 2;
        }
    };
    println!("Watching {} — Ctrl+C to stop", a.folder.display());
    match wait_for_ctrl_c() {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        std::iter::once("__APP_ID__").chain(list.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn parses_flags() {
        assert!(!wants_cli(&args(&[])));
        assert!(!wants_cli(&args(&["D:/some/file.png"])), "Open with → window");
        assert!(wants_cli(&args(&["stats", "D:/a"])) && wants_cli(&args(&["--help"])) && wants_cli(&args(&["--version"])));

        let c = Cli::try_parse_from(args(&["stats", "D:/a", "--report", "r.json", "--watch", "--quiet", "--fail-on", "warn", "--exclude", "*.tmp", "--no-recursive"])).unwrap();
        let Command::Stats(s) = c.command;
        assert_eq!(s.folder, PathBuf::from("D:/a"));
        assert_eq!(s.common.report, Some(PathBuf::from("r.json")));
        assert!(s.common.watch && s.common.quiet && s.no_recursive);
        assert_eq!((s.common.fail_on, s.exclude.as_slice()), (FailOn::Warn, ["*.tmp".to_string()].as_slice()));

        let d = Cli::try_parse_from(args(&["stats", "D:/a"])).unwrap();
        let Command::Stats(d) = d.command;
        assert_eq!(d.common.fail_on, FailOn::Error);
        assert!(Cli::try_parse_from(args(&["stats"])).is_err(), "folder required");
        assert!(Cli::try_parse_from(args(&["stats", "D:/a", "--report"])).is_err(), "value missing");
        assert!(Cli::try_parse_from(args(&["stats", "D:/a", "--bogus"])).is_err(), "unknown flag");
        assert!(Cli::try_parse_from(args(&["stats", "D:/a", "--fail-on", "info"])).is_err(), "bad level");
    }

    #[test]
    fn runs_stats() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.png"), vec![0u8; 64]).unwrap();
        std::fs::write(dir.path().join("b.txt"), b"x").unwrap();
        let report = dir.path().join("out/r.json");
        let code = run(&args(&["stats", &dir.path().to_string_lossy(), "--report", &report.to_string_lossy()]));
        assert_eq!(code, 0);
        let json: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&report).unwrap()).unwrap();
        assert_eq!((json["files"].as_u64(), json["bytes"].as_u64()), (Some(2), Some(65)));
        assert_eq!(json["byExt"][0]["ext"], "png");
        assert_eq!(run(&args(&["stats", &dir.path().join("missing").to_string_lossy()])), 2);
        assert_eq!(run(&args(&["stats", "--nope"])), 2);
    }
}
