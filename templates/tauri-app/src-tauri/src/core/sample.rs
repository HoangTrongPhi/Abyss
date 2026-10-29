//! Folder Stats — the template's sample module: file count and size by extension, the largest files.
//! It exercises every contract a real module follows (options, report with issues, progress, cancel,
//! command line, watch); replace it with the app's first real engine.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use globset::{Glob, GlobSet, GlobSetBuilder};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use super::{CoreError, Issue, RunCtx, Severity};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StatsOptions {
    pub recursive: bool,
    /// Globs matched against the path relative to the root (`**/*.tmp`, `build/**`) and the file name.
    pub exclude: Vec<String>,
}

impl Default for StatsOptions {
    fn default() -> Self {
        StatsOptions { recursive: true, exclude: Vec::new() }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtStats {
    /// Lower case, without the dot; `""` for files without one.
    pub ext: String,
    pub files: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSize {
    pub path: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsReport {
    pub root: String,
    pub files: u64,
    pub bytes: u64,
    /// Largest share first.
    pub by_ext: Vec<ExtStats>,
    /// The 10 largest files, largest first.
    pub largest: Vec<FileSize>,
    pub issues: Vec<Issue>,
    pub elapsed_ms: u64,
    /// No issue at error level and not cancelled.
    pub ok: bool,
    pub cancelled: bool,
}

pub(crate) fn glob_set(patterns: &[String]) -> Result<GlobSet, CoreError> {
    let mut b = GlobSetBuilder::new();
    for p in patterns {
        b.add(Glob::new(p).map_err(|e| CoreError::Input(format!("Bad pattern {p}: {e}")))?);
    }
    b.build().map_err(|e| CoreError::Input(e.to_string()))
}

fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

pub fn folder_stats(root: &Path, opts: &StatsOptions, ctx: &RunCtx) -> Result<StatsReport, CoreError> {
    let started = Instant::now();
    if !root.is_dir() {
        return Err(CoreError::Input(format!("Folder not found: {}", root.display())));
    }
    let exclude = glob_set(&opts.exclude)?;
    let mut issues = Vec::new();
    let mut cancelled = false;

    // Walk first (cheap, cancellable), then read sizes in parallel.
    let mut paths: Vec<PathBuf> = Vec::new();
    let walker = WalkDir::new(root).max_depth(if opts.recursive { usize::MAX } else { 1 }).sort_by_file_name();
    for entry in walker {
        if ctx.cancelled() {
            cancelled = true;
            break;
        }
        match entry {
            Ok(e) if e.file_type().is_file() => {
                let rel = e.path().strip_prefix(root).unwrap_or(e.path());
                if exclude.is_match(rel) || exclude.is_match(e.file_name()) {
                    continue;
                }
                paths.push(e.into_path());
            }
            Ok(_) => {}
            Err(e) => {
                let path = e.path().map(Path::to_path_buf).unwrap_or_else(|| root.to_path_buf());
                issues.push(Issue::new(Severity::Warn, "unreadable-entry", e.to_string()).at(path));
            }
        }
    }

    let total = paths.len() as u64;
    let done = AtomicU64::new(0);
    (ctx.progress)(0, total, "Reading sizes");
    let sizes: Vec<(PathBuf, Result<u64, String>)> = paths
        .into_par_iter()
        .filter_map(|p| {
            if ctx.cancelled() {
                return None;
            }
            let size = std::fs::metadata(&p).map(|m| m.len()).map_err(|e| e.to_string());
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            (ctx.progress)(n, total, &p.file_name().unwrap_or_default().to_string_lossy());
            Some((p, size))
        })
        .collect();
    cancelled |= ctx.cancelled();

    let mut by_ext: HashMap<String, ExtStats> = HashMap::new();
    let mut files = Vec::with_capacity(sizes.len());
    for (p, size) in sizes {
        match size {
            Ok(bytes) => {
                let ext = ext_of(&p);
                let s = by_ext.entry(ext.clone()).or_insert(ExtStats { ext, files: 0, bytes: 0 });
                s.files += 1;
                s.bytes += bytes;
                files.push(FileSize { path: p.to_string_lossy().into_owned(), bytes });
            }
            Err(e) => issues.push(Issue::new(Severity::Error, "unreadable-file", e).at(&p)),
        }
    }
    let mut by_ext: Vec<ExtStats> = by_ext.into_values().collect();
    by_ext.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.ext.cmp(&b.ext)));
    files.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.path.cmp(&b.path)));
    let bytes = files.iter().map(|f| f.bytes).sum();
    let count = files.len() as u64;
    files.truncate(10);

    let ok = !cancelled && !issues.iter().any(|i| i.severity == Severity::Error);
    Ok(StatsReport {
        root: root.to_string_lossy().into_owned(),
        files: count,
        bytes,
        by_ext,
        largest: files,
        issues,
        elapsed_ms: started.elapsed().as_millis() as u64,
        ok,
        cancelled,
    })
}

/// One line for logs, the watch pill and the command line.
pub fn summary(r: &StatsReport) -> String {
    let top = r.by_ext.first().map(|e| format!(", mostly .{} ({})", if e.ext.is_empty() { "(none)" } else { &e.ext }, human_bytes(e.bytes))).unwrap_or_default();
    format!("{} file(s), {}{top}", r.files, human_bytes(r.bytes))
}

pub fn human_bytes(b: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut v = b as f64;
    let mut u = 0;
    while v >= 1024.0 && u < UNITS.len() - 1 {
        v /= 1024.0;
        u += 1;
    }
    if u == 0 {
        format!("{b} B")
    } else {
        format!("{v:.1} {}", UNITS[u])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::quiet_ctx;
    use std::fs;
    use std::sync::atomic::AtomicBool;

    fn tree() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("a.png"), vec![0u8; 300]).unwrap();
        fs::write(d.path().join("b.PNG"), vec![0u8; 100]).unwrap();
        fs::write(d.path().join("notes"), b"hi").unwrap();
        fs::create_dir(d.path().join("sub")).unwrap();
        fs::write(d.path().join("sub/c.json"), vec![0u8; 50]).unwrap();
        fs::write(d.path().join("sub/skip.tmp"), vec![0u8; 999]).unwrap();
        d
    }

    #[test]
    fn counts_by_extension() {
        let d = tree();
        let opts = StatsOptions { recursive: true, exclude: vec!["*.tmp".into()] };
        let r = quiet_ctx(|ctx| folder_stats(d.path(), &opts, ctx)).unwrap();
        assert_eq!((r.files, r.bytes), (4, 452));
        assert_eq!(r.by_ext[0], ExtStats { ext: "png".into(), files: 2, bytes: 400 });
        assert!(r.by_ext.iter().any(|e| e.ext.is_empty() && e.files == 1));
        assert!(r.largest[0].path.ends_with("a.png"));
        assert!(r.ok && !r.cancelled && r.issues.is_empty());

        let flat = quiet_ctx(|ctx| folder_stats(d.path(), &StatsOptions { recursive: false, exclude: vec![] }, ctx)).unwrap();
        assert_eq!(flat.files, 3);
    }

    #[test]
    fn cancel_returns_a_partial_report() {
        let d = tree();
        let cancel = AtomicBool::new(true);
        let r = folder_stats(d.path(), &StatsOptions::default(), &RunCtx { progress: &|_, _, _| {}, cancel: &cancel }).unwrap();
        assert!(r.cancelled && !r.ok);
    }

    #[test]
    fn missing_folder_is_an_input_error() {
        let r = quiet_ctx(|ctx| folder_stats(Path::new("Z:/definitely/not/here"), &StatsOptions::default(), ctx));
        assert!(matches!(r, Err(CoreError::Input(_))));
        assert_eq!(human_bytes(1536), "1.5 KB");
    }
}
