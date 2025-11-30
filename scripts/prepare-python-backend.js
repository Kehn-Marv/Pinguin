/**
 * Script to prepare Python backend for packaging
 * This script ensures Python dependencies are bundled correctly
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..', 'backend');
const venvDir = path.join(backendDir, 'venv');

console.log('Preparing Python backend for packaging...');

// Check if Python 3.11 is available
let pythonCommand = null;
const pythonCommands = ['python3.11', 'python3', 'python'];

for (const cmd of pythonCommands) {
  try {
    const version = execSync(`${cmd} --version`, { encoding: 'utf8' });
    console.log(`Found: ${version.trim()}`);
    
    // Check if it's Python 3.11
    if (version.includes('Python 3.11')) {
      pythonCommand = cmd;
      console.log(`✓ Using ${cmd} (Python 3.11)`);
      break;
    }
  } catch (error) {
    // Command not found, continue
  }
}

if (!pythonCommand) {
  console.error('❌ Python 3.11 is required but not found!');
  console.error('Please install Python 3.11 and ensure it\'s in your PATH');
  process.exit(1);
}

// Create virtual environment if it doesn't exist
if (!fs.existsSync(venvDir)) {
  console.log('Creating Python virtual environment with Python 3.11...');
  execSync(`${pythonCommand} -m venv venv`, { cwd: backendDir, stdio: 'inherit' });
}

// Install dependencies
console.log('Installing Python dependencies...');
const pipCommand = process.platform === 'win32'
  ? path.join(venvDir, 'Scripts', 'pip.exe')
  : path.join(venvDir, 'bin', 'pip');

try {
  execSync(`"${pipCommand}" install -r requirements.txt`, {
    cwd: backendDir,
    stdio: 'inherit'
  });
} catch (error) {
  console.error('Failed to install Python dependencies');
  process.exit(1);
}

console.log('Python backend prepared successfully!');
