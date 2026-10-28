//! Blender installs and their add-ons. Discovery follows Poseidon's `blender_runner` (registry,
//! Program Files, Steam, PATH, `BLENDER_PATH`); add-ons are installed by Blender itself, headless,
//! through `scripts/abyss_addon_tool.py`, so legacy add-ons and 4.2+ extensions both work.

use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{LazyLock, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::system::{path_key, quiet_command};

const TOOL: &str = include_str!("../scripts/abyss_addon_tool.py");
/// Extensions (and so the add-on tool) need Blender 4.2 or newer.
pub const MIN_SERIES: (u32, u32) = (4, 2);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlenderInstall {
    pub executable: PathBuf,
    pub version: String,
    /// `5.2`: the folder name of its user preferences.
    pub series: String,
    pub supported: bool,
    pub user_dir: PathBuf,
    /// Installed add-on modules (`my_addon`, `bl_ext.user_default.<id>`).
    pub modules: Vec<String>,
}

#[derive(Default)]
pub struct BlenderCache(pub Mutex<Option<Vec<BlenderInstall>>>);

/// Capture stdout of a command, killing it after `timeout`.
fn run_with_timeout(cmd: &mut std::process::Command, timeout: Duration) -> Option<String> {
    let mut child = cmd.stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut s = String::new();
        let _ = stdout.read_to_string(&mut s);
        s
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
    reader.join().ok()
}

pub fn parse_version(output: &str) -> Option<(u32, u32, u32)> {
    let rest = &output[output.find("Blender ")? + 8..];
    let token = rest.split_whitespace().next()?;
    let mut parts = token.split('.').map(|p| p.parse::<u32>().ok());
    Some((parts.next()??, parts.next()??, parts.next().flatten().unwrap_or(0)))
}

fn probe_version(exe: &Path) -> Option<(u32, u32, u32)> {
    type Cache = HashMap<PathBuf, Option<(u32, u32, u32)>>;
    static CACHE: LazyLock<Mutex<Cache>> = LazyLock::new(Default::default);
    if let Some(v) = CACHE.lock().ok()?.get(exe) {
        return *v;
    }
    let v = run_with_timeout(quiet_command(exe).arg("--version"), Duration::from_secs(60)).and_then(|o| parse_version(&o));
    CACHE.lock().ok()?.insert(exe.to_path_buf(), v);
    v
}

#[cfg(windows)]
fn registry_candidates() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
    use winreg::RegKey;

    let mut found = Vec::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(dir) = hklm.open_subkey(r"SOFTWARE\BlenderFoundation").and_then(|k| k.get_value::<String, _>("Install_Dir")) {
        found.push(PathBuf::from(dir).join("blender.exe"));
    }
    // The MSI and the Microsoft Store / winget installs register an Uninstall entry named "Blender".
    for (root, flags) in [(HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_64KEY), (HKEY_CURRENT_USER, KEY_READ)] {
        let Ok(uninstall) = RegKey::predef(root).open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Uninstall", flags) else { continue };
        for name in uninstall.enum_keys().flatten() {
            let Ok(k) = uninstall.open_subkey_with_flags(&name, flags) else { continue };
            let display: String = k.get_value("DisplayName").unwrap_or_default();
            if !display.starts_with("Blender") {
                continue;
            }
            if let Ok(dir) = k.get_value::<String, _>("InstallLocation") {
                found.push(PathBuf::from(dir.trim().trim_matches('"')).join("blender.exe"));
            }
        }
    }
    found
}

#[cfg(not(windows))]
fn registry_candidates() -> Vec<PathBuf> {
    Vec::new()
}

fn candidate_paths() -> Vec<PathBuf> {
    let exe = if cfg!(windows) { "blender.exe" } else { "blender" };
    let mut cands = Vec::new();
    if let Some(env) = std::env::var_os("BLENDER_PATH") {
        cands.push(PathBuf::from(env));
    }
    cands.extend(registry_candidates());
    if cfg!(windows) {
        let mut bases: Vec<PathBuf> = ["ProgramFiles", "ProgramW6432"].iter().filter_map(std::env::var_os).map(PathBuf::from).collect();
        bases.push(PathBuf::from(r"C:\Program Files"));
        for base in bases {
            let Ok(entries) = std::fs::read_dir(base.join("Blender Foundation")) else { continue };
            let mut dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("Blender"))).collect();
            dirs.sort();
            cands.extend(dirs.into_iter().map(|d| d.join(exe)));
        }
        let x86 = std::env::var_os("ProgramFiles(x86)").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Program Files (x86)"));
        cands.push(x86.join(r"Steam\steamapps\common\Blender").join(exe));
    }
    if let Some(path) = std::env::var_os("PATH") {
        cands.extend(std::env::split_paths(&path).map(|d| d.join(exe)));
    }
    cands
}

/// Where Blender keeps preferences, scripts and extensions for a version series (e.g. "5.2").
pub fn user_dir(series: &str) -> PathBuf {
    if let Some(custom) = std::env::var_os("BLENDER_USER_RESOURCES") {
        return PathBuf::from(custom);
    }
    let appdata = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default();
    appdata.join("Blender Foundation").join("Blender").join(series)
}

/// Add-on modules present in a user folder: `scripts/addons` and the user extensions repository.
pub fn installed_modules(user_dir: &Path) -> Vec<String> {
    let mut modules = Vec::new();
    if let Ok(entries) = std::fs::read_dir(user_dir.join("scripts").join("addons")) {
        for e in entries.flatten() {
            let (path, name) = (e.path(), e.file_name().to_string_lossy().to_string());
            if name.starts_with('_') || name.starts_with('.') {
                continue;
            }
            if path.is_dir() && path.join("__init__.py").is_file() {
                modules.push(name);
            } else if let Some(stem) = name.strip_suffix(".py") {
                modules.push(stem.to_string());
            }
        }
    }
    if let Ok(entries) = std::fs::read_dir(user_dir.join("extensions").join("user_default")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if e.path().is_dir() && !name.starts_with('.') {
                modules.push(format!("bl_ext.user_default.{name}"));
            }
        }
    }
    modules.sort();
    modules
}

/// Every working Blender on this machine, newest first.
pub fn discover() -> Vec<BlenderInstall> {
    let mut seen = HashSet::new();
    let mut installs: Vec<(u32, u32, u32, BlenderInstall)> = Vec::new();
    for c in candidate_paths() {
        if !c.is_file() || !seen.insert(path_key(&c)) {
            continue;
        }
        let Some((major, minor, patch)) = probe_version(&c) else { continue };
        let series = format!("{major}.{minor}");
        let dir = user_dir(&series);
        installs.push((
            major,
            minor,
            patch,
            BlenderInstall {
                executable: c,
                version: format!("{major}.{minor}.{patch}"),
                supported: (major, minor) >= MIN_SERIES,
                modules: installed_modules(&dir),
                user_dir: dir,
                series,
            },
        ));
    }
    installs.sort_by_key(|(a, b, c, _)| std::cmp::Reverse((*a, *b, *c)));
    installs.into_iter().map(|(.., b)| b).collect()
}

/// Re-read the add-on folders of already discovered installs (cheap, no Blender started).
pub fn refresh_modules(installs: &mut [BlenderInstall]) {
    for b in installs {
        b.modules = installed_modules(&b.user_dir);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub ok: bool,
    #[serde(default)]
    pub module: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Run the add-on tool in a headless Blender: `install <zip>` or `remove <module>`.
pub fn run_tool(blender: &Path, action: &str, arg: &str, scratch: &Path) -> Result<ToolResult, String> {
    std::fs::create_dir_all(scratch).map_err(|e| e.to_string())?;
    let script = scratch.join("abyss_addon_tool.py");
    std::fs::write(&script, TOOL).map_err(|e| format!("{}: {e}", script.display()))?;
    let out = run_with_timeout(
        quiet_command(blender).args(["-b", "--python-exit-code", "1", "--python"]).arg(&script).args(["--", action, arg]),
        Duration::from_secs(300),
    )
    .ok_or_else(|| format!("Blender ({}) did not finish", blender.display()))?;
    let line = out.lines().rev().find_map(|l| l.strip_prefix("ABYSS_RESULT ")).ok_or_else(|| {
        let tail: Vec<&str> = out.lines().rev().take(6).collect();
        format!("Blender gave no result: {}", tail.into_iter().rev().collect::<Vec<_>>().join(" | "))
    })?;
    serde_json::from_str(line).map_err(|e| format!("Unreadable result from Blender: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert_eq!(parse_version("Blender 5.2.2\n\tbuild date: ..."), Some((5, 2, 2)));
        assert_eq!(parse_version("Blender 4.2 LTS"), Some((4, 2, 0)));
        assert_eq!(parse_version("nope"), None);
    }

    #[test]
    fn lists_addons_and_extensions() {
        let dir = tempfile::tempdir().unwrap();
        let addons = dir.path().join("scripts/addons");
        std::fs::create_dir_all(addons.join("pkg_addon")).unwrap();
        std::fs::write(addons.join("pkg_addon/__init__.py"), "").unwrap();
        std::fs::write(addons.join("single.py"), "").unwrap();
        std::fs::create_dir_all(addons.join("__pycache__")).unwrap();
        std::fs::create_dir_all(dir.path().join("extensions/user_default/cool_ext")).unwrap();
        assert_eq!(installed_modules(dir.path()), vec!["bl_ext.user_default.cool_ext", "pkg_addon", "single"]);
    }

    /// Installs and removes `samples/blender-addons/abyss_hello.zip` in every Blender found, inside a
    /// throw-away BLENDER_USER_RESOURCES so real preferences are untouched:
    /// `cargo test -- --ignored addon_round_trip --nocapture --test-threads=1`
    #[test]
    #[ignore]
    fn addon_round_trip() {
        let zip = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../samples/blender-addons/abyss_hello.zip");
        assert!(zip.is_file(), "build the sample first: {}", zip.display());
        let sandbox = tempfile::tempdir().unwrap();
        std::env::set_var("BLENDER_USER_RESOURCES", sandbox.path());
        let found = discover();
        assert!(!found.is_empty(), "no Blender found");
        for b in found.iter().filter(|b| b.supported) {
            println!("Blender {} at {}", b.version, b.executable.display());
            let installed = run_tool(&b.executable, "install", &zip.to_string_lossy(), sandbox.path()).unwrap();
            println!("  install: {installed:?}");
            assert!(installed.ok, "{installed:?}");
            let module = installed.module.unwrap();
            assert!(installed_modules(sandbox.path()).contains(&module));
            let removed = run_tool(&b.executable, "remove", &module, sandbox.path()).unwrap();
            println!("  remove: {removed:?}");
            assert!(removed.ok, "{removed:?}");
            assert!(!installed_modules(sandbox.path()).contains(&module));
        }
    }
}
