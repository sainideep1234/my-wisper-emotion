const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const svgPath = path.join(rootDir, 'website', 'public', 'logo.svg');

async function main() {
  console.log('Generating assets from logo.svg...');

  // 1. Ensure output folders exist
  const frontendBuildDir = path.join(rootDir, 'frontend', 'build');
  fs.mkdirSync(frontendBuildDir, { recursive: true });

  const websiteAppDir = path.join(rootDir, 'website', 'app');
  fs.mkdirSync(websiteAppDir, { recursive: true });

  // 2. Generate a high-res PNG for general use
  const highResPng = path.join(frontendBuildDir, 'icon.png');
  await sharp(svgPath)
    .resize(1024, 1024)
    .png()
    .toFile(highResPng);
  console.log('Generated icon.png at 1024x1024');

  // 3. Generate favicon.ico / favicon.png for Next.js website
  const faviconIcoPath = path.join(websiteAppDir, 'favicon.ico');
  const faviconPngPath = path.join(websiteAppDir, 'favicon.png');
  
  // Save as 32x32 PNG first
  await sharp(svgPath)
    .resize(32, 32)
    .png()
    .toFile(faviconPngPath);
  
  // Copy to favicon.ico (browsers support PNG contents under .ico filename)
  fs.copyFileSync(faviconPngPath, faviconIcoPath);
  console.log('Generated favicon.png and favicon.ico at 32x32');
  
  // Also copy the icon.svg directly to website/app/icon.svg just to be certain
  fs.copyFileSync(svgPath, path.join(websiteAppDir, 'icon.svg'));
  console.log('Copied icon.svg to website/app/icon.svg');

  // 4. Create .icns file for macOS Electron app using native iconutil
  const iconsetDir = path.join(rootDir, 'icon.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const sizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 }
  ];

  console.log('Generating PNG sizes for iconset...');
  for (const s of sizes) {
    await sharp(svgPath)
      .resize(s.size, s.size)
      .png()
      .toFile(path.join(iconsetDir, s.name));
  }

  console.log('Compiling icon.icns via iconutil...');
  const icnsOutput = path.join(frontendBuildDir, 'icon.icns');
  
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsOutput}"`);
    console.log('Generated icon.icns successfully!');
  } catch (err) {
    console.error('Failed compiling .icns via iconutil. Fallback copying high-res PNG...', err.message);
  } finally {
    // Clean up temporary iconset directory
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }

  console.log('Asset generation complete.');
}

main().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
