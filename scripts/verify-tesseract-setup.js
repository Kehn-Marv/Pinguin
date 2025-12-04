/**
 * Verify Tesseract setup for all platforms
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TESSERACT_DIR = path.join(__dirname, '../extraResources/tesseract');

console.log('=== Tesseract Setup Verification ===\n');

const platforms = [
  { name: 'Windows x64', dir: 'win32-x64', binary: 'tesseract.exe' },
  { name: 'Windows ARM64', dir: 'win32-arm64', binary: 'tesseract.exe' },
  { name: 'macOS x64', dir: 'darwin-x64', binary: 'tesseract' },
  { name: 'macOS ARM64', dir: 'darwin-arm64', binary: 'tesseract' },
  { name: 'Linux x64', dir: 'linux-x64', binary: 'tesseract' },
  { name: 'Linux ARM64', dir: 'linux-arm64', binary: 'tesseract' }
];

let allReady = true;

platforms.forEach(platform => {
  console.log(`${platform.name}:`);
  
  const binaryPath = path.join(TESSERACT_DIR, platform.dir, platform.binary);
  const tessdataPath = path.join(TESSERACT_DIR, platform.dir, 'tessdata', 'eng.traineddata');
  
  // Check binary
  if (fs.existsSync(binaryPath)) {
    const stats = fs.statSync(binaryPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ Binary: ${platform.binary} (${sizeMB} MB)`);
    
    // Check permissions on Unix
    if (platform.dir !== 'win32') {
      const mode = stats.mode;
      const isExecutable = (mode & 0o111) !== 0;
      if (isExecutable) {
        console.log(`  ✓ Permissions: Executable`);
      } else {
        console.log(`  ✗ Permissions: Not executable (run: chmod +x ${binaryPath})`);
        allReady = false;
      }
    }
    
    // Try to get version (only on current platform and architecture)
    const currentPlatformArch = `${process.platform}-${process.arch}`;
    if (platform.dir === currentPlatformArch) {
      try {
        const version = execSync(`"${binaryPath}" --version`, { 
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        }).split('\n')[0];
        console.log(`  ✓ Version: ${version.trim()}`);
      } catch (err) {
        console.log(`  ⚠ Could not verify version (may need dependencies)`);
      }
    }
  } else {
    console.log(`  ✗ Binary: Missing`);
    console.log(`    Expected: ${binaryPath}`);
    allReady = false;
  }
  
  // Check tessdata
  if (fs.existsSync(tessdataPath)) {
    const stats = fs.statSync(tessdataPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ Tessdata: eng.traineddata (${sizeMB} MB)`);
  } else {
    console.log(`  ✗ Tessdata: Missing`);
    console.log(`    Expected: ${tessdataPath}`);
    allReady = false;
  }
  
  console.log('');
});

console.log('=== Summary ===\n');

if (allReady) {
  console.log('✓ All Tesseract binaries and data files are ready!');
  console.log('✓ The application can be packaged with OCR support.');
  process.exit(0);
} else {
  console.log('⚠ Some Tesseract components are missing.');
  console.log('');
  console.log('To complete setup:');
  console.log('  1. Run: npm run setup-tesseract');
  console.log('  2. Follow platform-specific instructions in extraResources/tesseract/*/README.md');
  console.log('  3. Run this script again to verify');
  console.log('');
  console.log('Note: Missing binaries for other platforms will not affect development on your current platform.');
  process.exit(1);
}
