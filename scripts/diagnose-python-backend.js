/**
 * Diagnostic script to test Python backend startup
 * Run this to diagnose why the backend fails on user machines
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('Python Backend Diagnostic Tool');
console.log('='.repeat(60));
console.log('');

// Simulate packaged app paths
const isPackaged = process.argv.includes('--packaged');
const basePath = isPackaged 
  ? path.join(process.cwd(), 'app-1.0.0', 'resources')
  : process.cwd();

const pythonPath = isPackaged
  ? path.join(basePath, 'python-runtime', 'win32-x64', 'python.exe')
  : path.join(basePath, 'python-runtime', 'win32-x64', 'python.exe');

const backendPath = isPackaged
  ? path.join(basePath, 'backend')
  : path.join(basePath, 'backend');

console.log('Configuration:');
console.log(`  Mode: ${isPackaged ? 'PACKAGED' : 'DEVELOPMENT'}`);
console.log(`  Python path: ${pythonPath}`);
console.log(`  Backend path: ${backendPath}`);
console.log('');

// Check 1: Python exists
console.log('Check 1: Python Runtime');
if (fs.existsSync(pythonPath)) {
  console.log('  ✓ Python executable found');
} else {
  console.log('  ✗ Python executable NOT FOUND');
  console.log('  This is a critical error - the app cannot run without Python');
  process.exit(1);
}

// Check 2: Backend exists
console.log('');
console.log('Check 2: Backend Files');
const serverPath = path.join(backendPath, 'server.py');
if (fs.existsSync(serverPath)) {
  console.log('  ✓ server.py found');
} else {
  console.log('  ✗ server.py NOT FOUND');
  process.exit(1);
}

// Check 3: Python version
console.log('');
console.log('Check 3: Python Version');
try {
  const { execSync } = require('child_process');
  const version = execSync(`"${pythonPath}" --version`, { encoding: 'utf8' });
  console.log(`  ✓ ${version.trim()}`);
} catch (error) {
  console.log(`  ✗ Failed to get Python version: ${error.message}`);
}

// Check 4: Critical imports
console.log('');
console.log('Check 4: Python Dependencies');
const testImports = [
  'fastapi',
  'uvicorn',
  'chromadb',
  'sentence_transformers',
  'langchain',
  'pytesseract',
  'pdf2image'
];

for (const module of testImports) {
  try {
    const { execSync } = require('child_process');
    execSync(`"${pythonPath}" -c "import ${module}"`, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    console.log(`  ✓ ${module}`);
  } catch (error) {
    console.log(`  ✗ ${module} - MISSING OR BROKEN`);
  }
}

// Check 5: Try to start the server
console.log('');
console.log('Check 5: Server Startup Test');
console.log('  Starting Python backend (will run for 10 seconds)...');
console.log('');

const env = {
  ...process.env,
  PYTHONPATH: backendPath,
  PORT: '8000',
  EMBEDDING_MODEL: 'nomic-embed-text:v1.5',
  OLLAMA_HOST: 'http://localhost:11434',
  LANGCHAIN_TRACING_V2: 'false'
};

const pythonProcess = spawn(
  pythonPath,
  [path.join(backendPath, 'server.py')],
  {
    env,
    cwd: backendPath,
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

let stdout = '';
let stderr = '';
let startupSuccess = false;

pythonProcess.stdout.on('data', (data) => {
  const output = data.toString();
  stdout += output;
  console.log(`  [STDOUT] ${output.trim()}`);
  
  if (output.includes('Application startup complete')) {
    startupSuccess = true;
  }
});

pythonProcess.stderr.on('data', (data) => {
  const output = data.toString();
  stderr += output;
  console.log(`  [STDERR] ${output.trim()}`);
});

pythonProcess.on('error', (error) => {
  console.log(`  ✗ Process error: ${error.message}`);
});

pythonProcess.on('exit', (code, signal) => {
  console.log('');
  console.log(`  Process exited with code ${code} and signal ${signal}`);
});

// Let it run for 10 seconds
setTimeout(() => {
  console.log('');
  console.log('='.repeat(60));
  console.log('Diagnostic Summary');
  console.log('='.repeat(60));
  
  if (startupSuccess) {
    console.log('✓ Backend started successfully!');
    console.log('  The backend can start on this machine.');
  } else if (stderr.includes('Errno 10048') || stderr.includes('address already in use')) {
    console.log('⚠ Port 8000 is already in use');
    console.log('  The backend works, but port 8000 is occupied.');
    console.log('  This is usually not a problem in the real app.');
  } else if (stderr.includes('ModuleNotFoundError') || stderr.includes('ImportError')) {
    console.log('✗ Python dependencies are missing or broken');
    console.log('  The bundled Python runtime is incomplete.');
    console.log('  Solution: Re-run "npm run bundle-python" before building.');
  } else if (stderr.includes('Tesseract')) {
    console.log('⚠ Tesseract OCR issues detected');
    console.log('  OCR functionality may not work, but the backend should still start.');
  } else if (stderr) {
    console.log('✗ Backend failed to start');
    console.log('  Check the error output above for details.');
  } else {
    console.log('? Backend status unclear');
    console.log('  The process may still be starting. Check output above.');
  }
  
  console.log('');
  pythonProcess.kill();
  process.exit(startupSuccess ? 0 : 1);
}, 10000);
