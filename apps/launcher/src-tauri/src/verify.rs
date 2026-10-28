//! Checking downloads before anything runs them: SHA-256 against the release's `SHA256SUMS.txt`
//! and the minisign signature Tauri's signer writes (`<installer>.sig`, also inlined in latest.json).

use std::io::Read;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use sha2::{Digest, Sha256};

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("{}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn b64_text(s: &str, what: &str) -> Result<String, String> {
    let bytes = STANDARD.decode(s.trim()).map_err(|e| format!("{what} is not base64: {e}"))?;
    String::from_utf8(bytes).map_err(|_| format!("{what} is not text"))
}

/// Same scheme as tauri-plugin-updater: both the public key (tauri.conf.json) and the signature
/// (`.sig`) are base64 of minisign's text format.
pub fn verify_signature(path: &Path, pubkey_b64: &str, signature_b64: &str) -> Result<(), String> {
    let key = PublicKey::decode(&b64_text(pubkey_b64, "Public key")?).map_err(|e| format!("Public key: {e}"))?;
    let sig = Signature::decode(&b64_text(signature_b64, "Signature")?).map_err(|e| format!("Signature: {e}"))?;
    let data = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    key.verify(&data, &sig, true).map_err(|_| format!("{} does not match its signature; it was not installed", path.file_name().unwrap_or_default().to_string_lossy()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_files() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.bin");
        std::fs::write(&p, b"abc").unwrap();
        assert_eq!(sha256_file(&p).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn rejects_garbage_signatures() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.bin");
        std::fs::write(&p, b"abc").unwrap();
        let key = crate::catalog::bundled().app("poseidon").unwrap().install.clone().unwrap().pubkey.unwrap();
        assert!(verify_signature(&p, &key, "bm90IGEgc2lnbmF0dXJl").is_err());
        assert!(verify_signature(&p, "!!", "!!").is_err());
    }
}
