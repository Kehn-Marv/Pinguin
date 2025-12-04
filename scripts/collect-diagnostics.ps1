# Pinguin Diagnostic Information Collector
# Run this script and send the output to the developer

Write-Host "==================================================================="
Write-Host "Pinguin Diagnostic Information Collector"
Write-Host "==================================================================="
Write-Host ""

# Get installation path
$installPath = "$env:LOCALAPPDATA\pinguin"
Write-Host "Installation Path: $installPath"
Write-Host ""

# Check if installation exists
if (!(Test-Path $installPath)) {
    Write-Host "ERROR: Pinguin installation not found at $installPath"
    Write-Host "Please ensure Pinguin is installed."
    exit 1
}

# Check Python runtime
Write-Host "=== Python Runtime Check ==="
$pythonPath = Join-Path $installPath "app-1.0.0\resources\python-runtime\win32-x64\python.exe"
if (Test-Path $pythonPath) {
    Write-Host "✓ Python runtime found: $pythonPath"
    
    # Test Python version
    try {
        $version = & $pythonPath --version 2>&1
        Write-Host "✓ Python version: $version"
    } catch {
        Write-Host "✗ Failed to run Python: $_"
    }
} else {
    Write-Host "✗ Python runtime NOT FOUND at: $pythonPath"
}
Write-Host ""

# Check backend files
Write-Host "=== Backend Files Check ==="
$backendPath = Join-Path $installPath "app-1.0.0\resources\backend"
if (Test-Path $backendPath) {
    Write-Host "✓ Backend folder found"
    
    $serverPath = Join-Path $backendPath "server.py"
    if (Test-Path $serverPath) {
        Write-Host "✓ server.py found"
    } else {
        Write-Host "✗ server.py NOT FOUND"
    }
} else {
    Write-Host "✗ Backend folder NOT FOUND at: $backendPath"
}
Write-Host ""

# Check Python dependencies
Write-Host "=== Python Dependencies Check ==="
if (Test-Path $pythonPath) {
    $modules = @("fastapi", "uvicorn", "chromadb", "sentence_transformers", "langchain")
    
    foreach ($module in $modules) {
        try {
            & $pythonPath -c "import $module" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✓ $module"
            } else {
                Write-Host "✗ $module - Import failed"
            }
        } catch {
            Write-Host "✗ $module - Error: $_"
        }
    }
} else {
    Write-Host "Skipped - Python not found"
}
Write-Host ""

# Check logs
Write-Host "=== Recent Log Entries ==="
$logPath = "$env:APPDATA\Pinguin\logs\main.log"
if (Test-Path $logPath) {
    Write-Host "Log file found: $logPath"
    Write-Host ""
    Write-Host "Last 50 lines of log:"
    Write-Host "-------------------------------------------------------------------"
    Get-Content $logPath -Tail 50
    Write-Host "-------------------------------------------------------------------"
} else {
    Write-Host "✗ Log file not found at: $logPath"
}
Write-Host ""

# Check port 8000
Write-Host "=== Port 8000 Check ==="
$portCheck = netstat -ano | Select-String ":8000"
if ($portCheck) {
    Write-Host "⚠ Port 8000 is in use:"
    $portCheck
} else {
    Write-Host "✓ Port 8000 is available"
}
Write-Host ""

# System info
Write-Host "=== System Information ==="
Write-Host "OS: $([System.Environment]::OSVersion.VersionString)"
Write-Host "Architecture: $env:PROCESSOR_ARCHITECTURE"
Write-Host "User: $env:USERNAME"
Write-Host ""

# Check VC++ Runtime
Write-Host "=== Visual C++ Runtime Check ==="
$vcRedist = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" -ErrorAction SilentlyContinue
if ($vcRedist) {
    Write-Host "✓ VC++ Redistributable installed"
    Write-Host "  Version: $($vcRedist.Version)"
} else {
    Write-Host "⚠ VC++ Redistributable may not be installed"
}
Write-Host ""

Write-Host "==================================================================="
Write-Host "Diagnostic collection complete!"
Write-Host "==================================================================="
Write-Host ""
Write-Host "Please send this entire output to the developer."
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
