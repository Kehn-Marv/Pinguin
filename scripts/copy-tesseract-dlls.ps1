# Copy required DLLs for Tesseract to work standalone
# This script finds and copies the Visual C++ Runtime DLLs needed by tesseract.exe

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

$tesseractDir = Join-Path $PSScriptRoot "..\extraResources\tesseract\win32-$archName"

Write-Host "Copying required DLLs for Tesseract ($archName)..." -ForegroundColor Cyan

# Common locations for Tesseract installation
$tesseractInstallDirs = @(
    "C:\Program Files\Tesseract-OCR",
    "C:\Program Files (x86)\Tesseract-OCR"
)

# Try to copy all DLLs from system Tesseract installation
$copiedFromInstall = $false
foreach ($installDir in $tesseractInstallDirs) {
    if (Test-Path $installDir) {
        Write-Host "Found Tesseract installation at: $installDir" -ForegroundColor Green
        try {
            Copy-Item "$installDir\*.dll" $tesseractDir -Force
            Write-Host "  ✓ Copied all DLLs from installation" -ForegroundColor Green
            $copiedFromInstall = $true
            break
        } catch {
            Write-Host "  ✗ Failed to copy DLLs: $_" -ForegroundColor Red
        }
    }
}

if ($copiedFromInstall) {
    Write-Host ""
    Write-Host "Testing Tesseract..." -ForegroundColor Cyan
    $tesseractExe = Join-Path $tesseractDir "tesseract.exe"
    try {
        $version = & $tesseractExe --version 2>&1 | Select-Object -First 1
        Write-Host "  ✓ Tesseract works: $version" -ForegroundColor Green
        Write-Host ""
        Write-Host "✓ Setup complete! OCR is ready to use." -ForegroundColor Green
        exit 0
    } catch {
        Write-Host "  ✗ Tesseract still not working: $_" -ForegroundColor Red
    }
}

# Fallback: Try to find individual DLLs
Write-Host "Tesseract installation not found, searching for individual DLLs..." -ForegroundColor Yellow

# Common locations for Visual C++ Runtime DLLs
$systemDirs = @(
    "$env:SystemRoot\System32",
    "$env:SystemRoot\SysWOW64"
)

# Required DLLs for Tesseract 5.x
$requiredDlls = @(
    "leptonica-1.82.0.dll",
    "libarchive-13.dll",
    "libbz2-1.dll",
    "libcrypto-1_1-x64.dll",
    "libcurl-4.dll",
    "libiconv-2.dll",
    "liblzma-5.dll",
    "libpng16-16.dll",
    "libssl-1_1-x64.dll",
    "libtiff-5.dll",
    "libwebp-7.dll",
    "libxml2-2.dll",
    "zlib1.dll",
    "giflib-5.dll",
    "libjpeg-8.dll",
    "libopenjp2-7.dll",
    "libzstd.dll"
)

$copiedCount = 0
$missingDlls = @()

foreach ($dll in $requiredDlls) {
    $found = $false
    
    foreach ($dir in $systemDirs) {
        $sourcePath = Join-Path $dir $dll
        
        if (Test-Path $sourcePath) {
            $destPath = Join-Path $tesseractDir $dll
            
            # Only copy if not already present
            if (-not (Test-Path $destPath)) {
                try {
                    Copy-Item $sourcePath $destPath -Force
                    Write-Host "  ✓ Copied: $dll" -ForegroundColor Green
                    $copiedCount++
                } catch {
                    Write-Host "  ✗ Failed to copy: $dll - $_" -ForegroundColor Red
                }
            } else {
                Write-Host "  ○ Already exists: $dll" -ForegroundColor Gray
            }
            
            $found = $true
            break
        }
    }
    
    if (-not $found) {
        $missingDlls += $dll
    }
}

Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Copied: $copiedCount DLLs" -ForegroundColor Green

if ($missingDlls.Count -gt 0) {
    Write-Host "  Missing: $($missingDlls.Count) DLLs" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Missing DLLs:" -ForegroundColor Yellow
    foreach ($dll in $missingDlls) {
        Write-Host "  - $dll" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "To fix this, install Tesseract from:" -ForegroundColor Yellow
    Write-Host "  https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.3.3.20231005.exe" -ForegroundColor Cyan
    Write-Host "Then run this script again." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Testing Tesseract..." -ForegroundColor Cyan

$tesseractExe = Join-Path $tesseractDir "tesseract.exe"
try {
    $version = & $tesseractExe --version 2>&1 | Select-Object -First 1
    Write-Host "  ✓ Tesseract works: $version" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Tesseract still not working: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "You may need to install Visual C++ Redistributable:" -ForegroundColor Yellow
    Write-Host "  https://aka.ms/vs/17/release/vc_redist.x64.exe" -ForegroundColor Cyan
}
