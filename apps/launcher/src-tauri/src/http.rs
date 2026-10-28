//! HTTP downloads. Plain paths and `file://` URLs are read from disk instead, so a catalog or a
//! release can be served from a local folder while testing (see docs/RELEASE_STANDARD.md).

use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use tokio::io::AsyncWriteExt;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    // reqwest is built without a crypto provider (shared with tauri-plugin-updater); pick ring once.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .user_agent(concat!("Abyss/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .expect("HTTP client")
});

fn is_web(url: &str) -> bool {
    url.starts_with("https://") || url.starts_with("http://")
}

/// `file:///D:/x/y.json` or a plain path → a path on disk.
pub fn local_path(url: &str) -> PathBuf {
    let p = url.strip_prefix("file:///").or_else(|| url.strip_prefix("file://")).unwrap_or(url);
    PathBuf::from(p)
}

/// GET a small text document (catalog, latest.json, SHA256SUMS.txt). `Ok(None)` on HTTP 404.
pub async fn get_text_opt(url: &str) -> Result<Option<String>, String> {
    if !is_web(url) {
        return match tokio::fs::read_to_string(local_path(url)).await {
            Ok(t) => Ok(Some(t)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("{url}: {e}")),
        };
    }
    let resp = CLIENT.get(url).timeout(Duration::from_secs(30)).send().await.map_err(|e| format!("{url}: {e}"))?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let resp = resp.error_for_status().map_err(|e| format!("{url}: {e}"))?;
    resp.text().await.map(Some).map_err(|e| format!("{url}: {e}"))
}

pub async fn get_text(url: &str) -> Result<String, String> {
    get_text_opt(url).await?.ok_or_else(|| format!("{url}: not found (404)"))
}

/// Download `url` to `dest` (via a `.part` file), reporting `(downloaded, total)` at most ~8 times a second.
pub async fn download(url: &str, dest: &Path, mut progress: impl FnMut(u64, Option<u64>)) -> Result<(), String> {
    if let Some(dir) = dest.parent() {
        tokio::fs::create_dir_all(dir).await.map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    if !is_web(url) {
        let n = tokio::fs::copy(local_path(url), dest).await.map_err(|e| format!("{url}: {e}"))?;
        progress(n, Some(n));
        return Ok(());
    }
    let part = dest.with_extension("part");
    let mut resp = CLIENT.get(url).send().await.and_then(|r| r.error_for_status()).map_err(|e| format!("{url}: {e}"))?;
    let total = resp.content_length();
    let mut file = tokio::fs::File::create(&part).await.map_err(|e| format!("{}: {e}", part.display()))?;
    let mut done = 0u64;
    let mut last = Instant::now();
    progress(0, total);
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
        file.write_all(&chunk).await.map_err(|e| format!("{}: {e}", part.display()))?;
        done += chunk.len() as u64;
        if last.elapsed() > Duration::from_millis(120) {
            progress(done, total);
            last = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    tokio::fs::rename(&part, dest).await.map_err(|e| format!("{}: {e}", dest.display()))?;
    progress(done, total.or(Some(done)));
    Ok(())
}
