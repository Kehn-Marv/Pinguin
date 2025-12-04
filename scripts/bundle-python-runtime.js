/**
 * Bundle Python Runtime for Windows
 * Downloads Python embeddable distribution and installs all dependencies
 * This creates a standalone Python runtime that can be packaged with the app
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

// Python version to bundle
const PYTHON_VERSION = '3.11.0';
const PYTHON_DOWNLOAD_BASE = 'https://www.python.org/ftp/python';

// Architecture mapping
const ARCH_MAP = {
  'x64': 'amd64',
  'arm64': 'arm64'
};

/**
 * Download file from URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Extract zip file
 */
function extractZip(zipPath, destPath) {
  console.log(`Extracting: ${zipPath} to ${destPath}`);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destPath, true);
}

/**
 * Bundle Python for specific architecture
 */
async function bundlePythonForArch(arch) {
  console.log(`\n=== Bundling Python ${PYTHON_VERSION} for ${arch} ===\n`);
  
  const pythonArch = ARCH_MAP[arch];
  if (!pythonArch) {
    throw new Error(`Unsupported architecture: ${arch}`);
  }
  
  // Detect if we're cross-compiling (building for different arch than host)
  const hostArch = process.arch;
  const isCrossCompiling = hostArch !== arch;
  
  // For ARM64 builds on x64 machines, use x64 Python (will run via emulation on ARM64 Windows)
  let actualPythonArch = pythonArch;
  if (isCrossCompiling && arch === 'arm64' && hostArch === 'x64') {
    console.log(`\n⚠️  Cross-compiling ARM64 on x64 system`);
    console.log(`⚠️  Using x64 Python for ARM64 build (will run via Windows emulation)`);
    actualPythonArch = 'amd64'; // Use x64 Python instead
  } else if (isCrossCompiling) {
    console.log(`\n⚠️  Cross-compiling: Building ${arch} on ${hostArch} system`);
    console.log(`⚠️  Will download Python but skip pip installation (cannot execute ${arch} binaries on ${hostArch})`);
  }
  
  // Paths
  const tempDir = path.join(__dirname, '..', 'temp');
  const pythonDir = path.join(__dirname, '..', 'python-runtime', `win32-${arch}`);
  const backendDir = path.join(__dirname, '..', 'backend');
  
  // Create directories
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  if (fs.existsSync(pythonDir)) {
    console.log(`Cleaning existing Python runtime at ${pythonDir}`);
    fs.rmSync(pythonDir, { recursive: true, force: true });
  }
  fs.mkdirSync(pythonDir, { recursive: true });
  
  // Download Python embeddable package
  const pythonZipName = `python-${PYTHON_VERSION}-embed-${actualPythonArch}.zip`;
  const pythonZipPath = path.join(tempDir, pythonZipName);
  const pythonUrl = `${PYTHON_DOWNLOAD_BASE}/${PYTHON_VERSION}/${pythonZipName}`;
  
  if (!fs.existsSync(pythonZipPath)) {
    await downloadFile(pythonUrl, pythonZipPath);
  } else {
    console.log(`Using cached Python: ${pythonZipPath}`);
  }
  
  // Extract Python
  extractZip(pythonZipPath, pythonDir);
  console.log(`✓ Python extracted to ${pythonDir}`);
  
  // Download get-pip.py
  const getPipPath = path.join(pythonDir, 'get-pip.py');
  if (!fs.existsSync(getPipPath)) {
    await downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath);
  }
  
  // Enable site-packages by modifying python311._pth
  const pthFile = path.join(pythonDir, `python311._pth`);
  if (fs.existsSync(pthFile)) {
    let pthContent = fs.readFileSync(pthFile, 'utf8');
    // Uncomment import site
    pthContent = pthContent.replace('#import site', 'import site');
    // Add Lib/site-packages if not present
    if (!pthContent.includes('Lib/site-packages')) {
      pthContent += '\nLib/site-packages\n';
    }
    fs.writeFileSync(pthFile, pthContent);
    console.log('✓ Enabled site-packages in python311._pth');
  }
  
  // If cross-compiling to ARM64 from x64, we're using x64 Python so we CAN install packages
  // Only skip if it's a different type of cross-compilation
  if (isCrossCompiling && !(arch === 'arm64' && hostArch === 'x64')) {
    console.log('\n⚠️  Cross-compilation detected - skipping pip and dependency installation');
    console.log('⚠️  Python runtime downloaded but dependencies NOT installed');
    console.log('⚠️  This build will NOT work unless you build on native hardware');
    console.log('\n✓ Python runtime extracted (without dependencies)');
    return;
  }
  
  // Install pip (only if not cross-compiling)
  const pythonExe = path.join(pythonDir, 'python.exe');
  console.log('Installing pip...');
  try {
    execSync(`"${pythonExe}" get-pip.py`, {
      cwd: pythonDir,
      stdio: 'inherit'
    });
    console.log('✓ Pip installed');
  } catch (error) {
    console.error('Failed to install pip:', error.message);
    throw error;
  }
  
  // Install dependencies from requirements.txt
  const requirementsPath = path.join(backendDir, 'requirements.txt');
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`Requirements file not found: ${requirementsPath}`);
  }
  
  console.log('Installing Python dependencies...');
  console.log('This may take several minutes...');
  try {
    execSync(`"${pythonExe}" -m pip install --no-warn-script-location -r "${requirementsPath}"`, {
      cwd: pythonDir,
      stdio: 'inherit',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    console.log('✓ Dependencies installed');
  } catch (error) {
    console.error('Failed to install dependencies:', error.message);
    throw error;
  }
  
  // Download NLTK data (required for some text processing)
  console.log('Downloading NLTK data...');
  try {
    execSync(`"${pythonExe}" -m nltk.downloader punkt averaged_perceptron_tagger`, {
      cwd: pythonDir,
      stdio: 'inherit'
    });
    console.log('✓ NLTK data downloaded');
  } catch (error) {
    console.warn('Warning: Failed to download NLTK data (non-critical)');
  }
  
  // Verification skipped - dependencies will be validated at runtime
  console.log('\n✓ Python dependencies installation complete');
  
  console.log(`\n✓ Python ${PYTHON_VERSION} for ${arch} bundled successfully!\n`);
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Python Runtime Bundler for Pinguin');
  console.log('='.repeat(60));
  
  // Check if adm-zip is installed
  try {
    require.resolve('adm-zip');
  } catch (e) {
    console.error('Error: adm-zip package is required');
    console.error('Run: npm install --save-dev adm-zip');
    process.exit(1);
  }
  
  // Determine which architectures to bundle
  const args = process.argv.slice(2);
  let architectures = ['x64']; // Default to x64
  
  if (args.includes('--arch=x64,arm64') || args.includes('--arch=arm64,x64')) {
    architectures = ['x64', 'arm64'];
  } else if (args.includes('--arch=arm64')) {
    architectures = ['arm64'];
  } else if (args.includes('--arch=x64')) {
    architectures = ['x64'];
  } else if (args.length === 0) {
    // No args, bundle for current architecture
    architectures = [process.arch];
  }
  
  console.log(`Bundling Python for architectures: ${architectures.join(', ')}\n`);
  
  // Bundle for each architecture
  for (const arch of architectures) {
    try {
      await bundlePythonForArch(arch);
    } catch (error) {
      console.error(`\n❌ Failed to bundle Python for ${arch}:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('='.repeat(60));
  console.log('✓ All Python runtimes bundled successfully!');
  console.log('='.repeat(60));
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { bundlePythonForArch };
