// Loại file âm thanh khỏi assets Android để APK nhẹ.
// BGM manga giờ stream từ backend mặc định, ai cần thì tải offline trong app
// (xem src/services/mangaBgmDownloadService.ts) nên không cần nhúng mp3 vào APK.
// Web không ảnh hưởng: dist/sounds vẫn được deploy bình thường.
const fs = require("fs");
const path = require("path");

const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"]);

function main() {
  const rootDir = path.resolve(__dirname, "..");
  const soundsDir = path.join(rootDir, "android", "app", "src", "main", "assets", "public", "sounds");
  if (!fs.existsSync(soundsDir)) {
    console.log("[slim-audio] sounds dir not found, skip:", soundsDir);
    return;
  }
  let freed = 0;
  let removed = 0;
  for (const name of fs.readdirSync(soundsDir)) {
    const full = path.join(soundsDir, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (!AUDIO_EXTS.has(path.extname(name).toLowerCase())) continue;
    freed += stat.size;
    fs.unlinkSync(full);
    removed++;
    console.log(`[slim-audio] removed ${name} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  }
  console.log(`[slim-audio] done: removed ${removed} file(s), saved ~${(freed / 1024 / 1024).toFixed(1)} MB`);
}

main();
