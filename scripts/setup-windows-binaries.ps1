# Master script to setup all Windows binaries (Tesseract + Poppler) for current architecture
$ErrorActionPreference = "Stop"

# Detect architecture
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq "AMD64") {
    $archName = "x64"
} elseif ($arch -eq "ARM64") {
    $archName = "arm64"
} else {
    $archName = "x64" # Default to x64
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Windows Binary Setup for $archName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = $PSScriptRoot

# Setup Tesseract
Write-Host "Step 1: Setting up Tesseract..." -ForegroundColor Yellow
Write-Host ""

if ($archName -eq "arm64") {
    & (Join-Path $scriptDir "setup-tesseract-arm64.ps1")
} else {
    & (Join-Path $scriptDir "setup-tesseract-x64.ps1")
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Setup Poppler
Write-Host "Step 2: Setting up Poppler..." -ForegroundColor Yellow
Write-Host ""

& (Join-Path $scriptDir "setup-poppler.ps1")

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Setup Ollama
Write-Host "Step 3: Setting up Ollama..." -ForegroundColor Yellow
Write-Host ""

& (Join-Path $scriptDir "setup-ollama.ps1")

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Copy DLLs for Tesseract (x64 only, ARM64 should have them from NuGet)
if ($archName -eq "x64") {
    Write-Host "Step 4: Copying Tesseract DLLs..." -ForegroundColor Yellow
    Write-Host ""
    & (Join-Path $scriptDir "copy-tesseract-dlls.ps1")
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Setup complete for Windows $archName!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run: npm run verify-tesseract" -ForegroundColor White
Write-Host "2. Run: npm run verify-build-config" -ForegroundColor White
Write-Host ""
