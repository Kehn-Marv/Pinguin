# Download and setup Ollama for Windows
$ErrorActionPreference = "Stop"

# Detect architecture
$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq "AMD64") {
    $archName = "x64"
    $ollamaArch = "amd64"
} elseif ($arch -eq "ARM64") {
    $archName = "arm64"
    $ollamaArch = "arm64"
} else {
    $archName = "x64"
    $ollamaArch = "amd64"
}

Write-Host "Setting up Ollama for Windows $archName..." -ForegroundColor Cyan

# Paths
$ollamaDir = Join-Path $PSScriptRoot "..\extraResources\ollama\win32-$archName"
$tempDir = Join-Path $env:TEMP "ollama-setup"

# Create directories
New-Item -ItemType Directory -Path $ollamaDir -Force | Out-Null
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Check if already installed
$ollamaExe = Join-Path $ollamaDir "ollama.exe"
if (Test-Path $ollamaExe) {
    Write-Host "Ollama already installed at: $ollamaExe" -ForegroundColor Green
    exit 0
}

# Get latest Ollama version
Write-Host "Fetching latest Ollama version..." -ForegroundColor Yellow
try {
    $releasesUrl = "https://api.github.com/repos/ollama/ollama/releases/latest"
    $release = Invoke-RestMethod -Uri $releasesUrl -Headers @{ "User-Agent" = "Pinguin-Setup" }
    $version = $release.tag_name
    Write-Host "Latest version: $version" -ForegroundColor Green
} catch {
    Write-Host "Failed to fetch latest version, using v0.13.1" -ForegroundColor Yellow
    $version = "v0.13.1"
}

# Download URL
$downloadUrl = "https://github.com/ollama/ollama/releases/download/$version/ollama-windows-$ollamaArch.zip"
$zipFile = Join-Path $tempDir "ollama.zip"

Write-Host "Downloading Ollama from: $downloadUrl" -ForegroundColor Yellow

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing
    Write-Host "Downloaded Ollama" -ForegroundColor Green
} catch {
    Write-Host "Failed to download Ollama: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please manually download from:" -ForegroundColor Yellow
    Write-Host "  $downloadUrl" -ForegroundColor Gray
    Write-Host "And extract to:" -ForegroundColor Yellow
    Write-Host "  $ollamaDir" -ForegroundColor Gray
    exit 1
}

# Extract
Write-Host "Extracting Ollama..." -ForegroundColor Yellow
try {
    Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force
    
    # Find ollama.exe in extracted files
    $extractedOllama = Get-ChildItem -Path $tempDir -Filter "ollama.exe" -Recurse | Select-Object -First 1
    
    if ($extractedOllama) {
        # Copy ollama.exe and any DLLs
        $extractedDir = $extractedOllama.Directory.FullName
        Copy-Item -Path (Join-Path $extractedDir "*") -Destination $ollamaDir -Recurse -Force
        Write-Host "Extracted Ollama to: $ollamaDir" -ForegroundColor Green
    } else {
        Write-Host "Could not find ollama.exe in downloaded archive" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Failed to extract Ollama: $_" -ForegroundColor Red
    exit 1
}

# Verify installation
if (Test-Path $ollamaExe) {
    Write-Host ""
    Write-Host "Ollama setup complete!" -ForegroundColor Green
    Write-Host "Binary: $ollamaExe" -ForegroundColor Cyan
    
    # Try to get version
    try {
        $ollamaVersion = & $ollamaExe --version 2>&1 | Select-Object -First 1
        Write-Host "Version: $ollamaVersion" -ForegroundColor Cyan
    } catch {
        Write-Host "Note: Could not verify version (may need dependencies)" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Warning: ollama.exe not found after installation" -ForegroundColor Yellow
}

# Cleanup
Write-Host ""
Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Done!" -ForegroundColor Green
