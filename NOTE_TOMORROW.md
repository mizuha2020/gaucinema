# Note mai làm tiếp (09/10/2026)

## Đã xong, đã commit sạch (91d220f)
- Prompt 7 code: `GET /api/app/version` (public, env, đã curl-test OK),
  client check version native (`appUpdateService` + `AppUpdateGate`: bắt buộc /
  tùy chọn / mất mạng), `capacitor.config` đọc `CAPACITOR_SERVER_URL`,
  `README.md`, `.env.example`.
- Trước đó: 1 máy 1 tab (claim `tab-limit` + bầu chọn Duplicate),
  gỡ playback lock (-291 dòng), logout xóa cả slot.

## Blocker duy nhất: URL backend production
- User từ chối domain AI Studio (`quocthubay-movie.ai.studio`) — app cá nhân,
  backend riêng. `CLOUD_BACKEND_URL` trong `apiConfig.ts` vẫn hardcode domain
  đó -> mai phải đổi.
- Cần user cho URL https backend production, rồi đấu nối 1 lần:
  `VITE_API_URL` + `CAPACITOR_SERVER_URL` + default `CLOUD_BACKEND_URL`.
- Nếu chưa có server production: để config dev an toàn, Prompt 7 chờ test sau.

## Mai làm (theo thứ tự)
1. Lấy URL backend -> wire 3 chỗ trên.
2. Test Prompt 7 trên máy Android thật (offline screen, modal bản mới,
   chặn bắt buộc, plugin app/filesystem).
3. Nghiệm thu Bước 13 còn dở: xem trọn 1 tập, đọc 1 chương, phòng Watch
   Together PIN, admin tạo acc, chặn acc 51 / p3 / thiết bị 3, hạn 1-12 tháng,
   hết hạn -> gia hạn.
4. Commit.
