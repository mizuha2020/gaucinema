# Gấu Cinema HD

App xem phim gia đình: 1 tài khoản dùng tối đa 2 thiết bị, mỗi máy 1 tab
(Prompt 4 + tab-limit). Chi tiết quy trình dựng hệ thống xem `runbook.md`.

## Quy trình deploy (Prompt 7 — quan trọng)

APK Capacitor có HAI tầng tách rời:

- **Tầng web** (HTML/CSS/JS): ~95% số lần sửa code. Nếu `CAPACITOR_SERVER_URL`
  đã set lúc `npx cap sync`, APK tải tầng này từ server mỗi lần mở —
  **sửa web chỉ cần deploy server, KHÔNG cài lại APK**.
- **Tầng native** (plugin, quyền, cấu hình): rất ít khi đổi. Chỉ build APK
  mới khi đổi plugin, đổi quyền, hoặc đổi cấu hình native.

Lưu ý khi bật `CAPACITOR_SERVER_URL`:

- `localStorage` thuộc origin của URL remote, không còn là `https://localhost`
  — dữ liệu local cũ trên máy người dùng mất sau khi đổi (chấp nhận được ở bản mới).
- Plugin `@capacitor/app` (lấy version) và `@capacitor/filesystem`
  (phim đã lưu offline) chạy qua native bridge nên không ảnh hưởng bởi `server.url`.
- Server sập lúc mở app = màn hình “Không kết nối được máy chủ” + nút Thử lại.

## Phát hành APK mới

1. Build APK, gắn file vào **GitHub Releases** (miễn phí, không tốn băng thông
   server — TUYỆT ĐỐI không để file APK trong `public/`).
2. Nâng `APP_LATEST_VERSION_CODE` (+ tên + ghi chú, xem `.env.example`) rồi
   restart backend. Bản native cũ hơn sẽ thấy modal “Có bản mới”.
3. Chỉ khi đổi phá vỡ tương thích mới nâng `APP_MIN_SUPPORTED_VERSION_CODE`
   (bản cũ hơn bị chặn toàn trang, bắt buộc cập nhật).

Phiên bản hiện tại của APK nằm ở `android/app/build.gradle`
(`versionCode` / `versionName`).
