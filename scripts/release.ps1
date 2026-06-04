# ============================================================
#  Legwan — Script de release PowerShell
#  Usage: .\scripts\release.ps1 -Version "1.5.0" -GhToken "ghp_..."
# ============================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [Parameter(Mandatory=$false)]
    [string]$GhToken = $env:GH_TOKEN
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Set-Location $root

Write-Host "`n=== Legwan Release v$Version ===" -ForegroundColor Cyan

# 1. Verifier que les tests passent
Write-Host "`n[1/6] Tests..." -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) { Write-Error "Tests echoues — release annulee."; exit 1 }
Write-Host "OK" -ForegroundColor Green

# 2. Bump version dans package.json
Write-Host "`n[2/6] Mise a jour package.json v$Version..." -ForegroundColor Yellow
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json" -Encoding utf8
Write-Host "OK" -ForegroundColor Green

# 3. Mettre a jour APP_VERSION dans registryService.ts
Write-Host "`n[3/6] Mise a jour APP_VERSION dans registryService.ts..." -ForegroundColor Yellow
(Get-Content "src/services/registryService.ts") -replace "const APP_VERSION = '.*'", "const APP_VERSION = '$Version'" |
    Set-Content "src/services/registryService.ts" -Encoding utf8
Write-Host "OK" -ForegroundColor Green

# 4. Mettre a jour POLICY_VERSION dans PolicyGate.tsx
Write-Host "`n[4/6] Mise a jour POLICY_VERSION dans PolicyGate.tsx..." -ForegroundColor Yellow
(Get-Content "src/components/PolicyGate.tsx") -replace "const POLICY_VERSION = '.*'", "const POLICY_VERSION = '$Version'" |
    Set-Content "src/components/PolicyGate.tsx" -Encoding utf8
Write-Host "OK" -ForegroundColor Green

# 5. Deploy regles Firestore (requiert firebase login prealable)
Write-Host "`n[5/6] Deploiement regles Firestore..." -ForegroundColor Yellow
firebase deploy --only firestore:rules
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Firebase deploy echoue — continuez manuellement ou verifiez firebase login."
} else {
    Write-Host "OK" -ForegroundColor Green
}

# 6. Commit + tag + push + GitHub Release
Write-Host "`n[6/6] Git commit + tag + push + GitHub Release..." -ForegroundColor Yellow

$changelogFile = "CHANGELOG-v$Version.md"
if (-not (Test-Path $changelogFile)) {
    Write-Warning "Pas de $changelogFile — creation d'un changelog minimal."
    "# Legwan v$Version`n`nRelease du $(Get-Date -Format 'dd/MM/yyyy')." | Set-Content $changelogFile -Encoding utf8
}

git add -A
git commit -m "chore(release): v$Version"
git tag -a "v$Version" -m "Legwan v$Version"

if ($GhToken) {
    git remote set-url origin "https://$GhToken@github.com/Breniell/shopnova-manager.git"
}

git push origin main
git push origin "v$Version"

if ($GhToken) {
    $env:GH_TOKEN = $GhToken
    $refreshedPath = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $env:Path = $refreshedPath
    gh release create "v$Version" --title "Legwan v$Version" --notes-file $changelogFile --latest
    Write-Host "`nRelease publiee !" -ForegroundColor Green
    Write-Host "https://github.com/Breniell/shopnova-manager/releases/tag/v$Version" -ForegroundColor Cyan
} else {
    Write-Warning "GhToken non fourni — creez la release manuellement sur GitHub."
}

Write-Host "`n=== Release v$Version terminee ===" -ForegroundColor Cyan
