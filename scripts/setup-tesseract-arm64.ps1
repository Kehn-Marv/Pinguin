# Download and setup Tesseract ARM64 for Windows from NuGet
$ErrorActionPreference = "Stop"

Write-Host "Setting up Tesseract ARM64 for Windows..." -ForegroundColor Cyan

# Paths
$workDir = Join-Path $PSScriptRoot "..\temp\tesseract-nuget"
$tesseractDir = Join-Path $PSScriptRoot "..\extraResources\tesseract\win32-arm64"
$nugetExe = Join-Path $workDir "nuget.exe"

# Create working directory
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
New-Item -ItemType Directory -Path $tesseractDir -Force | Out-Null

# Check if already installed
$tesseractExe = Join-Path $tesseractDir "tesseract.exe"
if (Test-Path $tesseractExe) {
    Write-Host "Tesseract ARM64 already installed at: $tesseractExe" -ForegroundColor Green
    exit 0
}

# Download nuget.exe if not present
if (-not (Test-Path $nugetExe)) {
    Write-Host "Downloading NuGet.exe..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe" -OutFile $nugetExe
    Write-Host "Downloaded NuGet.exe" -ForegroundColor Green
}

# Download NAPS2.Tesseract.Binaries package
Write-Host "Downloading NAPS2.Tesseract.Binaries package..." -ForegroundColor Yellow
& $nugetExe install NAPS2.Tesseract.Binaries -OutputDirectory $workDir | Out-Null

# Find the package folder
$pkgFolder = Get-ChildItem "$workDir\NAPS2.Tesseract.Binaries.*" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $pkgFolder) {
    Write-Host "Failed to find NAPS2.Tesseract.Binaries package" -ForegroundColor Red
    exit 1
}

Write-Host "Found package: $($pkgFolder.Name)" -ForegroundColor Green

# Look for ARM64 binaries in the package
$possiblePaths = @(
    (Join-Path $pkgFolder.FullName "runtimes\win-arm64\native"),
    (Join-Path $pkgFolder.FullName "runtimes\win-arm64"),
    (Join-Path $pkgFolder.FullName "tools\win-arm64"),
    (Join-Path $pkgFolder.FullName "contentFiles\any\any\runtimes\win-arm64\native")
)

$srcPath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $srcPath = $path
        Write-Host "Found ARM64 binaries at: $path" -ForegroundColor Green
        break
    }
}

if (-not $srcPath) {
    Write-Host "Could not find ARM64 binaries in package. Checking package structure..." -ForegroundColor Yellow
    Get-ChildItem $pkgFolder.FullName -Recurse -Directory | Where-Object { $_.Name -like "*arm64*" } | ForEach-Object {
        Write-Host "  Found: $($_.FullName)" -ForegroundColor Cyan
    }
    Write-Host ""
    Write-Host "Please manually extract ARM64 binaries to: $tesseractDir" -ForegroundColor Yellow
    exit 1
}

# Copy ARM64 binaries
Write-Host "Copying ARM64 binaries to $tesseractDir..." -ForegroundColor Yellow
Copy-Item -Path (Join-Path $srcPath "*") -Destination $tesseractDir -Recurse -Force

# Download tessdata if not present
$tessdataDir = Join-Path $tesseractDir "tessdata"
$engTraineddata = Join-Path $tessdataDir "eng.traineddata"

if (-not (Test-Path $engTraineddata)) {
    Write-Host "Downloading tessdata (eng.traineddata)..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $tessdataDir -Force | Out-Null
    
    $tessdataUrl = "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata"
    Invoke-WebRequest -Uri $tessdataUrl -OutFile $engTraineddata
    Write-Host "Downloaded tessdata" -ForegroundColor Green
}

# Verify installation
if (Test-Path $tesseractExe) {
    Write-Host ""
    Write-Host "Tesseract ARM64 setup complete!" -ForegroundColor Green
    Write-Host "Binary: $tesseractExe" -ForegroundColor Cyan
    Write-Host "Tessdata: $tessdataDir" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "Warning: tesseract.exe not found after installation" -ForegroundColor Yellow
    Write-Host "You may need to manually copy the binary to: $tesseractDir" -ForegroundColor Yellow
}

# Cleanup
Write-Host ""
Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
Remove-Item $workDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Done!" -ForegroundColor Green
