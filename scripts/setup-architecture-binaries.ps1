# Script to restructure extraResources for architecture-specific binaries
# This sets up both x64 and ARM64 binaries for Windows

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setting up Architecture-Specific Binaries" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot
$extraResourcesPath = Join-Path $projectRoot "extraResources"

# Function to create directory if it doesn't exist
function Ensure-Directory {
    param([string]$path)
    if (!(Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Write-Host "Created directory: $path" -ForegroundColor Green
    }
}

# Function to copy directory recursively
function Copy-DirectoryRecursive {
    param(
        [string]$source,
        [string]$destination
    )
    if (Test-Path $source) {
        Ensure-Directory $destination
        Copy-Item -Path "$source\*" -Destination $destination -Recurse -Force
        Write-Host "Copied: $source -> $destination" -ForegroundColor Green
    } else {
        Write-Host "Warning: Source not found: $source" -ForegroundColor Yellow
    }
}

Write-Host "Step 1: Restructuring Ollama binaries..." -ForegroundColor Yellow
Write-Host ""

# Ollama x64
$ollamaPath = Join-Path $extraResourcesPath "ollama"
$ollamaX64Path = Join-Path $ollamaPath "win32-x64"
$ollamaArm64Path = Join-Path $ollamaPath "win32-arm64"

# Check if already restructured
if (Test-Path (Join-Path $ollamaPath "ollama.exe")) {
    Write-Host "Restructuring Ollama x64 binaries..." -ForegroundColor Cyan
    
    # Create x64 directory
    Ensure-Directory $ollamaX64Path
    
    # Move existing files to x64 folder
    Move-Item -Path (Join-Path $ollamaPath "ollama.exe") -Destination $ollamaX64Path -Force
    if (Test-Path (Join-Path $ollamaPath "vc_redist.x64.exe")) {
        Move-Item -Path (Join-Path $ollamaPath "vc_redist.x64.exe") -Destination $ollamaX64Path -Force
    }
    if (Test-Path (Join-Path $ollamaPath "lib")) {
        Move-Item -Path (Join-Path $ollamaPath "lib") -Destination $ollamaX64Path -Force
    }
    
    Write-Host "Ollama x64 binaries moved to win32-x64/" -ForegroundColor Green
} else {
    Write-Host "Ollama x64 already restructured" -ForegroundColor Green
}

# Download Ollama ARM64 if not present
if (!(Test-Path (Join-Path $ollamaArm64Path "ollama.exe"))) {
    Write-Host ""
    Write-Host "Downloading Ollama ARM64 binary..." -ForegroundColor Cyan
    
    $ollamaArm64Url = "https://github.com/ollama/ollama/releases/download/v0.13.0/ollama-windows-arm64.zip"
    $ollamaArm64Zip = Join-Path $env:TEMP "ollama-windows-arm64.zip"
    $ollamaArm64Extract = Join-Path $env:TEMP "ollama-arm64-extract"
    
    try {
        # Download
        Write-Host "Downloading from: $ollamaArm64Url" -ForegroundColor Gray
        Invoke-WebRequest -Uri $ollamaArm64Url -OutFile $ollamaArm64Zip -UseBasicParsing
        Write-Host "Downloaded successfully" -ForegroundColor Green
        
        # Extract
        Write-Host "Extracting..." -ForegroundColor Gray
        Expand-Archive -Path $ollamaArm64Zip -DestinationPath $ollamaArm64Extract -Force
        
        # Create ARM64 directory and copy files
        Ensure-Directory $ollamaArm64Path
        
        # The zip contains the files directly or in a subdirectory
        $extractedFiles = Get-ChildItem -Path $ollamaArm64Extract -Recurse -File
        foreach ($file in $extractedFiles) {
            if ($file.Name -eq "ollama.exe" -or $file.Extension -eq ".dll") {
                Copy-Item -Path $file.FullName -Destination $ollamaArm64Path -Force
            }
        }
        
        # Copy lib folder if it exists
        $libFolder = Get-ChildItem -Path $ollamaArm64Extract -Recurse -Directory | Where-Object { $_.Name -eq "lib" } | Select-Object -First 1
        if ($libFolder) {
            Copy-DirectoryRecursive -source $libFolder.FullName -destination (Join-Path $ollamaArm64Path "lib")
        }
        
        Write-Host "Ollama ARM64 binary installed successfully" -ForegroundColor Green
        
        # Cleanup
        Remove-Item -Path $ollamaArm64Zip -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $ollamaArm64Extract -Recurse -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Host "Error downloading Ollama ARM64: $_" -ForegroundColor Red
        Write-Host "You can manually download from: $ollamaArm64Url" -ForegroundColor Yellow
    }
} else {
    Write-Host "Ollama ARM64 already present" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 2: Restructuring Tesseract binaries..." -ForegroundColor Yellow
Write-Host ""

$tesseractPath = Join-Path $extraResourcesPath "tesseract"
$tesseractWin32Path = Join-Path $tesseractPath "win32"
$tesseractX64Path = Join-Path $tesseractPath "win32-x64"
$tesseractArm64Path = Join-Path $tesseractPath "win32-arm64"

# Check if old win32 folder exists (not yet restructured)
if ((Test-Path $tesseractWin32Path) -and !(Test-Path $tesseractX64Path)) {
    Write-Host "Restructuring Tesseract binaries..." -ForegroundColor Cyan
    
    # Rename win32 to win32-x64
    Rename-Item -Path $tesseractWin32Path -NewName "win32-x64" -Force
    Write-Host "Renamed win32 -> win32-x64" -ForegroundColor Green
    
    # Copy x64 binaries to ARM64 folder (ARM64 will use x64 via emulation)
    Write-Host "Copying x64 binaries to ARM64 folder for emulation..." -ForegroundColor Cyan
    Copy-DirectoryRecursive -source $tesseractX64Path -destination $tesseractArm64Path
    Write-Host "Tesseract ARM64 folder created using x64 binaries" -ForegroundColor Green
} elseif (Test-Path $tesseractX64Path) {
    Write-Host "Tesseract x64 already restructured" -ForegroundColor Green
    
    # Ensure ARM64 folder exists
    if (!(Test-Path $tesseractArm64Path)) {
        Write-Host "Creating ARM64 folder..." -ForegroundColor Cyan
        Copy-DirectoryRecursive -source $tesseractX64Path -destination $tesseractArm64Path
        Write-Host "Tesseract ARM64 folder created" -ForegroundColor Green
    } else {
        Write-Host "Tesseract ARM64 already present" -ForegroundColor Green
    }
} else {
    Write-Host "Warning: Tesseract binaries not found!" -ForegroundColor Yellow
    Write-Host "Please run: npm run setup-tesseract" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 3: Restructuring Poppler binaries..." -ForegroundColor Yellow
Write-Host ""

$popplerPath = Join-Path $extraResourcesPath "poppler"
$popplerWin32Path = Join-Path $popplerPath "win32"
$popplerX64Path = Join-Path $popplerPath "win32-x64"
$popplerArm64Path = Join-Path $popplerPath "win32-arm64"

# Check if old win32 folder exists (not yet restructured)
if ((Test-Path $popplerWin32Path) -and !(Test-Path $popplerX64Path)) {
    Write-Host "Restructuring Poppler binaries..." -ForegroundColor Cyan
    
    # Rename win32 to win32-x64
    Rename-Item -Path $popplerWin32Path -NewName "win32-x64" -Force
    Write-Host "Renamed win32 -> win32-x64" -ForegroundColor Green
    
    # Copy x64 binaries to ARM64 folder (ARM64 will use x64 via emulation)
    Write-Host "Copying x64 binaries to ARM64 folder for emulation..." -ForegroundColor Cyan
    Copy-DirectoryRecursive -source $popplerX64Path -destination $popplerArm64Path
    Write-Host "Poppler ARM64 folder created using x64 binaries" -ForegroundColor Green
} elseif (Test-Path $popplerX64Path) {
    Write-Host "Poppler x64 already restructured" -ForegroundColor Green
    
    # Ensure ARM64 folder exists
    if (!(Test-Path $popplerArm64Path)) {
        Write-Host "Creating ARM64 folder..." -ForegroundColor Cyan
        Copy-DirectoryRecursive -source $popplerX64Path -destination $popplerArm64Path
        Write-Host "Poppler ARM64 folder created" -ForegroundColor Green
    } else {
        Write-Host "Poppler ARM64 already present" -ForegroundColor Green
    }
} else {
    Write-Host "Warning: Poppler binaries not found!" -ForegroundColor Yellow
    Write-Host "Please run: npm run setup-poppler" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Verification:" -ForegroundColor Yellow
Write-Host ""

# Verify all binaries
$allGood = $true

# Check Ollama
if (Test-Path (Join-Path $ollamaX64Path "ollama.exe")) {
    Write-Host "[OK] Ollama x64 binary present" -ForegroundColor Green
} else {
    Write-Host "[MISSING] Ollama x64 binary" -ForegroundColor Red
    $allGood = $false
}

if (Test-Path (Join-Path $ollamaArm64Path "ollama.exe")) {
    Write-Host "[OK] Ollama ARM64 binary present" -ForegroundColor Green
} else {
    Write-Host "[MISSING] Ollama ARM64 binary" -ForegroundColor Red
    $allGood = $false
}

# Check Tesseract
if (Test-Path (Join-Path $tesseractX64Path "tesseract.exe")) {
    Write-Host "[OK] Tesseract x64 binary present" -ForegroundColor Green
} else {
    Write-Host "[MISSING] Tesseract x64 binary" -ForegroundColor Red
    $allGood = $false
}

if (Test-Path (Join-Path $tesseractArm64Path "tesseract.exe")) {
    Write-Host "[OK] Tesseract ARM64 binary present" -ForegroundColor Green
} else {
    Write-Host "[MISSING] Tesseract ARM64 binary" -ForegroundColor Red
    $allGood = $false
}

# Check Poppler
if (Test-Path (Join-Path $popplerX64Path "Library\bin")) {
    Write-Host "[OK] Poppler x64 binaries present" -ForegroundColor Green
} else {
    Write-Host "[MISSING] Poppler x64 binaries" -ForegroundColor Red
    $allGood = $false
}

if (Test-Path (Join-Path $popplerArm64Path "Library\bin")) {
    Write-Host "[OK] Poppler ARM64 binaries present" -ForegroundColor Green
} else {
    Write-Host "[MISSING] Poppler ARM64 binaries" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($allGood) {
    Write-Host "All binaries are ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now build for both architectures:" -ForegroundColor Cyan
    Write-Host "  npm run make -- --arch=x64" -ForegroundColor White
    Write-Host "  npm run make -- --arch=arm64" -ForegroundColor White
} else {
    Write-Host "Some binaries are missing. Please check the warnings above." -ForegroundColor Yellow
}

Write-Host ""
