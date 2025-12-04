/* eslint-disable @typescript-eslint/no-var-requires */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const TESSERACT_DIR = path.join(__dirname, '../extraResources/tesseract');

// Tesseract download sources
const DOWNLOADS = {
  // Windows x64: Pre-built installer from UB Mannheim
  'win32-x64': {
    binary: {
      url: 'https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.3.3.20231005.exe',
      filename: 'tesseract-installer.exe',
      extractedName: 'tesseract.exe'
    }
  },
  // Windows ARM64: Use x64 with emulation (no native ARM64 builds available)
  'win32-arm64': {
    binary: {
      url: 'https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.3.3.20231005.exe',
      filename: 'tesseract-installer.exe',
      extractedName: 'tesseract.exe',
      note: 'Using x64 binary - will run via emulation on ARM64 Windows'
    }
  },
  // macOS x64: Homebrew bottle
  'darwin-x64': {
    binary: {
      url: 'https://ghcr.io/v2/homebrew/core/tesseract/blobs/sha256:8c7d55e8a1e3e6c5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5',
      filename: 'tesseract',
      note: 'Will need to be compiled or extracted from Homebrew'
    }
  },
  // macOS ARM64: Homebrew bottle
  'darwin-arm64': {
    binary: {
      url: 'https://ghcr.io/v2/homebrew/core/tesseract/blobs/sha256:8c7d55e8a1e3e6c5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5',
      filename: 'tesseract',
      note: 'Will need to be compiled or extracted from Homebrew'
    }
  },
  // Linux x64: Will use system package or compile
  'linux-x64': {
    binary: {
      url: 'https://github.com/tesseract-ocr/tesseract/archive/refs/tags/5.3.3.tar.gz',
      filename: 'tesseract-5.3.3.tar.gz',
      note: 'Source code - needs compilation'
    }
  },
  // Linux ARM64: Will use system package or compile
  'linux-arm64': {
    binary: {
      url: 'https://github.com/tesseract-ocr/tesseract/archive/refs/tags/5.3.3.tar.gz',
      filename: 'tesseract-5.3.3.tar.gz',
      note: 'Source code - needs compilation'
    }
  },
  // English language data (same for all platforms)
  tessdata: {
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
    filename: 'eng.traineddata',
    sha256: null // Optional checksum verification
  }
};

/**
 * Download a file from URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    console.log(`To: ${destPath}`);

    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${path.basename(destPath)}`);
        resolve(destPath);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Verify file checksum
 */
function verifyChecksum(filePath, expectedSha256) {
  if (!expectedSha256) return true;

  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('hex');

  return hex === expectedSha256;
}

/**
 * Set execute permissions on Unix systems
 */
function setExecutePermissions(filePath) {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(filePath, 0o755);
      console.log(`Set execute permissions: ${filePath}`);
    } catch (err) {
      console.error(`Failed to set permissions: ${err.message}`);
    }
  }
}

/**
 * Download tessdata for all platforms
 */
async function downloadTessdata() {
  console.log('\n=== Downloading Tessdata ===');
  
  const tessdataUrl = DOWNLOADS.tessdata.url;
  const platforms = [
    'win32-x64',
    'win32-arm64',
    'darwin-x64',
    'darwin-arm64',
    'linux-x64',
    'linux-arm64'
  ];

  for (const platform of platforms) {
    const tessdataDir = path.join(TESSERACT_DIR, platform, 'tessdata');
    const destPath = path.join(tessdataDir, DOWNLOADS.tessdata.filename);

    if (fs.existsSync(destPath)) {
      console.log(`Tessdata already exists for ${platform}: ${destPath}`);
      continue;
    }

    try {
      await downloadFile(tessdataUrl, destPath);
      
      if (DOWNLOADS.tessdata.sha256) {
        if (!verifyChecksum(destPath, DOWNLOADS.tessdata.sha256)) {
          throw new Error('Checksum verification failed');
        }
      }
    } catch (err) {
      console.error(`Failed to download tessdata for ${platform}: ${err.message}`);
      throw err;
    }
  }
}

/**
 * Download Windows Tesseract binary
 */
async function downloadWindowsBinary() {
  console.log('\n=== Downloading Windows Tesseract ===');
  
  const architectures = ['x64', 'arm64'];
  
  for (const arch of architectures) {
    const binaryPath = path.join(TESSERACT_DIR, `win32-${arch}`, 'tesseract.exe');
    
    if (fs.existsSync(binaryPath)) {
      console.log(`Windows ${arch} binary already exists: ${binaryPath}`);
      continue;
    }

    console.log(`\nWindows ${arch.toUpperCase()}:`);
    console.log('NOTE: Windows Tesseract requires manual extraction from installer.');
    console.log('Please follow these steps:');
    console.log('1. Download: https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.3.3.20231005.exe');
    console.log('2. Install or extract tesseract.exe');
    console.log(`3. Copy tesseract.exe to: ${binaryPath}`);
    
    if (arch === 'arm64') {
      console.log('   NOTE: x64 binary will run via emulation on ARM64 Windows');
    }
    
    console.log('4. The tessdata folder will be downloaded automatically');
  }
}

/**
 * Download macOS Tesseract binary
 */
async function downloadMacOSBinary() {
  console.log('\n=== Downloading macOS Tesseract ===');
  
  // Detect current architecture if on macOS
  let currentArch = null;
  if (process.platform === 'darwin') {
    currentArch = process.arch; // 'x64' or 'arm64'
  }
  
  const architectures = ['x64', 'arm64'];
  
  for (const arch of architectures) {
    const binaryPath = path.join(TESSERACT_DIR, `darwin-${arch}`, 'tesseract');
    
    if (fs.existsSync(binaryPath)) {
      console.log(`macOS ${arch} binary already exists: ${binaryPath}`);
      continue;
    }

    console.log(`\nmacOS ${arch.toUpperCase()}:`);
    console.log('NOTE: macOS Tesseract requires Homebrew or manual compilation.');
    console.log('Please follow these steps:');
    console.log('1. Install Homebrew if not already installed');
    console.log('2. Run: brew install tesseract');
    console.log('3. Find the binary: which tesseract');
    console.log(`4. Copy the binary to: ${binaryPath}`);
    console.log('5. The tessdata folder will be downloaded automatically');
    
    // Alternative: Try to copy from system if on matching architecture
    if (process.platform === 'darwin' && currentArch === arch) {
      try {
        const systemTesseract = execSync('which tesseract', { encoding: 'utf8' }).trim();
        if (systemTesseract && fs.existsSync(systemTesseract)) {
          console.log(`\nFound system Tesseract: ${systemTesseract}`);
          console.log('Copying to extraResources...');
          fs.copyFileSync(systemTesseract, binaryPath);
          setExecutePermissions(binaryPath);
          console.log(`macOS ${arch} binary copied successfully!`);
        }
      } catch (err) {
        console.log('System Tesseract not found. Manual installation required.');
      }
    }
  }
}

/**
 * Download Linux Tesseract binary
 */
async function downloadLinuxBinary() {
  console.log('\n=== Downloading Linux Tesseract ===');
  
  // Detect current architecture if on Linux
  let currentArch = null;
  if (process.platform === 'linux') {
    currentArch = process.arch; // 'x64' or 'arm64'
  }
  
  const architectures = ['x64', 'arm64'];
  
  for (const arch of architectures) {
    const binaryPath = path.join(TESSERACT_DIR, `linux-${arch}`, 'tesseract');
    
    if (fs.existsSync(binaryPath)) {
      console.log(`Linux ${arch} binary already exists: ${binaryPath}`);
      continue;
    }

    console.log(`\nLinux ${arch.toUpperCase()}:`);
    console.log('NOTE: Linux Tesseract requires system package or manual compilation.');
    console.log('Please follow these steps:');
    console.log('1. Install via package manager:');
    console.log('   - Ubuntu/Debian: sudo apt-get install tesseract-ocr');
    console.log('   - Fedora: sudo dnf install tesseract');
    console.log('   - Arch: sudo pacman -S tesseract');
    console.log('2. Find the binary: which tesseract');
    console.log(`3. Copy the binary to: ${binaryPath}`);
    console.log('4. The tessdata folder will be downloaded automatically');
    
    // Alternative: Try to copy from system if on matching architecture
    if (process.platform === 'linux' && currentArch === arch) {
      try {
        const systemTesseract = execSync('which tesseract', { encoding: 'utf8' }).trim();
        if (systemTesseract && fs.existsSync(systemTesseract)) {
          console.log(`\nFound system Tesseract: ${systemTesseract}`);
          console.log('Copying to extraResources...');
          fs.copyFileSync(systemTesseract, binaryPath);
          setExecutePermissions(binaryPath);
          console.log(`Linux ${arch} binary copied successfully!`);
        }
      } catch (err) {
        console.log('System Tesseract not found. Manual installation required.');
      }
    }
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Tesseract Binary Download Script ===\n');
  console.log(`Current platform: ${process.platform}-${process.arch}\n`);
  
  // Ensure directories exist for all platform-architecture combinations
  const platforms = [
    'win32-x64',
    'win32-arm64',
    'darwin-x64',
    'darwin-arm64',
    'linux-x64',
    'linux-arm64'
  ];
  
  platforms.forEach(platform => {
    const platformDir = path.join(TESSERACT_DIR, platform);
    const tessdataDir = path.join(platformDir, 'tessdata');
    
    if (!fs.existsSync(platformDir)) {
      fs.mkdirSync(platformDir, { recursive: true });
    }
    if (!fs.existsSync(tessdataDir)) {
      fs.mkdirSync(tessdataDir, { recursive: true });
    }
  });

  try {
    // Download tessdata for all platforms
    await downloadTessdata();
    
    // Download platform-specific binaries
    await downloadWindowsBinary();
    await downloadMacOSBinary();
    await downloadLinuxBinary();
    
    console.log('\n=== Download Complete ===');
    console.log('Note: Some binaries may require manual installation.');
    console.log('Check the instructions above for platform-specific steps.');
    
  } catch (err) {
    console.error('\n=== Download Failed ===');
    console.error(err.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { downloadFile, downloadTessdata, setExecutePermissions };
