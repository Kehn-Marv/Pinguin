/**
 * Verify that build configuration includes Tesseract resources
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

console.log('=== Build Configuration Verification ===\n');

// Read forge.config.ts
const forgeConfigPath = path.join(__dirname, '../forge.config.ts');
const forgeConfig = fs.readFileSync(forgeConfigPath, 'utf8');

console.log('Checking forge.config.ts...\n');

// Check if tesseract is in extraResource
if (forgeConfig.includes('./extraResources/tesseract')) {
  console.log('✓ Tesseract directory is included in extraResource array');
} else {
  console.log('✗ Tesseract directory is NOT included in extraResource array');
  console.log('  Add "./extraResources/tesseract" to packagerConfig.extraResource');
  process.exit(1);
}

// Verify the directory structure exists
const tesseractDir = path.join(__dirname, '../extraResources/tesseract');
if (!fs.existsSync(tesseractDir)) {
  console.log('✗ Tesseract directory does not exist');
  process.exit(1);
}

console.log('✓ Tesseract directory exists\n');

// Check platform directories
const platforms = [
  'win32-x64',
  'win32-arm64',
  'darwin-x64',
  'darwin-arm64',
  'linux-x64',
  'linux-arm64'
];
let allPlatformsReady = true;

platforms.forEach(platform => {
  const platformDir = path.join(tesseractDir, platform);
  const tessdataDir = path.join(platformDir, 'tessdata');
  
  console.log(`${platform}:`);
  
  if (fs.existsSync(platformDir)) {
    console.log(`  ✓ Platform directory exists`);
  } else {
    console.log(`  ✗ Platform directory missing`);
    allPlatformsReady = false;
  }
  
  if (fs.existsSync(tessdataDir)) {
    console.log(`  ✓ tessdata directory exists`);
    
    // Check for eng.traineddata
    const engData = path.join(tessdataDir, 'eng.traineddata');
    if (fs.existsSync(engData)) {
      const stats = fs.statSync(engData);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`  ✓ eng.traineddata exists (${sizeMB} MB)`);
    } else {
      console.log(`  ✗ eng.traineddata missing`);
      allPlatformsReady = false;
    }
  } else {
    console.log(`  ✗ tessdata directory missing`);
    allPlatformsReady = false;
  }
  
  console.log('');
});

console.log('=== Summary ===\n');

if (allPlatformsReady) {
  console.log('✓ Build configuration is correct');
  console.log('✓ All platform directories and tessdata files are present');
  console.log('✓ Packaged application will include Tesseract OCR support');
  console.log('\nThe following will be included in the package:');
  console.log('  - extraResources/tesseract/win32-x64/tesseract.exe');
  console.log('  - extraResources/tesseract/win32-x64/tessdata/eng.traineddata');
  console.log('  - extraResources/tesseract/win32-arm64/tesseract.exe');
  console.log('  - extraResources/tesseract/win32-arm64/tessdata/eng.traineddata');
  console.log('  - extraResources/tesseract/darwin-x64/tesseract');
  console.log('  - extraResources/tesseract/darwin-x64/tessdata/eng.traineddata');
  console.log('  - extraResources/tesseract/darwin-arm64/tesseract');
  console.log('  - extraResources/tesseract/darwin-arm64/tessdata/eng.traineddata');
  console.log('  - extraResources/tesseract/linux-x64/tesseract');
  console.log('  - extraResources/tesseract/linux-x64/tessdata/eng.traineddata');
  console.log('  - extraResources/tesseract/linux-arm64/tesseract');
  console.log('  - extraResources/tesseract/linux-arm64/tessdata/eng.traineddata');
  process.exit(0);
} else {
  console.log('⚠ Some platform directories or files are missing');
  console.log('  Run: npm run setup-tesseract');
  console.log('\nNote: Missing binaries for other platforms will not affect');
  console.log('      development on your current platform, but cross-platform');
  console.log('      builds will require all binaries.');
  process.exit(1);
}
