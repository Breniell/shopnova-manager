#!/usr/bin/env pwsh
<#
.SYNOPSIS
Create GitHub Release v1.3.2 with assets

.DESCRIPTION
This script creates a GitHub release for v1.3.2 with the built installer and metadata files.

.NOTES
Requires: GitHub token to be passed as parameter or set via GITHUB_TOKEN env var
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$GitHubToken,
    
    [Parameter(Mandatory = $false)]
    [string]$Owner = "Breniell",
    
    [Parameter(Mandatory = $false)]
    [string]$Repo = "shopnova-manager",
    
    [Parameter(Mandatory = $false)]
    [string]$Tag = "v1.3.2",
    
    [Parameter(Mandatory = $false)]
    [string]$ReleasePath = "d:\Shopnova\shopnova-manager\release"
)

$ErrorActionPreference = "Stop"

# API endpoint
$apiUrl = "https://api.github.com/repos/$Owner/$Repo/releases"

# Release metadata
$releaseData = @{
    tag_name    = $Tag
    name        = "v1.3.2 - Legwan Complete POS"
    body        = @"
# Legwan v1.3.2 - Release

**Date :** 26 mai 2026

## 📦 Cumul des fonctionnalités

Cette version inclut les trois grands modules du POS Legwan :

### 1. **Gestion des Sessions de Caisse** (v1.2.2)
- Ouverture de sessions associées à chaque caissier
- Tracking des sorties de caisse (avances, prêts, remboursements, dépenses)
- Clôture de session avec conciliation automatique des écarts

### 2. **Prix Négociable** (v1.2.1)
- Support des prix variables par produit
- Interface de saisie pour prix négociable
- Historique des prix appliqués

### 3. **Gestion du Crédit Client** (v1.1.3)
- Activation/désactivation du crédit par client
- Tracking du solde de crédit
- Historique des transactions de crédit

### 4. **Inventaire & Réconciliation** (v1.3 - NOUVEAU)
- Interface complète de gestion d'inventaire
- 8 motifs d'écart configurables
- Workflow de validation
- Historique des sessions d'inventaire

## 🔧 Caractéristiques

- **Electron v26.6.10** - Desktop application
- **NSIS Installer** - Signed Windows executable
- **Auto-updates** - Electron-updater support
- **441 Tests** - Comprehensive test coverage
- **Version Policy** - Privacy policy v1.3.2 aligned

## 📥 Installation

Download `Legwan Setup 1.3.2.exe` and run the installer.

---

**Legwan v1.3.2** — The Complete African POS
"@
    draft       = $false
    prerelease  = $false
} | ConvertTo-Json

# Headers for authentication
$headers = @{
    Authorization = "Bearer $GitHubToken"
    Accept        = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

Write-Host "Creating GitHub Release v1.3.2..." -ForegroundColor Cyan

try {
    # Create the release
    $release = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $releaseData -ContentType "application/json"
    $uploadUrl = $release.upload_url -replace '\{.*\}', ''
    $releaseId = $release.id
    
    Write-Host "✓ Release created: $($release.html_url)" -ForegroundColor Green
    
    # Upload assets
    $assets = @(
        @{
            name = "Legwan Setup 1.3.2.exe"
            path = "$ReleasePath\Legwan Setup 1.3.2.exe"
            type = "application/octet-stream"
        },
        @{
            name = "Legwan Setup 1.3.2.exe.blockmap"
            path = "$ReleasePath\Legwan Setup 1.3.2.exe.blockmap"
            type = "application/json"
        },
        @{
            name = "latest.yml"
            path = "$ReleasePath\latest.yml"
            type = "text/yaml"
        }
    )
    
    foreach ($asset in $assets) {
        if (-not (Test-Path $asset.path)) {
            Write-Host "⚠ Asset not found: $($asset.path)" -ForegroundColor Yellow
            continue
        }
        
        Write-Host "Uploading: $($asset.name)..." -ForegroundColor Blue
        
        $assetUrl = "$uploadUrl`?name=$($asset.name)"
        $fileContent = [IO.File]::ReadAllBytes($asset.path)
        
        $uploadHeaders = $headers.Clone()
        $uploadHeaders["Content-Type"] = $asset.type
        
        $response = Invoke-RestMethod -Uri $assetUrl -Method Post -Headers $uploadHeaders -Body $fileContent
        Write-Host "✓ Uploaded: $($response.name) ($($response.size) bytes)" -ForegroundColor Green
    }
    
    Write-Host "`n✓ Release v1.3.2 created successfully!" -ForegroundColor Green
    Write-Host "   URL: $($release.html_url)" -ForegroundColor Green
    
}
catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails)" -ForegroundColor Red
    exit 1
}
