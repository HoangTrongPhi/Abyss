//! Install / update / uninstall jobs. Each reports its steps on `abyss://job` so the UI can show
//! progress on the app's card; one job per target at a time.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::catalog::{CatalogApp, InstallSpec};
use crate::release::{self, CHECKSUMS_FILE};
use crate::system::{self, Installed};
use crate::{http, verify};

pub const JOB_EVENT: &str = "abyss://job";

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Resolving,
    Downloading,
    Verifying,
    Installing,
    Uninstalling,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEvent {
    /// App id, or `addon:<id>` for a Blender add-on.
    pub target: String,
    pub phase: Phase,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub message: Option<String>,
}

pub struct Reporter<R: Runtime> {
    app: AppHandle<R>,
    target: String,
}

impl<R: Runtime> Reporter<R> {
    pub fn new(app: &AppHandle<R>, target: impl Into<String>) -> Self {
        Reporter { app: app.clone(), target: target.into() }
    }

    fn send(&self, phase: Phase, downloaded: u64, total: Option<u64>, message: Option<String>) {
        let _ = self.app.emit(JOB_EVENT, JobEvent { target: self.target.clone(), phase, downloaded, total, message });
    }

    pub fn phase(&self, phase: Phase, message: impl Into<Option<String>>) {
        self.send(phase, 0, None, message.into());
    }

    pub fn progress(&self, downloaded: u64, total: Option<u64>) {
        self.send(Phase::Downloading, downloaded, total, None);
    }

    /// Report the outcome of a whole job and pass it through.
    pub fn finish<T>(&self, result: Result<T, String>, done: impl FnOnce(&T) -> String) -> Result<T, String> {
        match &result {
            Ok(v) => self.phase(Phase::Done, done(v)),
            Err(e) => self.phase(Phase::Error, e.clone()),
        }
        result
    }
}

/// Targets with a job running.
#[derive(Default)]
pub struct Jobs(Mutex<HashSet<String>>);

pub struct JobGuard<'a> {
    jobs: &'a Jobs,
    target: String,
}

impl Jobs {
    pub fn begin(&self, target: &str) -> Result<JobGuard<'_>, String> {
        let mut set = self.0.lock().map_err(|_| "Job list is locked")?;
        if !set.insert(target.to_string()) {
            return Err("Already in progress".into());
        }
        Ok(JobGuard { jobs: self, target: target.to_string() })
    }
}

impl Drop for JobGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut set) = self.jobs.0.lock() {
            set.remove(&self.target);
        }
    }
}

/// Check a download before it runs. It must match `SHA256SUMS.txt` from its release folder when that
/// file exists (required when `require_checksums`), and its signature when the app has a public key.
/// At least one of the two must have been checked.
pub async fn verify_download(path: &Path, url: &str, pubkey: Option<&str>, signature: Option<&str>, require_checksums: bool) -> Result<(), String> {
    let name = release::file_name(url);
    let mut checked = false;
    match http::get_text_opt(&release::sibling_url(url, CHECKSUMS_FILE)).await? {
        Some(text) => {
            let sums = release::parse_checksums(&text);
            let want = sums.get(&name.to_ascii_lowercase()).ok_or_else(|| format!("{CHECKSUMS_FILE} of this release does not list {name}"))?;
            let p = path.to_path_buf();
            let got = tokio::task::spawn_blocking(move || verify::sha256_file(&p)).await.map_err(|e| e.to_string())??;
            if &got != want {
                return Err(format!("{name} is damaged or was changed (SHA-256 mismatch); it was not installed"));
            }
            checked = true;
        }
        None if require_checksums => return Err(format!("The release has no {CHECKSUMS_FILE}; refusing to install an unchecked download")),
        None => {}
    }
    if let Some(key) = pubkey {
        let sig = signature.filter(|s| !s.trim().is_empty()).ok_or_else(|| format!("{name} has no signature"))?;
        let (p, key, sig) = (path.to_path_buf(), key.to_string(), sig.to_string());
        tokio::task::spawn_blocking(move || verify::verify_signature(&p, &key, &sig)).await.map_err(|e| e.to_string())??;
        checked = true;
    }
    if !checked {
        return Err(format!("{name} could not be verified (no {CHECKSUMS_FILE}, no signing key)"));
    }
    Ok(())
}

fn ensure_closed(name: &str, installed: Option<&Installed>) -> Result<(), String> {
    let exe = installed.and_then(|i| i.exe.as_ref());
    if exe.is_some_and(|e| system::running_exes().contains(&system::path_key(e))) {
        return Err(format!("{name} is running; close it first"));
    }
    Ok(())
}

/// Run `program` and wait for it. `raw_tail` goes last on the command line exactly as given (NSIS' `/D=`
/// must not be quoted, even when the path has spaces).
async fn run_and_wait(program: &Path, args: &[String], raw_tail: Option<String>, timeout: Duration) -> Result<i32, String> {
    let (program, args) = (program.to_path_buf(), args.to_vec());
    tokio::task::spawn_blocking(move || {
        let mut cmd = system::quiet_command(&program);
        cmd.args(&args);
        if let Some(tail) = raw_tail {
            #[cfg(windows)]
            std::os::windows::process::CommandExt::raw_arg(&mut cmd, tail);
            #[cfg(not(windows))]
            cmd.arg(tail);
        }
        let mut child = cmd.spawn().map_err(|e| match e.raw_os_error() {
            Some(740) => format!("{} needs administrator rights; run it by hand", program.display()),
            _ => format!("Could not start {}: {e}", program.display()),
        })?;
        let started = Instant::now();
        loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                return Ok(status.code().unwrap_or(-1));
            }
            if started.elapsed() > timeout {
                let _ = child.kill();
                return Err(format!("{} did not finish in {} minutes", program.display(), timeout.as_secs() / 60));
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Where and how a new app goes. Updates ignore it: they install over the copy that is there.
pub struct InstallPlan {
    /// The app gets its own folder in here: `<root>\<product>`.
    pub root: PathBuf,
    /// Keep the desktop shortcut the installer makes.
    pub desktop_shortcut: bool,
}

/// `<root>\<product>`, the folder an app gets under an install root (what its installer would pick).
pub fn app_dir(root: &Path, spec: &InstallSpec) -> PathBuf {
    root.join(&spec.uninstall_key)
}

/// What the install dialog shows about a folder before anything is written.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallTarget {
    pub root: PathBuf,
    /// `<root>\<product>`.
    pub dir: PathBuf,
    /// `root` is `%LOCALAPPDATA%`, the installers' own default.
    pub is_default: bool,
    pub writable: bool,
    /// The app's folder already has files in it (left from an earlier copy, or something else).
    pub not_empty: bool,
    /// Free bytes on that drive.
    pub free: Option<u64>,
}

pub fn inspect_target(root: &Path, spec: &InstallSpec) -> InstallTarget {
    let dir = app_dir(root, spec);
    InstallTarget {
        is_default: system::path_key(root) == system::path_key(&system::default_install_root()),
        writable: root.is_absolute() && system::writable(&dir),
        not_empty: std::fs::read_dir(&dir).is_ok_and(|mut d| d.next().is_some()),
        free: system::free_space(root),
        root: root.to_path_buf(),
        dir,
    }
}

fn check_target(dir: &Path) -> Result<(), String> {
    if !dir.is_absolute() {
        return Err(format!("{} is not a full path", dir.display()));
    }
    if !system::writable(dir) {
        return Err(format!("Abyss cannot write to {}; pick a folder of your own (Program Files needs administrator rights)", dir.display()));
    }
    Ok(())
}

/// The installers always put a shortcut on the desktop; take it off again when the user said no.
fn remove_desktop_shortcut(product: &str, since: SystemTime) {
    let Some(lnk) = system::desktop_dir().map(|d| d.join(format!("{product}.lnk"))) else { return };
    // Only the one this install has just written.
    let fresh = std::fs::metadata(&lnk).and_then(|m| m.modified()).is_ok_and(|t| t + Duration::from_secs(5) >= since);
    if fresh {
        let _ = std::fs::remove_file(&lnk);
    }
}

/// Install the latest release of `entry`, or update it in place.
pub async fn install_app<R: Runtime>(r: &Reporter<R>, entry: &CatalogApp, downloads: &Path, plan: &InstallPlan) -> Result<Installed, String> {
    let spec = entry.install.as_ref().ok_or_else(|| format!("{} cannot be installed", entry.name))?;
    r.phase(Phase::Resolving, None);
    let latest = release::fetch_latest(entry).await?;
    let current = system::installed(spec);
    ensure_closed(&entry.name, current.as_ref())?;
    let update = current.is_some();
    let dir = app_dir(&plan.root, spec);
    if !update {
        check_target(&dir)?;
    }

    let file = release::file_name(&latest.url);
    let dest = downloads.join(&entry.id).join(&file);
    http::download(&latest.url, &dest, |done, total| r.progress(done, total)).await?;

    r.phase(Phase::Verifying, None);
    let checked = verify_download(&dest, &latest.url, spec.pubkey.as_deref(), Some(&latest.signature), spec.pubkey.is_none()).await;
    if let Err(e) = checked {
        let _ = tokio::fs::remove_file(&dest).await;
        return Err(e);
    }

    r.phase(Phase::Installing, format!("v{}", latest.version));
    // An update goes where the app already is (its installer remembers the folder) and leaves the user's
    // shortcuts alone; a new install goes into the chosen folder.
    let (args, tail) = if update { (vec!["/S".into(), "/UPDATE".into()], None) } else { (vec!["/S".into()], Some(format!("/D={}", dir.display()))) };
    let started = SystemTime::now();
    let code = run_and_wait(&dest, &args, tail, Duration::from_secs(600)).await?;
    let _ = tokio::fs::remove_file(&dest).await;
    if code != 0 {
        return Err(format!("The {} installer failed (exit code {code})", entry.name));
    }
    if !update && !plan.desktop_shortcut {
        remove_desktop_shortcut(&spec.uninstall_key, started);
    }
    system::installed(spec).ok_or_else(|| format!("The installer finished but {} was not found afterwards", entry.name))
}

pub async fn uninstall_app<R: Runtime>(r: &Reporter<R>, entry: &CatalogApp) -> Result<(), String> {
    let spec = entry.install.as_ref().ok_or_else(|| format!("{} is not installable", entry.name))?;
    let current = system::installed(spec).ok_or_else(|| format!("{} is not installed", entry.name))?;
    ensure_closed(&entry.name, Some(&current))?;
    let cmd = current.uninstaller.clone().ok_or_else(|| format!("{} has no uninstaller", entry.name))?;
    let (program, mut args) = system::split_command_line(&cmd);
    if !args.iter().any(|a| a.eq_ignore_ascii_case("/S")) {
        args.push("/S".into());
    }
    r.phase(Phase::Uninstalling, None);
    run_and_wait(Path::new(&program), &args, None, Duration::from_secs(300)).await?;
    // NSIS uninstallers copy themselves to %TEMP% and return at once; wait for the registry entry to go.
    let started = Instant::now();
    while system::installed(spec).is_some() {
        if started.elapsed() > Duration::from_secs(120) {
            return Err(format!("{} is still installed after its uninstaller ran", entry.name));
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(product: &str) -> InstallSpec {
        InstallSpec { kind: crate::catalog::InstallKind::Nsis, uninstall_key: product.into(), exe: "x.exe".into(), pubkey: None, manifest: None }
    }

    #[test]
    fn targets() {
        let root = tempfile::tempdir().unwrap();
        let t = inspect_target(root.path(), &spec("Poseidon"));
        assert_eq!(t.dir, root.path().join("Poseidon"));
        assert!(t.writable && !t.not_empty && !t.is_default);
        std::fs::create_dir(&t.dir).unwrap();
        std::fs::write(t.dir.join("old.txt"), "x").unwrap();
        assert!(inspect_target(root.path(), &spec("Poseidon")).not_empty);
        assert!(!inspect_target(Path::new("relative"), &spec("Poseidon")).writable);
        assert!(check_target(Path::new("relative")).is_err());
        assert!(inspect_target(&system::default_install_root(), &spec("Poseidon")).is_default);
    }

    /// Downloads Poseidon's real installer and checks it the way an install would (nothing runs):
    /// `cargo test -- --ignored poseidon_download_verifies --nocapture`
    #[tokio::test]
    #[ignore]
    async fn poseidon_download_verifies() {
        let app = crate::catalog::bundled().app("poseidon").unwrap().clone();
        let key = app.install.as_ref().unwrap().pubkey.clone();
        let latest = release::fetch_latest(&app).await.unwrap();
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join(release::file_name(&latest.url));
        http::download(&latest.url, &dest, |_, _| {}).await.unwrap();
        verify_download(&dest, &latest.url, key.as_deref(), Some(&latest.signature), false).await.unwrap();
        // A changed byte must be caught.
        let mut bytes = std::fs::read(&dest).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        std::fs::write(&dest, bytes).unwrap();
        assert!(verify_download(&dest, &latest.url, key.as_deref(), Some(&latest.signature), false).await.is_err());
    }
}
