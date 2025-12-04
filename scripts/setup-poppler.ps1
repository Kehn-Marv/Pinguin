# Download and setup Poppler for Windows
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

Write-Host "Detected architecture: $archName" -ForegroundColor Cyan

$popplerDir = Join-Path $PSScriptRoot "..\extraResources\poppler\win32-$archName"
$downloadUrl = "https://github.com/oschwartz10612/poppler-windows/releases/download/v24.08.0-0/Release-24.08.0-0.zip"
$zipFile = Join-Path $env:TEMP "poppler-$archName.zip"
$extractDir = Join-Path $env:TEMP "poppler-extract-$archName"

Write-Host "Setting up Poppler for Windows $archName..." -ForegroundColor Cyan

New-Item -ItemType Directory -Path $popplerDir -Force | Out-Null

$popplerExe = Join-Path $popplerDir "Library\bin\pdftoppm.exe"
if (Test-Path $popplerExe)
{
    Write-Host "Poppler already installed" -ForegroundColor Green
    exit 0
}

Write-Host "Downloading Poppler..." -ForegroundColor Yellow

try
{
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFile -UseBasicParsing
    Write-Host "Downloaded Poppler" -ForegroundColor Green
    
    Write-Host "Extracting..." -ForegroundColor Yellow
    Expand-Archive -Path $zipFile -DestinationPath $extractDir -Force
    
    $popplerExtracted = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    
    $sourceBin = Join-Path $popplerExtracted.FullName "Library\bin"
    $destBin = Join-Path $popplerDir "Library\bin"
    
    if (Test-Path $sourceBin)
    {
        Copy-Item -Path (Join-Path $popplerExtracted.FullName "Library") -Destination $popplerDir -Recurse -Force
        Write-Host "Copied Poppler binaries" -ForegroundColor Green
    }
    else
    {
        throw "Poppler binaries not found"
    }
    
    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue
    Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "Poppler setup complete!" -ForegroundColor Green
}
catch
{
    Write-Host "Failed to setup Poppler: $_" -ForegroundColor Red
    exit 1
}
