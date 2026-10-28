//! Windows integration: installed apps (Uninstall registry), running processes, launching and
//! revealing files.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{LazyLock, Mutex};

use serde::Serialize;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

use crate::catalog::InstallSpec;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub version: String,
    pub install_dir: PathBuf,
    pub exe: Option<PathBuf>,
    #[serde(skip)]
    pub uninstaller: Option<String>,
}

/// `"C:\x\y.exe",0` → `C:\x\y.exe`
fn unquote(raw: &str) -> String {
    let s = raw.trim();
    match s.strip_prefix('"') {
        Some(rest) => rest.split('"').next().unwrap_or("").to_string(),
        None => s.rsplit_once(',').filter(|(_, idx)| idx.trim().parse::<i32>().is_ok()).map(|(p, _)| p).unwrap_or(s).to_string(),
    }
}

#[cfg(windows)]
pub fn installed(spec: &InstallSpec) -> Option<Installed> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
    use winreg::RegKey;

    let path = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}", spec.uninstall_key);
    let roots = [
        (HKEY_CURRENT_USER, KEY_READ),
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_64KEY),
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_32KEY),
    ];
    for (root, flags) in roots {
        let Ok(key) = RegKey::predef(root).open_subkey_with_flags(&path, flags) else { continue };
        let get = |name: &str| key.get_value::<String, _>(name).ok().filter(|v| !v.trim().is_empty());
        let Some(version) = get("DisplayVersion") else { continue };
        let icon = get("DisplayIcon").map(|v| PathBuf::from(unquote(&v)));
        let install_dir = get("InstallLocation")
            .map(|v| PathBuf::from(unquote(&v)))
            .or_else(|| icon.as_ref().and_then(|i| i.parent().map(Path::to_path_buf)))
            .unwrap_or_default();
        let exe = Some(install_dir.join(&spec.exe)).filter(|p| p.is_file()).or(icon.filter(|p| p.is_file()));
        return Some(Installed { version, install_dir, exe, uninstaller: get("QuietUninstallString").or_else(|| get("UninstallString")) });
    }
    None
}

#[cfg(not(windows))]
pub fn installed(_spec: &InstallSpec) -> Option<Installed> {
    None
}

/// Lower-cased full paths of every running executable.
pub fn running_exes() -> HashSet<String> {
    static SYS: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new()));
    let Ok(mut sys) = SYS.lock() else { return HashSet::new() };
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet));
    sys.processes().values().filter_map(|p| p.exe()).map(path_key).collect()
}

pub fn path_key(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").to_lowercase()
}

#[cfg(windows)]
fn hide_console(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}

#[cfg(not(windows))]
fn hide_console(_cmd: &mut Command) {}

/// A short-lived helper process without a console window flashing up.
pub fn quiet_command(exe: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(exe);
    hide_console(&mut cmd);
    cmd.stdin(Stdio::null());
    cmd
}

/// Start an app on its own (it outlives Abyss). Apps learn they were started by Abyss from `ABYSS=1`.
pub fn launch(target: &Path, args: &[String]) -> Result<(), String> {
    if !target.exists() {
        return Err(format!("{} is missing; reinstall the app", target.display()));
    }
    let is_exe = target.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe"));
    let mut cmd = if is_exe {
        let mut c = Command::new(target);
        c.args(args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0000_0008 | 0x0000_0200); // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        }
        c
    } else {
        // Shortcuts, scripts, documents: let Windows pick the program, as a double-click would.
        let mut c = quiet_command("cmd");
        c.arg("/C").arg("start").arg("").arg(target).args(args);
        c
    };
    if let Some(dir) = target.parent() {
        cmd.current_dir(dir);
    }
    cmd.env("ABYSS", "1").env("ABYSS_VERSION", env!("CARGO_PKG_VERSION")).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.spawn().map(|_| ()).map_err(|e| format!("Could not start {}: {e}", target.display()))
}

pub fn reveal(path: &Path) -> Result<(), String> {
    let mut cmd = Command::new("explorer");
    if path.is_file() {
        cmd.arg(format!("/select,{}", path.display()));
    } else {
        cmd.arg(path);
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

pub fn open_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Only https links can be opened".into());
    }
    // rundll32 hands the URL to the default browser without a shell parsing it.
    quiet_command("rundll32").arg("url.dll,FileProtocolHandler").arg(url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Split `"C:\Program Files\x\uninstall.exe" /arg` into program and arguments.
pub fn split_command_line(cmd: &str) -> (String, Vec<String>) {
    let s = cmd.trim();
    let (prog, rest) = match s.strip_prefix('"') {
        Some(r) => r.split_once('"').map(|(p, rest)| (p.to_string(), rest)).unwrap_or((r.to_string(), "")),
        None => s.split_once(' ').map(|(p, rest)| (p.to_string(), rest)).unwrap_or((s.to_string(), "")),
    };
    (prog, rest.split_whitespace().map(str::to_string).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_values() {
        assert_eq!(unquote(r#""C:\Users\me\AppData\Local\Poseidon""#), r"C:\Users\me\AppData\Local\Poseidon");
        assert_eq!(unquote(r#""C:\x\poseidon.exe",0"#), r"C:\x\poseidon.exe");
        assert_eq!(unquote(r"C:\x\poseidon.exe,0"), r"C:\x\poseidon.exe");
        assert_eq!(unquote(r"C:\x, y\app.exe"), r"C:\x, y\app.exe");
    }

    #[test]
    fn command_lines() {
        let (p, a) = split_command_line(r#""C:\Users\me\AppData\Local\Poseidon\uninstall.exe" /S"#);
        assert_eq!(p, r"C:\Users\me\AppData\Local\Poseidon\uninstall.exe");
        assert_eq!(a, vec!["/S"]);
        assert_eq!(split_command_line(r"C:\x\u.exe").0, r"C:\x\u.exe");
    }

    /// On a machine with Poseidon installed (the author's): `cargo test -- --ignored finds_poseidon --nocapture`.
    #[test]
    #[ignore]
    fn finds_poseidon() {
        let spec = crate::catalog::bundled().app("poseidon").unwrap().install.clone().unwrap();
        let found = installed(&spec).expect("Poseidon is installed");
        println!("{found:?}");
        assert!(found.exe.is_some_and(|e| e.is_file()));
    }
}
