const fs = require('fs');
const path = require('path');

async function run() {
  console.log('--- STARTING ASSET PREPARATION ---');
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('Sharp not found:', e.message);
    process.exit(0);
  }

  const rootDir = path.resolve(__dirname, '..');
  const resourcesDir = path.join(rootDir, 'assets', 'resources');
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  // Find best available source logo
  const possibleSources = [
    path.join(rootDir, 'public', 'app_logo.jpg'),
    path.join(rootDir, 'src', 'assets', 'images', 'app_logo.jpg'),
    path.join(rootDir, 'public', 'icon.png'),
    path.join(rootDir, 'public', 'icon.jpg'),
    path.join(resourcesDir, 'icon.png'),
  ];

  let sourceBuffer = null;
  for (const src of possibleSources) {
    if (fs.existsSync(src)) {
      try {
        const buf = fs.readFileSync(src);
        const meta = await sharp(buf).metadata();
        if (meta && meta.width) {
          console.log(`Found valid source image at: ${src} (${meta.width}x${meta.height}, format: ${meta.format})`);
          sourceBuffer = buf;
          break;
        }
      } catch (err) {
        console.warn(`Failed reading candidate ${src}:`, err.message);
      }
    }
  }

  if (!sourceBuffer) {
    console.log('Generating fallback SVG logo...');
    const svg = `
      <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <rect width="1024" height="1024" fill="#0b1329"/>
        <circle cx="512" cy="512" r="380" fill="#1e3a8a"/>
        <circle cx="512" cy="512" r="300" fill="#3b82f6"/>
        <text x="512" y="580" font-family="Arial, sans-serif" font-size="280" font-weight="bold" fill="#ffffff" text-anchor="middle">GẤU</text>
      </svg>
    `;
    sourceBuffer = Buffer.from(svg);
  }

  // 1. Generate 1024x1024 icon.png (Square, Solid background #0b1329)
  const iconBuffer = await sharp(sourceBuffer)
    .resize(1024, 1024, { fit: 'cover' })
    .png({ quality: 100 })
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'icon.png'), iconBuffer);
  fs.writeFileSync(path.join(resourcesDir, 'icon-only.png'), iconBuffer);

  // Foreground: logo resized inside with padding
  const iconInner = await sharp(sourceBuffer)
    .resize(800, 800, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const foregroundBuffer = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: iconInner, gravity: 'center' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'icon-foreground.png'), foregroundBuffer);

  // Background: Solid midnight blue
  const backgroundBuffer = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 11, g: 19, b: 41, alpha: 1 } // #0b1329
    }
  })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'icon-background.png'), backgroundBuffer);

  // Splash: 2732x2732 with centered logo
  const splashLogo = await sharp(sourceBuffer)
    .resize(1200, 1200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const splashBuffer = await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 7, g: 11, b: 22, alpha: 1 } // #070b16
    }
  })
    .composite([{ input: splashLogo, gravity: 'center' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'splash.png'), splashBuffer);

  console.log('✓ Successfully generated all standard master assets in assets/resources/');

  // 2. Direct generation into android res folders if android project exists
  const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(androidResDir)) {
    console.log('Found Android res directory. Injecting Android icons & splash drawables directly...');

    const mipmapSizes = {
      'mipmap-mdpi': 48,
      'mipmap-hdpi': 72,
      'mipmap-xhdpi': 96,
      'mipmap-xxhdpi': 144,
      'mipmap-xxxhdpi': 192
    };

    for (const [folder, size] of Object.entries(mipmapSizes)) {
      const folderPath = path.join(androidResDir, folder);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      const resizedSquare = await sharp(iconBuffer).resize(size, size).png().toBuffer();
      fs.writeFileSync(path.join(folderPath, 'ic_launcher.png'), resizedSquare);
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_round.png'), resizedSquare);
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_foreground.png'), resizedSquare);
    }

    // Adaptive icon XML for mipmap-anydpi-v26
    const anyDpiDir = path.join(androidResDir, 'mipmap-anydpi-v26');
    if (!fs.existsSync(anyDpiDir)) fs.mkdirSync(anyDpiDir, { recursive: true });

    const icLauncherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

    fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher.xml'), icLauncherXml);
    fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher_round.xml'), icLauncherXml);

    // Color value for background
    const valuesDir = path.join(androidResDir, 'values');
    if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true });
    const icColorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0b1329</color>
</resources>`;
    fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'), icColorsXml);

    // Splash drawables
    const drawableSizes = {
      'drawable': [480, 800],
      'drawable-land-mdpi': [800, 480],
      'drawable-land-hdpi': [1280, 720],
      'drawable-land-xhdpi': [1920, 1080],
      'drawable-land-xxhdpi': [2560, 1440],
      'drawable-port-mdpi': [480, 800],
      'drawable-port-hdpi': [720, 1280],
      'drawable-port-xhdpi': [1080, 1920],
      'drawable-port-xxhdpi': [1440, 2560]
    };

    for (const [dFolder, [w, h]] of Object.entries(drawableSizes)) {
      const dPath = path.join(androidResDir, dFolder);
      if (!fs.existsSync(dPath)) fs.mkdirSync(dPath, { recursive: true });

      const dSplash = await sharp(splashBuffer).resize(w, h, { fit: 'cover' }).png().toBuffer();
      fs.writeFileSync(path.join(dPath, 'splash.png'), dSplash);
    }

    console.log('✓ Successfully wrote all Android mipmap icons and splash drawables directly into android/res!');
  }

  console.log('--- ASSET PREPARATION COMPLETED SUCCESSFULLY ---');
}

run().catch(err => {
  console.error('Error in prepare-assets:', err);
  process.exit(1);
});
