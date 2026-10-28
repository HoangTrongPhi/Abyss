<#
.SYNOPSIS
  Build and (optionally) publish a release of any Abyss app, following docs/RELEASE_STANDARD.md.

.DESCRIPTION
  Works for every Tauri app of the suite (Abyss itself, apps made from templates/tauri-app, Poseidon):
    1. sets the version in package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json
    2. builds the signed NSIS installer (npm run tauri build)
    3. writes release/<version>/ with
         <Product>_<version>_x64-setup.exe   the installer
         <Product>_<version>_x64-setup.exe.sig  minisign signature (Tauri's signer)
         latest.json                         Tauri updater manifest (read by the app itself and by Abyss)
         SHA256SUMS.txt                      SHA-256 of the three files above (checked by Abyss)
    4. -Publish: creates the GitHub release v<version> with the four files (needs gh)

  The GitHub repository is read from the updater endpoint in tauri.conf.json
  (https://github.com/<owner>/<repo>/releases/latest/download/latest.json).

.EXAMPLE
  ./scripts/release.ps1 -App apps/launcher -Version 0.2.0 -Notes "Tray menu lists every app"
  ./scripts/release.ps1 -App ../Nereid -Version 1.0.0 -Publish
  In CI the key comes from the TAURI_SIGNING_PRIVATE_KEY secret instead of -KeyPath.
#>
param(
    [Parameter(Mandatory = $true)][string]$App,
    [string]$Version,
    [string]$Notes = "",
    [string]$KeyPath,
    [switch]$Publish
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)  # no BOM: the updater parses latest.json strictly
function Set-FileText($path, $text) { [IO.File]::WriteAllText($path, $text, $utf8) }

$root = (Resolve-Path $App).Path
$pkgPath = Join-Path $root "package.json"
$cargoPath = Join-Path $root "src-tauri\Cargo.toml"
$confPath = Join-Path $root "src-tauri\tauri.conf.json"
foreach ($p in $pkgPath, $cargoPath, $confPath) { if (-not (Test-Path $p)) { throw "Not a Tauri app (missing $p)" } }

$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$product = $conf.productName
$endpoint = @($conf.plugins.updater.endpoints)[0]
if ($endpoint -notmatch '^https://github\.com/([^/]+/[^/]+)/releases/latest/download/latest\.json$') {
    throw "plugins.updater.endpoints[0] in tauri.conf.json must be https://github.com/<owner>/<repo>/releases/latest/download/latest.json (is: $endpoint)"
}
$repo = $Matches[1]

# ---------------------------------------------------------------- version
if ($Version) {
    if ($Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$') { throw "Not a semver version: $Version" }
    $pkg = [IO.File]::ReadAllText($pkgPath)
    Set-FileText $pkgPath ([regex]::new('"version":\s*"[^"]+"').Replace($pkg, "`"version`": `"$Version`"", 1))
    $c = [IO.File]::ReadAllText($confPath)
    Set-FileText $confPath ([regex]::new('"version":\s*"[^"]+"').Replace($c, "`"version`": `"$Version`"", 1))
    $cargo = [IO.File]::ReadAllText($cargoPath)
    Set-FileText $cargoPath ([regex]::new('(?m)^version = "[^"]+"').Replace($cargo, "version = `"$Version`"", 1))
    Write-Host "Version set to $Version"
}
$Version = (Get-Content $pkgPath -Raw | ConvertFrom-Json).version

# ---------------------------------------------------------------- signing key
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    # ~/.tauri/<Cargo package name>.key: abyss.key, poseidon.key, <id>.key for apps from create-app.
    $crate = [regex]::Match([IO.File]::ReadAllText($cargoPath), '(?m)^name = "([^"]+)"').Groups[1].Value
    if (-not $KeyPath) { $KeyPath = Join-Path $HOME ".tauri\$crate.key" }
    if (-not (Test-Path $KeyPath)) { throw "Signing key not found: $KeyPath (npx tauri signer generate -w `"$KeyPath`")" }
    $env:TAURI_SIGNING_PRIVATE_KEY = [IO.File]::ReadAllText($KeyPath).Trim()
}
if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "" }

# ---------------------------------------------------------------- build
Push-Location $root
# Windows PowerShell turns the CLI's stderr progress lines into errors under "Stop"; judge by exit code.
$ErrorActionPreference = "Continue"
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
    $ErrorActionPreference = "Stop"
}

# ---------------------------------------------------------------- collect
# A workspace member builds into the workspace's target folder; look in both.
$nsisDirs = @((Join-Path $root "src-tauri\target\release\bundle\nsis"), (Join-Path $root "..\..\target\release\bundle\nsis")) | Where-Object { Test-Path $_ }
$setup = $nsisDirs | ForEach-Object { Get-ChildItem $_ -Filter "*_${Version}_x64-setup.exe" } | Select-Object -First 1
if (-not $setup) { throw "No installer for $Version in $($nsisDirs -join ', ')" }
$sigPath = "$($setup.FullName).sig"
if (-not (Test-Path $sigPath)) { throw "Missing signature $sigPath (is TAURI_SIGNING_PRIVATE_KEY set?)" }

$outDir = Join-Path $root "release\$Version"
New-Item -ItemType Directory -Force $outDir | Out-Null
# GitHub turns spaces in asset names into dots, so ship a space-free name the manifest can point at.
$assetName = "$($product -replace '\s', '')_${Version}_x64-setup.exe"
Copy-Item $setup.FullName (Join-Path $outDir $assetName) -Force
Copy-Item $sigPath (Join-Path $outDir "$assetName.sig") -Force

$manifest = [ordered]@{
    version   = $Version
    notes     = $Notes
    pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = [IO.File]::ReadAllText($sigPath).Trim()
            url       = "https://github.com/$repo/releases/download/v$Version/$assetName"
        }
    }
}
Set-FileText (Join-Path $outDir "latest.json") ($manifest | ConvertTo-Json -Depth 5)

# sha256sum format: "<hex>  <name>", one line per asset.
$sums = Get-ChildItem $outDir -File | Where-Object Name -ne "SHA256SUMS.txt" | Sort-Object Name | ForEach-Object {
    "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
}
Set-FileText (Join-Path $outDir "SHA256SUMS.txt") (($sums -join "`n") + "`n")

Write-Host ""
Write-Host "Release files in $outDir" -ForegroundColor Green
Get-ChildItem $outDir | ForEach-Object { Write-Host "  $($_.Name)  ($([math]::Round($_.Length / 1MB, 2)) MB)" }

# ---------------------------------------------------------------- publish
if ($Publish) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "gh (GitHub CLI) is not installed; upload the four files by hand" }
    $files = Get-ChildItem $outDir | ForEach-Object { $_.FullName }
    $notesArg = if ($Notes) { $Notes } else { "$product v$Version" }
    gh release create "v$Version" @files --repo $repo --title "$product v$Version" --notes $notesArg --latest
    if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }
    Write-Host "Published https://github.com/$repo/releases/tag/v$Version" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Next: create release v$Version on https://github.com/$repo/releases/new with all four files (not a pre-release), or rerun with -Publish."
}
