# Requires: PowerShell 7+ (pwsh), winget, and internet access
# This script installs signtool via Windows SDK, creates a self-signed code signing certificate (PFX),
# signs specified artifacts, verifies signatures, and uploads them to a GitHub release.
#
# Inputs via environment variables (set before running):
#   - SIGNING_PFX_PASSWORD: password to protect the generated PFX
#   - GITHUB_TOKEN: GitHub token with repo:write permissions
# Optional parameters:
#   -Repo "owner/repo" to override autodetected GitHub repo
#   -ReleaseTag "v1.2.0" to change the target release tag
#   -SkipInstall to skip winget installs (if tools are already present)

[CmdletBinding()]
param(
    [string]$Repo,
    [string]$ReleaseTag = 'v1.2.0',
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Require-Env([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) {
        # Also check Machine/User scopes in case caller set them there
        $value = [Environment]::GetEnvironmentVariable($Name, 'User')
        if ([string]::IsNullOrWhiteSpace($value)) {
            $value = [Environment]::GetEnvironmentVariable($Name, 'Machine')
        }
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Environment variable '$Name' is not set."
    }
    return $value
}

Write-Info "Starting sign-and-upload workflow"

# 1) Validate env vars
$null = Require-Env -Name 'SIGNING_PFX_PASSWORD'
$null = Require-Env -Name 'GITHUB_TOKEN'
$env:GH_TOKEN = $env:GITHUB_TOKEN

# 2) Ensure tools (winget, Windows SDK for signtool, GitHub CLI)
if (-not $SkipInstall) {
    Write-Info "Ensuring required tools via winget"
    try { winget --version | Out-Null } catch { throw "winget is not available. Please install winget and retry." }

    # Windows SDK (Desktop tools include signtool). Multiple IDs for compatibility; ignore failures if already installed
    $sdkIds = @(
        'Microsoft.WindowsSDK.Desktop',
        'Microsoft.WindowsSDK.10.0.22621'
    )
    foreach ($id in $sdkIds) {
        try {
            Write-Info "Installing $id (silent)"
            winget install --id $id --silent --accept-package-agreements --accept-source-agreements 2>$null | Out-Null
        } catch {
            Write-Info "Skipping $id (possibly already installed): $_"
        }
    }

    # GitHub CLI
    try {
        Write-Info "Installing GitHub CLI"
        winget install --id GitHub.cli --exact --silent --accept-package-agreements --accept-source-agreements 2>$null | Out-Null
    } catch {
        Write-Info "Skipping GitHub CLI install (possibly already present): $_"
    }
}

# 3) Locate signtool
Write-Info "Locating signtool.exe"
$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $signtool) { throw "signtool.exe not found. Ensure Windows SDK is installed." }
Write-Info "signtool: $signtool"

# 4) Create self-signed code-signing cert and export PFX (2-year validity)
Write-Info "Creating self-signed code signing certificate"
$pfxPath = Join-Path (Get-Location) 'splice-selfsigned.pfx'
if (Test-Path $pfxPath) { Remove-Item $pfxPath -Force }

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Splicedd Dev" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -KeyExportPolicy Exportable `
  -KeyLength 2048 `
  -KeyAlgorithm RSA `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(2)

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password (ConvertTo-SecureString $env:SIGNING_PFX_PASSWORD -AsPlainText -Force) | Out-Null
Write-Info "Exported PFX: $pfxPath"

# Also export and trust the certificate locally so verification succeeds with a self-signed cert
$cerPath = Join-Path (Get-Location) 'splice-selfsigned.cer'
if (Test-Path $cerPath) { Remove-Item $cerPath -Force }
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
try {
    Write-Info "Importing certificate to CurrentUser Trusted Root"
    Import-Certificate -FilePath $cerPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
} catch { }
try {
    Write-Info "Importing certificate to CurrentUser Trusted Publishers"
    Import-Certificate -FilePath $cerPath -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
} catch { }

# 5) Identify files to sign (probe multiple common locations)
function Find-FirstExisting([string[]]$Candidates, [string]$label) {
    foreach ($c in $Candidates) {
        if (Test-Path $c) { return (Resolve-Path $c).Path }
    }
    throw "Artifact not found for $label. Looked for: $($Candidates -join ', ')"
}

$exePath = Find-FirstExisting @(
    '.\src-tauri\release\Splice.exe',
    '.\Splice.exe'
) 'Splice.exe'

$nsisPath = Find-FirstExisting @(
    '.\src-tauri\release\bundle\nsis\Splice_1.2.0_x64-setup.exe',
    '.\Splice_1.2.0_x64-setup.exe'
) 'NSIS setup'

$msiPath = Find-FirstExisting @(
    '.\src-tauri\release\bundle\msi\Splice_1.2.0_x64_en-US.msi',
    '.\Splice_1.2.0_x64_en-US.msi'
) 'MSI'

$resolvedArtifacts = @($exePath, $nsisPath, $msiPath)
Write-Info ("Artifacts: " + ($resolvedArtifacts -join ', '))

# 6) Sign artifacts with RFC3161 timestamp
$timestampUrl = 'http://timestamp.digicert.com'
foreach ($f in $resolvedArtifacts) {
    Write-Info "Signing: $f"
    & $signtool sign /fd SHA256 /f $pfxPath /p $env:SIGNING_PFX_PASSWORD /tr $timestampUrl /td SHA256 "$f"
    if ($LASTEXITCODE -ne 0) { throw "Signing failed for $f" }
}

# 7) Verify signatures
foreach ($f in $resolvedArtifacts) {
    Write-Info "Verifying signature: $f"
    & $signtool verify /pa "$f"
    if ($LASTEXITCODE -ne 0) { throw "Signature verification failed for $f" }
}

# 8) GitHub auth (non-interactive)
Write-Info "Authenticating GitHub CLI"
$ghCmd = $null
$cmd = Get-Command gh -ErrorAction SilentlyContinue
if ($cmd) { $ghCmd = $cmd.Source }
if (-not $ghCmd) {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\GitHub CLI\gh.exe')
    )
    foreach ($c in $candidates) { if (Test-Path $c) { $ghCmd = $c; break } }
}
if (-not $ghCmd) { throw "GitHub CLI (gh) not found. Install gh and retry." }

try {
    & $ghCmd --version | Out-Null
    & $ghCmd auth status 2>$null | Out-Null
} catch {
    Write-Info "Logging into gh using GH_TOKEN"
    Write-Output $env:GITHUB_TOKEN | & $ghCmd auth login --with-token | Out-Null
}

# 9) Upload to the specified release tag
Write-Info "Uploading signed artifacts to release '$ReleaseTag'"
$uploadArgs = @('release', 'upload', $ReleaseTag) + $resolvedArtifacts + '--clobber'
if ($Repo) { $uploadArgs += @('--repo', $Repo) }

& $ghCmd @uploadArgs

Write-Info "Done: files signed and uploaded to release $ReleaseTag."


