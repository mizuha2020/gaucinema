const fs = require('fs');
const path = require('path');

async function run() {
  console.log('=== RUNNING ASSET GENERATION & ANDROID RES FIXER ===');
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('Sharp not available:', e.message);
    process.exit(0);
  }

  const rootDir = path.resolve(__dirname, '..');
  const resourcesDir = path.join(rootDir, 'assets', 'resources');
  const publicDir = path.join(rootDir, 'public');

  if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true });
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  // Priority sources for the Gấu Cinema Logo
  const candidatePaths = [
    path.join(rootDir, 'src', 'assets', 'images', 'app_logo.jpg'),
    path.join(rootDir, 'src', 'assets', 'images', 'gau_cinema_icon_square_1787156637840.jpg'),
    path.join(rootDir, 'src', 'assets', 'images', 'gau_cinema_icon_1787155456099.jpg'),
    path.join(publicDir, 'app_logo.jpg'),
    path.join(resourcesDir, 'icon.png')
  ];

  let rawSourceBuf = null;
  for (const cPath of candidatePaths) {
    if (fs.existsSync(cPath)) {
      try {
        const buf = fs.readFileSync(cPath);
        const meta = await sharp(buf).metadata();
        if (meta && meta.width > 50) {
          console.log(`✓ Loaded high-res source image from: ${cPath} (${meta.width}x${meta.height}, format: ${meta.format})`);
          rawSourceBuf = buf;
          break;
        }
      } catch (e) {
        console.warn(`Could not read ${cPath}:`, e.message);
      }
    }
  }

  if (!rawSourceBuf) {
    console.log('Generating fallback SVG logo...');
    const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="#0b1329"/>
      <circle cx="512" cy="512" r="380" fill="#1e3a8a"/>
      <circle cx="512" cy="512" r="300" fill="#3b82f6"/>
      <text x="512" y="580" font-family="Arial, sans-serif" font-size="260" font-weight="bold" fill="#ffffff" text-anchor="middle">GẤU</text>
    </svg>`;
    rawSourceBuf = Buffer.from(svg);
  }

  // 1. Generate master PNGs in assets/resources
  const masterIcon1024 = await sharp(rawSourceBuf)
    .resize(1024, 1024, { fit: 'cover' })
    .png({ quality: 100 })
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'icon.png'), masterIcon1024);
  fs.writeFileSync(path.join(resourcesDir, 'icon-only.png'), masterIcon1024);

  // Foreground for adaptive icons (logo scaled to 680x680 centered in 1024x1024 transparent canvas)
  const foregroundInner = await sharp(rawSourceBuf)
    .resize(680, 680, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const masterForeground1024 = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: foregroundInner, gravity: 'center' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'icon-foreground.png'), masterForeground1024);

  // Background: Solid dark blue (#0b1329)
  const masterBackground1024 = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 11, g: 19, b: 41, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'icon-background.png'), masterBackground1024);

  // Splash master: 2732x2732
  const splashLogo = await sharp(rawSourceBuf)
    .resize(1100, 1100, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const masterSplash2732 = await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 7, g: 11, b: 22, alpha: 1 }
    }
  })
    .composite([{ input: splashLogo, gravity: 'center' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(resourcesDir, 'splash.png'), masterSplash2732);

  // 2. Synchronize public directory with clean standard PNGs & JPEGs
  const publicJpg = await sharp(rawSourceBuf).resize(1024, 1024, { fit: 'cover' }).jpeg({ quality: 95 }).toBuffer();
  fs.writeFileSync(path.join(publicDir, 'app_logo.jpg'), publicJpg);
  fs.writeFileSync(path.join(publicDir, 'icon.jpg'), publicJpg);
  fs.writeFileSync(path.join(publicDir, 'icon.png'), masterIcon1024);

  const icon192 = await sharp(rawSourceBuf).resize(192, 192, { fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);

  const icon512 = await sharp(rawSourceBuf).resize(512, 512, { fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);

  const icon180 = await sharp(rawSourceBuf).resize(180, 180, { fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-180.png'), icon180);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), icon180);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon-precomposed.png'), icon180);

  const icon167 = await sharp(rawSourceBuf).resize(167, 167, { fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-167.png'), icon167);

  const icon152 = await sharp(rawSourceBuf).resize(152, 152, { fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-152.png'), icon152);

  const icon32 = await sharp(rawSourceBuf).resize(32, 32, { fit: 'cover' }).png().toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-32.png'), icon32);

  console.log('✓ Master assets and public icons updated successfully.');

  // 3. Inject directly into Android Project (Res directory)
  const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(androidResDir)) {
    console.log('Injecting Android mipmaps and adaptive icons into:', androidResDir);

    // Standard mipmap icon sizes (Legacy)
    const legacySizes = {
      'mipmap-mdpi': 48,
      'mipmap-hdpi': 72,
      'mipmap-xhdpi': 96,
      'mipmap-xxhdpi': 144,
      'mipmap-xxxhdpi': 192
    };

    // Adaptive icon foreground sizes (Android API 26+)
    const adaptiveForegroundSizes = {
      'mipmap-mdpi': 108,
      'mipmap-hdpi': 162,
      'mipmap-xhdpi': 216,
      'mipmap-xxhdpi': 324,
      'mipmap-xxxhdpi': 432
    };

    // Generate circular mask for ic_launcher_round
    for (const [folder, size] of Object.entries(legacySizes)) {
      const folderPath = path.join(androidResDir, folder);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      // Standard square legacy icon
      const squareIcon = await sharp(masterIcon1024).resize(size, size).png().toBuffer();
      fs.writeFileSync(path.join(folderPath, 'ic_launcher.png'), squareIcon);

      // Round legacy icon (circle mask)
      const radius = size / 2;
      const circleSvg = `<svg width="${size}" height="${size}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="#ffffff"/></svg>`;
      const roundIcon = await sharp(masterIcon1024)
        .resize(size, size)
        .composite([{ input: Buffer.from(circleSvg), blend: 'dest-in' }])
        .png()
        .toBuffer();
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_round.png'), roundIcon);

      // Adaptive background
      const bgSize = adaptiveForegroundSizes[folder];
      const adaptiveBg = await sharp(masterBackground1024).resize(bgSize, bgSize).png().toBuffer();
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_background.png'), adaptiveBg);

      // Adaptive foreground (with transparent safe-zone padding)
      const adaptiveFg = await sharp(masterForeground1024).resize(bgSize, bgSize).png().toBuffer();
      fs.writeFileSync(path.join(folderPath, 'ic_launcher_foreground.png'), adaptiveFg);
    }

    // Adaptive XMLs in mipmap-anydpi-v26
    const anyDpiDir = path.join(androidResDir, 'mipmap-anydpi-v26');
    if (!fs.existsSync(anyDpiDir)) fs.mkdirSync(anyDpiDir, { recursive: true });

    const icLauncherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

    fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher.xml'), icLauncherXml);
    fs.writeFileSync(path.join(anyDpiDir, 'ic_launcher_round.xml'), icLauncherXml);

    // Color definitions
    const valuesDir = path.join(androidResDir, 'values');
    if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true });
    fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0b1329</color>
</resources>`);

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

      const dSplash = await sharp(masterSplash2732).resize(w, h, { fit: 'cover' }).png().toBuffer();
      fs.writeFileSync(path.join(dPath, 'splash.png'), dSplash);
    }

    console.log('✓ Successfully wrote all Android mipmap icons and splash drawables directly into android/res!');

    // 4. Ensure AndroidManifest.xml and MainActivity.java have optimal streaming settings
    const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    if (fs.existsSync(manifestPath)) {
      let manifest = fs.readFileSync(manifestPath, 'utf8');
      if (!manifest.includes('android:usesCleartextTraffic="true"')) {
        manifest = manifest.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
      }
      if (!manifest.includes('android:hardwareAccelerated="true"')) {
        manifest = manifest.replace('<application', '<application\n        android:hardwareAccelerated="true"');
      }
      const permissionsToAdd = [
        '<uses-permission android:name="android.permission.INTERNET" />',
        '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
        '<uses-permission android:name="android.permission.WAKE_LOCK" />',
        '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />'
      ];
      for (const perm of permissionsToAdd) {
        if (!manifest.includes(perm)) {
          manifest = manifest.replace('</manifest>', `    ${perm}\n</manifest>`);
        }
      }
      fs.writeFileSync(manifestPath, manifest);
      console.log('✓ AndroidManifest.xml verified & updated with stream permissions');
    }

    const mainActivityPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'qtbcinema', 'app', 'MainActivity.java');
    if (fs.existsSync(mainActivityPath)) {
      const mainActivityContent = `package com.qtbcinema.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings settings = this.bridge.getWebView().getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
        }
    }
}
`;
      fs.writeFileSync(mainActivityPath, mainActivityContent);
      console.log('✓ MainActivity.java verified & updated with optimal webview media settings');
    }
  }

  console.log('=== ASSET GENERATION FINISHED ===');
}

run().catch(err => {
  console.error('Fatal in prepare-assets:', err);
  process.exit(1);
});
