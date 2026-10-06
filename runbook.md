# RUNBOOK — DỰNG LẠI GẤU CINEMA TRÊN TÀI KHOẢN MỚI

Phạm vi app mới: Phim + Manga + Watch Together + TV Mode. KHÔNG có LiveTV.
Giới hạn: 50 tài khoản, mỗi tài khoản 2 hồ sơ và 2 thiết bị dùng cùng lúc.
Thời hạn: mỗi tài khoản có hạn sử dụng 1 đến 12 tháng, admin gia hạn được.
Chi phí mục tiêu: 0 đồng.
Thời gian: khoảng 4 giờ.

15 bước, chạy từ trên xuống dưới. LÀM TUẦN TỰ, KHÔNG GỘP BƯỚC.
Mỗi prompt đụng vào nhiều file cùng lúc. Gộp lại mà hỏng thì không truy được
hỏng ở đâu. Sau mỗi bước có mục XONG KHI, làm xong mới đi tiếp.

################################################################################

# PHẦN 0 — ĐỌC TRƯỚC KHI BẮT ĐẦU

################################################################################

== 0.1 CẦN CÓ SẴN ==

- Máy ở nhà, tải và giải nén file được (máy công ty thường chặn)
- Đăng nhập được CẢ HAI tài khoản Google: cũ và mới
- Khoảng 4 giờ. Không nên đứt quãng giữa bước 6 và bước 9
- Chỗ ghi an toàn cho mật khẩu admin mới

== 0.2 BA VẤN ĐỀ GỐC CỦA APP HIỆN TẠI ==
Cả ba cùng một nguyên nhân: KHÔNG CÓ DANH TÍNH NGƯỜI DÙNG NÀO MÀ FIREBASE
HIỂU ĐƯỢC. App tự quản lý tài khoản trong Firestore nên rules buộc phải mở.

Vấn đề Hệ quả Sửa ở bước

---

Firestore rules mở toàn bộ Ai cũng đọc/ghi/xóa database 6, 7
Session là JSON trong localStorage Sửa 1 dòng DevTools thành admin 6
36 endpoint không kiểm tra đăng nhập Backend mở cho cả internet 9

Thứ tự các bước được sắp để sửa nguyên nhân trước, triệu chứng sau.
Đảo thứ tự sẽ không chạy.

== 0.3 QUY TẮC CHI PHÍ BẰNG 0 ==

FIREBASE SPARK KHÔNG THỂ TÍNH TIỀN BẠN.
Spark không có cơ chế vượt hạn mức rồi tính phí. Không thẻ, không hóa đơn.
Vượt hạn mức thì Firestore trả lỗi resource-exhausted tới nửa đêm giờ Thái
Bình Dương rồi tự reset. Hậu quả xấu nhất là app hỏng tạm thời.
Mọi thứ liên quan Firestore, RTDB, Authentication trong runbook này đều
AN TOÀN TUYỆT ĐỐI về chi phí.

TUYỆT ĐỐI KHÔNG BẬT GÓI BLAZE.
Firebase Console sẽ nhiều lần gợi ý nâng cấp. Luôn từ chối. Những thứ sau bắt
buộc có Blaze, tức phải gắn thẻ tín dụng:

- Cloud Functions for Firebase (runbook này không dùng)
- Scheduled Firestore export/backup (thay bằng script tay, xem 0.5)
- Identity Platform, blocking functions
- Cloud Storage for Firebase
  Chỉ cần gắn thẻ MỘT LẦN là rủi ro hóa đơn tồn tại vĩnh viễn.

NGUY CƠ PHÍ DUY NHẤT LÀ CLOUD RUN.
Thành phần Có thể tính tiền không

---

Firebase Auth / Firestore / RTDB KHÔNG. Spark là hạn mức cứng.
TMDB, API phim, API truyện KHÔNG.
Cloud Run trên AI Studio KHÔNG, nếu project không gắn billing.
Cloud Run tự deploy CÓ. Băng thông Asia bị tính phí.

VIỆC LÀM ĐẦU TIÊN: vào Google Cloud Console -> Billing. Nếu project KHÔNG gắn
billing account nào thì bạn an toàn tuyệt đối. Nếu có gắn, vào Budgets &
alerts đặt ngân sách 0 đồng kèm cảnh báo, hoặc gỡ hẳn billing account ra.

== 0.4 SỨC CHỨA VÀ TRẦN HỆ THỐNG ==
Tính cho trường hợp xấu nhất: 50 tài khoản cùng online, mỗi tài khoản 2 thiết
bị = 100 thiết bị đồng thời.

Tài nguyên Hạn mức Spark Ước tính Tỷ lệ

---

Firestore reads 50.000/ngày ~16.000 32%
Firestore writes 20.000/ngày ~1.400 7%
RTDB download 10 GB/tháng ~1-2 GB ~15%
RTDB KẾT NỐI ĐỒNG THỜI 100 100+ TRẦN

Ba dòng đầu dư thoải mái. Dòng cuối là bức tường duy nhất, nằm đúng ở 50 x 2.
Không nới được mà không tốn tiền, nên bước 12 có phần xử lý lỗi cho tử tế khi
chạm trần.

Thực tế: 50 tài khoản cùng online nghĩa là TOÀN BỘ người dùng mở app cùng lúc.
Với nhóm kín 50 người quen, đỉnh thực tế thường là 20-40 thiết bị. Trần này
nhiều khả năng không bao giờ bị chạm.

THEO DÕI: Firebase Console -> Realtime Database -> Usage -> biểu đồ
Connections. Và Firestore -> Usage -> biểu đồ Reads/Writes.
Nếu writes thường xuyên vượt 10.000/ngày, kiểm tra lại bước 12 đã làm đúng chưa.

== 0.5 BACKUP MIỄN PHÍ ==
Scheduled export cần Blaze nên không dùng được. Thay bằng: viết một script
Node chạy TRÊN MÁY BẠN, dùng firebase-admin với service account đọc toàn bộ
Firestore ghi ra file JSON. Chạy tay mỗi tháng một lần. Với 50 tài khoản là
chưa tới 500 lượt đọc, hoàn toàn miễn phí.

== 0.6 BA THỨ KHÔNG BAO GIỜ ĐƯỢC LÀM ==
Kể cả khi bí, kể cả khi app đang hỏng:

1. Mở lại rules thành allow read, write: if true cho hết lỗi
2. Đưa FIREBASE_SERVICE_ACCOUNT_JSON vào source code
3. Bỏ qua xhrSetup rồi mở /api/proxy/m3u8 cho public để phim chạy
   Cả ba đều làm mất sạch công của toàn bộ runbook này.

################################################################################

# PHẦN A — CHUYỂN SOURCE SANG TÀI KHOẢN MỚI

################################################################################

================================================================================
BƯỚC 1 — TẢI SOURCE CODE TỪ TÀI KHOẢN CŨ
================================================================================
Làm trên AI Studio của mail cũ.

Không dùng chức năng Share. Share chỉ tạo một đường link, không đẩy app vào
danh sách project của tài khoản kia.

THỬ THEO THỨ TỰ:

1. Download / Export trực tiếp
   Menu ba chấm góc trên phải của project, hoặc trong panel code.
   Kết quả là một file .zip

2. Qua GitHub
   Push lên một repo PRIVATE từ tài khoản cũ, rồi import từ repo đó ở tài
   khoản mới. Cách này tiện hơn về lâu dài vì có luôn bản backup, và bước 14
   cũng cần GitHub để đặt file APK.

3. Copy tay (phương án cuối)
   Mở từng file trong panel code và copy ra máy. Khoảng 60 file.

XONG KHI:
[ ] Có server.ts ở thư mục gốc
[ ] Có package.json
[ ] Có src/ với App.tsx, appRouter.tsx, và các thư mục con
components/, services/, hooks/, utils/
[ ] Có firestore.rules, vite.config.ts, capacitor.config.ts

DỪNG LẠI NẾU thiếu server.ts hoặc thiếu src/services/. Bản tải chưa đủ.

================================================================================
BƯỚC 2 — XÓA FILE LIVETV KHỎI BẢN COPY
================================================================================
Làm trên máy, TRƯỚC khi upload.

Giải nén zip, xóa đúng 4 đường dẫn sau, rồi nén lại:

    src/components/livetv/
    src/apps/LiveTvAppWrapper.tsx
    src/components/LiveTvView.tsx
    src/utils/drmParser.ts

VÌ SAO XÓA Ở BƯỚC NÀY: xóa trước khi upload thì project mới CHƯA BAO GIỜ chứa
code phá DRM ClearKey. Upload rồi mới xóa thì nó vẫn nằm trong lịch sử.

KHÔNG ĐƯỢC ĐỤNG VÀO /api/proxy/m3u8 trong server.ts. Endpoint đó phục vụ phần
Phim, độc lập hoàn toàn với LiveTV. Đây là bộ lọc quảng cáo đã tinh chỉnh bằng
debug thật, mất là không dựng lại được.

XONG KHI:
[ ] 4 đường dẫn trên không còn trong thư mục
[ ] server.ts vẫn nguyên, chưa sửa gì

################################################################################

# PHẦN B — DỰNG HẠ TẦNG MỚI

################################################################################

================================================================================
BƯỚC 3 — TẠO FIREBASE PROJECT MỚI
================================================================================
Làm trên Firebase Console của mail mới.

- CÁI BẪY QUAN TRỌNG NHẤT CỦA CẢ RUNBOOK \*
  Khi tạo Firestore, Firebase hỏi Test mode hay Production mode.
  PHẢI CHỌN PRODUCTION MODE.
  Test mode chính là allow read, write: if true — đúng thứ đang làm app cũ hở
  toang. Nó hết hạn sau 30 ngày rồi khóa sạch, nên nhiều người bấm gia hạn rồi
  quên luôn. Nhiều khả năng app cũ đã đi đúng con đường đó.

CÁC THAO TÁC:

1. Tạo Firebase project mới. Tắt Google Analytics cho gọn.
2. Firestore Database -> Create database -> PRODUCTION MODE
   -> region asia-southeast1
3. Realtime Database -> Create database -> LOCKED MODE
4. Authentication -> Get started -> bật EMAIL/PASSWORD. KHÔNG bật Google Sign-In.
5. Project settings -> Your apps -> thêm Web app -> copy firebaseConfig ra
   file text tạm.

VỀ firebaseConfig: đoạn này KHÔNG PHẢI BÍ MẬT. Nó luôn nằm trong bundle JS của
mọi web app Firebase, ai cũng đọc được. Nó an toàn chỉ khi rules được siết.
Đó là lý do bước 6 và 7 tồn tại.

XONG KHI:
[ ] Có firebaseConfig lưu trong file tạm
[ ] Firestore và RTDB đều ở chế độ khóa
[ ] Email/Password đã bật trong Authentication

================================================================================
BƯỚC 4 — UPLOAD SOURCE LÊN AI STUDIO MỚI
================================================================================

1. Đăng nhập AI Studio bằng mail mới, tạo project, import zip đã dọn ở bước 2
2. Mở src/services/firebase.ts, thay firebaseConfig cũ bằng config mới
3. Lấy TMDB API KEY MỚI tại themoviedb.org (miễn phí). Không dùng lại key cũ
4. Đặt biến môi trường trong AI Studio: TMDB*API_KEY và các biến TMDB*\* khác

DỰ KIẾN APP SẼ LỖI — ĐÓ LÀ BÌNH THƯỜNG.
Từ đây đến hết bước 8, app báo lỗi Firestore kiểu permission denied. Đúng như
vậy: rules đang khóa, mà app chưa biết đăng nhập. Lỗi chỉ hết sau bước 8.
ĐỪNG HOẢNG VÀ ĐỪNG MỞ RULES RA CHO HẾT LỖI.

XONG KHI:
[ ] Project build được, giao diện hiện lên
[ ] firebase.ts đã trỏ sang project mới
[ ] Lỗi permission denied ở console, đúng như dự kiến

################################################################################

# PHẦN C — BẢY PROMPT CHÍNH

################################################################################

================================================================================
BƯỚC 5 — PROMPT 1: DỌN SẠCH THAM CHIẾU LIVETV
================================================================================
File đã xóa ở bước 2, prompt này dọn phần còn lại.

===== BẮT ĐẦU COPY PROMPT 1 =====

Gỡ bỏ hoàn toàn mọi dấu vết của module LiveTV khỏi dự án. Xóa sạch, không để lại code chết, không để lại flag bật/tắt.

LƯU Ý: Các file sau ĐÃ ĐƯỢC XÓA TRƯỚC khi upload, nếu không tìm thấy thì bỏ qua, không báo lỗi:

- src/components/livetv/
- src/apps/LiveTvAppWrapper.tsx
- src/components/LiveTvView.tsx
- src/utils/drmParser.ts

VIỆC 1 — Xóa 3 endpoint sau khỏi server.ts:

- /api/tv/channels
- /api/tv/stream-proxy
- /api/tv/clearkey-license

TUYỆT ĐỐI KHÔNG ĐỤNG VÀO /api/proxy/m3u8. Endpoint đó phục vụ phần Phim, hoàn toàn độc lập với LiveTV. Nếu sửa nhầm là hỏng tính năng xem phim.

VIỆC 2 — Dọn tham chiếu trong các file dùng chung:

- src/App.tsx: bỏ case activeApp === 'livetv' trong router switch, bỏ state và xử lý nút back liên quan
- src/components/Navbar.tsx: bỏ mục menu gọi onSwitchApp('livetv')
- src/components/manga/MangaNavbar.tsx: bỏ mục menu chuyển sang LiveTV
- src/components/AppSwitcherLoading.tsx: bỏ nhánh loading cho livetv
- src/services/appConfigService.ts: bỏ toggle module livetv
- src/services/systemApiService.ts: bỏ category 'livetv'
- src/services/userAnalyticsService.ts: bỏ loại media livetv
- src/components/admin/AdminEcoSystemTab.tsx: bỏ nút bật/tắt LiveTV
- src/components/admin/AdminApisTab.tsx: bỏ quản lý API category livetv
- src/components/admin/AdminUserDetailPage.tsx, AdminUserStatsTab.tsx, AdminWatchHistoryTable.tsx: bỏ bộ lọc và cột hiển thị loại livetv
- src/types.ts: bỏ 'livetv' khỏi các union type ActiveApp, ApiCategory, MediaActivityType

VIỆC 3 — Dọn dependency:

- Kiểm tra xem còn file nào import "shaka-player" hoặc "dashjs" không. Nếu KHÔNG còn thì gỡ khỏi package.json. Kiểm tra trước, đừng gỡ mù.

VIỆC 4 — Kiểm tra lại:

- Chạy tsc --noEmit và sửa hết lỗi type phát sinh.
- Grep toàn bộ source các từ khóa: "livetv", "LiveTv", "clearkey", "ClearKey", "drmParser", "Dalvik", "shaka". Báo cáo mọi chỗ còn sót.
- Liệt kê: file đã sửa, endpoint đã xóa, dependency đã gỡ.

===== HẾT PROMPT 1 =====

XONG KHI:
[ ] tsc --noEmit không còn lỗi
[ ] Grep không còn kết quả cho clearkey và drmParser
[ ] Mở app: menu không còn mục LiveTV, Phim và Manga vẫn hiện danh sách

================================================================================
BƯỚC 6 — PROMPT 2: FIREBASE AUTH THẬT + RULES
================================================================================
BƯỚC QUAN TRỌNG NHẤT CỦA CẢ RUNBOOK.
Đây là bước sửa đúng nguyên nhân gốc. Sau bước này Firestore mới có
request.auth để rules dựa vào, và mô hình nhóm kín mới thực sự tồn tại chứ
không chỉ nằm trên giao diện.

===== BẮT ĐẦU COPY PROMPT 2 =====

Thay toàn bộ lớp xác thực của dự án. Đây là thay đổi lớn, làm đủ từng bước, không bỏ bước nào.

HIỆN TRẠNG: App tự quản lý tài khoản trong collection /accounts, mật khẩu hash SHA-256 lưu thẳng trong document, session là JSON trong localStorage key 'qtb_logged_in_account_v1'. Firestore rules buộc phải mở toang vì client truy cập ẩn danh, không có request.auth để rules dựa vào.

MỤC TIÊU: Dùng Firebase Authentication thật. Đây là project Firebase MỚI, database RỖNG, KHÔNG có dữ liệu cũ cần migrate.

RÀNG BUỘC BẮT BUỘC:

- Document id của /accounts PHẢI là Firebase Auth uid. Không dùng username làm document id.
- KHÔNG dùng firebase-admin ở bước này. Chỉ dùng Firebase Client SDK.
- KHÔNG thêm UI tự đăng ký. Chỉ admin tạo được tài khoản.
- Giữ nguyên toàn bộ giao diện và luồng người dùng hiện tại.

BƯỚC 1 — Chuyển sang Firebase Auth

- Đăng nhập: gọi signInWithEmailAndPassword(username + '@gaucinema.local', password). User vẫn gõ username như cũ, việc ghép đuôi email là xử lý nội bộ.
- Sau khi auth thành công, đọc accounts/{uid} để lấy role, displayName, status. Nếu status === 'blocked' thì signOut ngay và báo lỗi.
- Thay toàn bộ cơ chế session localStorage bằng onAuthStateChanged.
- Xóa hai key localStorage: 'qtb_logged_in_account_v1' và 'qtb_accounts_local_cache_v1'.
- XÓA HẲN: hàm hashPassword, hằng PASSWORD_SALT, hàm isSha256Hash, hàm bootstrapAdminAccount, và mọi logic nâng cấp hash. Tài khoản admin đầu tiên sẽ được tạo tay trên Firebase Console.
- XÓA field 'password' khỏi interface Account trong src/types.ts. Firestore TUYỆT ĐỐI không được lưu mật khẩu dưới bất kỳ dạng nào.
- Mật khẩu tối thiểu 8 ký tự. Bỏ hết các kiểm tra 4 ký tự cũ.

BƯỚC 2 — Admin tạo tài khoản mà không bị đăng xuất

- Trong authService.createAccount: dùng initializeApp(firebaseConfig, 'userCreator') để tạo một Firebase app instance THỨ HAI, gọi createUserWithEmailAndPassword trên instance đó, rồi gọi deleteApp để dọn.
- Bắt buộc làm theo cách này. Gọi createUserWithEmailAndPassword trên instance chính sẽ tự động đăng nhập thành user vừa tạo và đá admin ra ngoài.
- Sau khi tạo xong Auth user, ghi document accounts/{uid} với các field: uid, username, role: 'user', displayName, status: 'active', createdAt, expiresAt. TUYỆT ĐỐI không có field password.
- Giới hạn tối đa 50 tài khoản: trước khi tạo, đếm số document trong /accounts, nếu đã >= 50 thì báo lỗi rõ ràng và dừng.

BƯỚC 2b — THỜI HẠN SỬ DỤNG CỦA TÀI KHOẢN

- Form tạo tài khoản thêm một ô chọn THỜI HẠN, giá trị từ 1 đến 12 tháng. Mặc định 1 tháng.
- Tính expiresAt theo THÁNG LỊCH, không phải 30 ngày cố định. Dùng setMonth(getMonth() + n) và xử lý tràn ngày: nếu ngày kết quả nhỏ hơn ngày gốc (ví dụ 31/01 cộng 1 tháng ra 03/03) thì lùi về ngày cuối cùng của tháng đích.
- expiresAt lưu dạng số epoch milliseconds.
- Tài khoản có role 'admin' KHÔNG có thời hạn. Để expiresAt là null hoặc bỏ trống.

BƯỚC 3 — Khóa tài khoản, thời hạn, và đổi mật khẩu

- Khóa hoặc mở tài khoản: cập nhật field status trong accounts/{uid}.
- Kiểm tra thời hạn sau khi đăng nhập thành công: nếu expiresAt tồn tại và nhỏ hơn Date.now() thì signOut ngay và hiện thông báo riêng, KHÁC với thông báo bị khóa:
  "Tài khoản đã hết hạn sử dụng. Vui lòng liên hệ quản trị viên để gia hạn."
  Kèm hiển thị ngày hết hạn cho người dùng biết.
- Hiện banner cảnh báo khi còn dưới 7 ngày: "Tài khoản của bạn sẽ hết hạn vào ngày ... Liên hệ quản trị viên để gia hạn."
- User tự đổi mật khẩu của mình: dùng updatePassword của Firebase Auth.
- Admin đổi mật khẩu của user khác và gia hạn tài khoản: cần Admin SDK, chưa có ở bước này. Ghi comment TODO rõ ràng. KHÔNG tự bịa giải pháp thay thế.

BƯỚC 4 — Ghi file firestore.rules
Dùng đúng 3 hàm helper sau:
function isSignedIn() { return request.auth != null; }
function me() { return get(/databases/$(database)/documents/accounts/$(request.auth.uid)).data; }
function isAdmin() { return isSignedIn() && me().role == 'admin'; }

Áp dụng:

- /accounts/{uid}: read nếu request.auth.uid == uid hoặc isAdmin(). create và delete chỉ isAdmin(). update: isAdmin() toàn quyền, hoặc chính chủ nhưng CẤM sửa 3 field role, status, uid.
- /accounts/{uid}/{sub=\*\*}: read, write nếu request.auth.uid == uid hoặc isAdmin().
- /userStats/{id} và /userActivityHistory/{id}: create, update nếu isSignedIn(). read chỉ isAdmin().
- /activeSessions/{id}: create, update, delete, read nếu isSignedIn().
- /system_apis, /notifications, /customAvatars, /global, /system_cache: read nếu isSignedIn(), write chỉ isAdmin().
- /tvPairCodes/{code}: read, write nếu isSignedIn().

TUYỆT ĐỐI KHÔNG để bất kỳ match /{document=\*\*} nào trong file. Firestore cộng dồn các luật theo kiểu OR: chỉ cần một luật cho phép là truy cập được. Một wildcard mở sẽ vô hiệu hóa toàn bộ các luật chặn phía trên nó.

BƯỚC 5 — Ghi file database.rules.json cho Realtime Database

- Mặc định ở node gốc: ".read": false và ".write": false
- watch_together/rooms/$roomId: đọc và ghi khi "auth != null"
- presence/$uid: đọc khi "auth != null", ghi khi "auth.uid === $uid"
- system_cache và app_config: đọc khi "auth != null", ghi false

BƯỚC 6 — Rà soát lại

- Grep toàn bộ source các từ: "password", "hashPassword", "PASSWORD_SALT", "qtb_logged_in_account", "qtb_accounts_local_cache". Báo cáo mọi chỗ còn sót.
- Chạy tsc --noEmit, sửa hết lỗi.
- Liệt kê file đã sửa, file đã tạo, chức năng nào còn TODO.

===== HẾT PROMPT 2 =====

XONG KHI:
[ ] Có file firestore.rules mới và database.rules.json mới
[ ] Grep hashPassword và PASSWORD_SALT không còn kết quả
[ ] Mở firestore.rules ĐỌC BẰNG MẮT: không có dòng nào chứa {document=\*\*}

- TỰ KIỂM TRA BẰNG MẮT, ĐỪNG TIN TUYỆT ĐỐI \*
  Mô hình rất hay sinh ra một match /{document=\*\*} ở cuối file "cho chắc".
  Nếu có, mọi luật phía trên thành vô nghĩa.

================================================================================
BƯỚC 7 — PUBLISH RULES LÊN FIREBASE CONSOLE
================================================================================

- ĐIỂM RẤT DỄ QUÊN \*
  File rules nằm trong project chỉ là văn bản. Rules chỉ có hiệu lực khi được
  PUBLISH LÊN FIREBASE. Nhiều người sửa file rồi tưởng xong.

1. Mở firestore.rules trong AI Studio, copy toàn bộ
2. Firebase Console -> Firestore Database -> tab Rules -> dán đè -> Publish
3. Mở database.rules.json, copy toàn bộ
4. Firebase Console -> Realtime Database -> tab Rules -> dán đè -> Publish

GHI NHỚ: bước 10 và bước 12 cũng sửa rules. Mỗi lần đó phải quay lại làm đúng
4 thao tác trên. Quên là thay đổi không có hiệu lực.

XONG KHI:
[ ] Tab Rules của Firestore hiển thị đúng nội dung mới
[ ] Tab Rules của RTDB hiển thị đúng nội dung mới
[ ] Không còn cảnh báo vàng "Your security rules are defined as public"

================================================================================
BƯỚC 8 — TẠO TÀI KHOẢN ADMIN ĐẦU TIÊN
================================================================================
Làm tay trên Console. Đây là lần duy nhất.
Code không còn hàm bootstrapAdminAccount, nên admin đầu tiên phải tạo tay. Từ
admin này trở đi, mọi tài khoản khác tạo qua giao diện app.

1. Firebase Console -> Authentication -> tab Users -> Add user
2. Email: admin@gaucinema.local
   Password: mật khẩu mạnh, KHÔNG dùng lại Admin@2026!
3. Tạo xong, COPY CHUỖI USER UID ở cột bên phải
4. Firebase Console -> Firestore -> Start collection, tên: accounts
5. Document ID: DÁN ĐÚNG UID VỪA COPY
6. Thêm các field:

   Field Kiểu Giá trị

   ***

   uid string UID vừa copy
   username string admin
   role string admin
   displayName string Quản trị viên
   status string active
   createdAt number 0

- DOCUMENT ID PHẢI ĐÚNG UID \*
  Nếu đặt document ID là chữ "admin" thay vì UID, rules sẽ không tìm thấy và bạn
  không đăng nhập được. Đây là lỗi phổ biến nhất ở bước này.

XONG KHI — ĐÂY LÀ MỐC LỚN:
[ ] Đăng nhập bằng admin + mật khẩu mới -> vào được
[ ] Vào được Admin Dashboard
[ ] HẾT LỖI permission denied ở console
[ ] Tạo thử một tài khoản user qua giao diện admin -> tạo được, và admin
KHÔNG bị đăng xuất

================================================================================
BƯỚC 9 — PROMPT 3: ĐÓNG 36 ENDPOINT BACKEND
================================================================================
Chỉ chạy sau khi bước 8 đã đăng nhập được.

LẤY SERVICE ACCOUNT TRƯỚC:

1. Firebase Console -> Project settings -> tab Service accounts
   -> Generate new private key -> tải file JSON
2. Mở file JSON, copy toàn bộ nội dung
3. Trong AI Studio, tạo biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON,
   dán nội dung JSON vào

- FILE NÀY LÀ BÍ MẬT THẬT SỰ \*
  Khác hẳn firebaseConfig. Ai có file này là có toàn quyền đọc, ghi, xóa database
  và BỎ QUA HOÀN TOÀN MỌI RULES. Đừng commit lên GitHub, đừng dán vào chat, đừng
  để trong file nằm trong source. Chỉ đặt làm biến môi trường. Nếu lỡ lộ, vào
  Console thu hồi key đó và tạo key mới ngay.

===== BẮT ĐẦU COPY PROMPT 3 =====

Thêm lớp xác thực phía server cho server.ts. Hiện toàn bộ endpoint đều không kiểm tra đăng nhập, app lại chạy trên URL Cloud Run công khai, nên bất kỳ ai trên internet cũng gọi được.

BƯỚC 1 — Khởi tạo firebase-admin

- Thêm package firebase-admin vào dependencies.
- Đọc service account từ biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON (là một chuỗi JSON).
- Nếu thiếu biến này: server phải LOG LỖI RÕ RÀNG và TỪ CHỐI KHỞI ĐỘNG. Tuyệt đối không được âm thầm chạy tiếp ở chế độ không xác thực.

BƯỚC 2 — Viết 2 middleware

- requireAuth: đọc header Authorization dạng "Bearer <idToken>", gọi admin.auth().verifyIdToken(). Gắn kết quả vào req.user. Thiếu token hoặc token sai thì trả về 401.
- requireAdmin: chạy sau requireAuth. Đọc Firestore accounts/{req.user.uid}, kiểm tra role === 'admin'. Không phải admin thì trả về 403.

BƯỚC 3 — Áp dụng theo 3 nhóm

NHÓM MỞ, không cần token:

- /api/health, /healthz, /\_ah/health
- Route fallback trả về index.html

NHÓM CHỈ ADMIN, dùng requireAuth + requireAdmin:

- POST /api/system/batch-sync
- POST /api/hero/select-asset
- GET /api/hero/admin/list
- POST /api/system/apis/ping

NHÓM CẦN ĐĂNG NHẬP, dùng requireAuth:

- Tất cả các endpoint /api/\* còn lại.

BƯỚC 4 — Xử lý riêng cho /api/proxy/image
Endpoint này được gọi từ thuộc tính src của thẻ img, mà thẻ img KHÔNG gửi được header Authorization. Áp requireAuth lên nó sẽ làm vỡ toàn bộ ảnh poster.
Thay vào đó:

- Không áp requireAuth lên endpoint này.
- Chỉ cho phép một danh sách domain upstream cố định. Mọi domain khác trả về 403.
- Chỉ trả về response có Content-Type bắt đầu bằng "image/".
- Kiểm tra thêm: thử bỏ hẳn proxy ảnh, cho trình duyệt tải thẳng từ CDN gốc. Nếu ảnh vẫn hiện bình thường thì xóa luôn endpoint này, vì nó tốn băng thông server. Chỉ giữ proxy cho những domain thật sự chặn referrer. Báo cáo kết quả kiểm tra.

BƯỚC 5 — Vá lỗ hổng SSRF ở /api/proxy/generic
Endpoint này đang nhận một URL bất kỳ dạng Base64 và không kiểm tra gì cả. Chạy trên Cloud Run, đây là đường tấn công vào metadata server nội bộ của Google để lấy access token của service account. Bắt buộc sửa:

- Chỉ chấp nhận giao thức http và https.
- Phân giải hostname ra địa chỉ IP, rồi CHẶN toàn bộ các dải nội bộ: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1, fc00::/7.
- Chặn riêng hostname metadata.google.internal.
- Phải kiểm tra lại IP SAU MỖI LẦN REDIRECT, không chỉ lần đầu. Đặt redirect: 'manual' và tự xử lý từng bước chuyển hướng.
- TUYỆT ĐỐI không chuyển tiếp bất kỳ header nào do client gửi lên sang máy chủ đích.

BƯỚC 6 — Client gắn token vào mọi request

- Viết một helper fetch dùng chung: lấy ID token qua getAuth().currentUser.getIdToken(), gắn vào header Authorization, và dùng helper này cho MỌI lời gọi tới /api/\*.
- CỰC KỲ QUAN TRỌNG: endpoint /api/proxy/m3u8 KHÔNG được gọi bằng fetch, mà do thư viện Hls.js tự tải. Phải dùng tùy chọn xhrSetup khi khởi tạo Hls để gắn header Authorization vào request của nó. Bỏ sót chỗ này là tính năng xem phim hỏng hoàn toàn.
- Xử lý lỗi 401: thử refresh token một lần, nếu vẫn lỗi thì đẩy user về màn hình đăng nhập.

BƯỚC 7 — Rà soát

- Xuất một bảng liệt kê: mỗi endpoint thuộc nhóm nào trong 3 nhóm trên.
- Chạy tsc --noEmit và sửa hết lỗi.

===== HẾT PROMPT 3 =====

XONG KHI:
[ ] Server khởi động được, log xác nhận firebase-admin đã init
[ ] Đăng nhập rồi XEM THỬ MỘT TẬP PHIM — phải chạy được
[ ] Ảnh poster vẫn hiện bình thường

NẾU PHIM KHÔNG PHÁT ĐƯỢC: gần như chắc chắn xhrSetup ở Bước 6 bị bỏ sót. Mở
tab Network, xem request tới /api/proxy/m3u8 có trả 401 không.

================================================================================
BƯỚC 10 — PROMPT 4: GIỚI HẠN THIẾT BỊ VÀ HỒ SƠ
================================================================================
Mỗi tài khoản: tối đa 2 hồ sơ, tối đa 2 thiết bị dùng cùng lúc.

NGUYÊN TẮC THIẾT KẾ
Firestore Security Rules KHÔNG ĐẾM ĐƯỢC document. Nên không dùng cách "đếm rồi
chặn" — mở DevTools là lách được. Thay vào đó dùng CẤP PHÁT SLOT CỐ ĐỊNH: ép
document id chỉ nhận một trong hai giá trị định sẵn. Cái thứ 3 không tồn tại
được ở tầng database.

===== BẮT ĐẦU COPY PROMPT 4 =====

Thêm 2 giới hạn vào hệ thống: mỗi tài khoản tối đa 2 hồ sơ, và tối đa 2 thiết bị dùng cùng lúc.

PHẦN A — GIỚI HẠN 2 HỒ SƠ MỖI TÀI KHOẢN

Không dùng cách đếm số document rồi chặn, vì Firestore Security Rules KHÔNG đếm được document. Dùng cách cấp phát slot cố định:

- Document id của profile chỉ được phép là 'p1' hoặc 'p2'. Bỏ hẳn cách đặt id ngẫu nhiên hoặc id theo username.
- Khi tạo hồ sơ: tìm slot trống trong ['p1','p2']. Hết slot thì báo lỗi "Mỗi tài khoản chỉ được tạo tối đa 2 hồ sơ" rồi dừng.
- Sửa Firestore rules cho /accounts/{uid}/profiles/{profileId}:
  allow create: if (request.auth.uid == uid || isAdmin()) && profileId in ['p1','p2'];
  allow read, update, delete: if request.auth.uid == uid || isAdmin();
  Cách này khiến hồ sơ thứ 3 KHÔNG THỂ tạo được, kể cả gọi Firestore SDK từ DevTools.
- Sửa UI quản lý hồ sơ: ẩn hoặc vô hiệu hóa nút thêm hồ sơ khi đã đủ 2.

PHẦN B — GIỚI HẠN 2 THIẾT BỊ DÙNG CÙNG LÚC

PHẠM VI: giới hạn tính theo TÀI KHOẢN, không theo hồ sơ. 2 người cùng dùng chung 1 hồ sơ là hợp lệ. 2 người dùng 2 hồ sơ khác nhau cũng hợp lệ. Chỉ chặn khi có THIẾT BỊ THỨ BA.

CHIẾM SLOT NGAY KHI VÀO APP, KHÔNG PHẢI KHI BẤM XEM.
Lý do: nếu chỉ chặn lúc bấm xem thì 100 người vẫn vào được app cùng một tài khoản. 98 người không xem vẫn tải trang chủ, vẫn đọc Firestore, vẫn mở kết nối Realtime Database. Gói Spark chỉ cho 100 kết nối RTDB đồng thời nên đây là trần chạm trước cả quota đọc.
Cách này cũng tự động bao luôn truyện tranh, không cần xử lý riêng.

B1. Dùng Realtime Database, KHÔNG dùng Firestore cho phần này

- Lưu slot tại node RTDB: sessions/{uid}/{slot} với slot chỉ được là '1' hoặc '2'.
- Lý do bắt buộc dùng RTDB: RTDB có onDisconnect() tự động xóa node khi client mất kết nối, đóng tab, sập trình duyệt hay rớt mạng. Firestore không có cơ chế này nên phải ghi heartbeat liên tục, vừa tốn quota Spark vừa để slot kẹt lại sau khi người dùng đã thoát.
- Mỗi slot chứa: deviceId, deviceInfo, profileId, profileName, kind ('movie' hoặc 'manga'), title, startedAt.

B2. Rules cho RTDB, thêm vào database.rules.json
"sessions": {
"$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid",
        "$slot": {
".validate": "$slot === '1' || $slot === '2'"
}
}
}
Phần .validate khiến slot thứ 3 KHÔNG THỂ ghi được, kể cả gọi SDK từ DevTools.

B3. Định danh thiết bị

- Sinh deviceId ngẫu nhiên bằng crypto.randomUUID() ở lần chạy đầu, lưu localStorage key 'qtb_device_id', các lần sau dùng lại.

B4. Chiếm slot TRONG onAuthStateChanged, KHÔNG phải sau signInWithEmailAndPassword

ĐÂY LÀ ĐIỂM QUAN TRỌNG NHẤT CỦA PROMPT NÀY, LÀM SAI LÀ VÔ HIỆU TOÀN BỘ.
Firebase Auth lưu phiên trong IndexedDB và tự khôi phục khi mở lại app. Người đã đăng nhập từ trước KHÔNG đi qua hàm signInWithEmailAndPassword lần nữa. Nếu đặt kiểm tra ở đó thì thiết bị thứ 3 chỉ cần từng đăng nhập một lần là vào thẳng được mãi mãi.

Hook đúng là onAuthStateChanged. Nó chạy cho CẢ HAI trường hợp: vừa đăng nhập xong, và mở lại app với phiên cũ. Chỉ gọi claimSession() tại ĐÚNG MỘT CHỖ là trong onAuthStateChanged.

Thứ tự bắt buộc khi onAuthStateChanged trả về một user:

1. Đọc accounts/{uid} để lấy role và status
2. Gọi claimSession()
3. CHỈ KHI chiếm được slot mới render app và mới bắt đầu tải dữ liệu
   Tuyệt đối KHÔNG tải trang chủ, không đọc history, không đọc system_apis trước khi có slot. Mục đích của cả cơ chế này là để thiết bị thứ 3 không phát sinh lượt đọc nào.

Logic claimSession():

- Đọc node sessions/{uid} một lần.
- Một slot coi là CÒN TRỐNG nếu: không tồn tại, HOẶC deviceId của nó trùng deviceId thiết bị hiện tại (mở 2 tab trên cùng máy chỉ tính 1 slot).
- Chiếm slot trống đầu tiên, ghi đủ các field ở B1.
- Ngay sau khi ghi, gọi onDisconnect().remove() trên chính node slot đó để RTDB tự dọn khi mất kết nối.
- Nếu CẢ 2 SLOT đều bận bởi thiết bị khác: hiện màn hình chặn ở B5. KHÔNG đăng xuất.

B4b. Cập nhật nội dung đang xem
Khi người dùng mở một tập phim hoặc một chương truyện, CẬP NHẬT slot đang giữ, ghi thêm kind, title, profileId, profileName. Chỉ để admin nhìn thấy ai đang xem gì, không liên quan tới việc chặn.

B5. Màn hình chặn — GIỮ NGUYÊN ĐĂNG NHẬP, KHÔNG ĐĂNG XUẤT

- KHÔNG gọi signOut(). Phiên Firebase Auth giữ nguyên.
- Hiện màn hình chặn toàn trang thay cho app:
  "Tài khoản này đang được sử dụng trên 2 thiết bị khác. Mỗi tài khoản chỉ dùng được tối đa 2 thiết bị cùng lúc."
  Bên dưới liệt kê 2 phiên đang chiếm slot: deviceInfo và thời điểm bắt đầu.
- Nút "Thử lại": gọi lại claimSession() một lần. Chiếm được thì vào thẳng app, KHÔNG phải nhập mật khẩu lại.
- Nút "Đăng xuất" để người dùng chủ động thoát nếu muốn.
- KHÔNG tự động đá thiết bị khác ra.

B5b. Thiết bị bị chặn phải ngừng tiêu thụ tài nguyên
Đây là lý do tồn tại của cả cơ chế, làm thiếu là mất sạch tác dụng:

- Ngay sau khi xác định bị chặn, gọi goOffline() trên instance Realtime Database để NGẮT WEBSOCKET. Gói Spark chỉ cho 100 kết nối đồng thời.
- KHÔNG đặt listener onValue thường trực lên sessions/{uid} để chờ slot trống. Listener như vậy giữ kết nối sống. Chỉ kiểm tra lại khi bấm "Thử lại": goOnline() -> kiểm tra -> goOffline() lại nếu vẫn bị chặn.
- KHÔNG đọc bất kỳ collection Firestore nào ở trạng thái bị chặn.
  Kết quả: một thiết bị bị chặn chỉ tốn 1 lượt đọc Firestore và 1 lượt đọc RTDB rồi nằm yên.

B5c. Xử lý khi chạm trần 100 kết nối RTDB
Khi SDK Realtime Database báo lỗi kết nối, hoặc timeout quá 10 giây lúc claimSession, hiện thông báo rõ ràng:
"Hệ thống đang có quá nhiều người truy cập. Vui lòng thử lại sau ít phút."
kèm nút Thử lại. KHÔNG hiện lỗi kỹ thuật thô.

B6. Nhả slot

- Khi đăng xuất: xóa node slot ngay.
- Khi đóng tab, sập trình duyệt, rớt mạng: onDisconnect() ở B4 tự lo.
- KHÔNG dùng heartbeat định kỳ.
- Nếu document.visibilityState === 'hidden' liên tục quá 30 phút thì signOut và nhả slot, để người để quên tab mở không chiếm chỗ mãi.

B7. Chặn thêm ở phía server

- Viết middleware requireActiveSlot, chạy ngay sau requireAuth. Client gửi deviceId qua header 'X-Device-Id' trong MỌI request.
- Middleware đọc sessions/{uid} bằng firebase-admin. Nếu KHÔNG có slot nào mang đúng deviceId này thì trả về 409 kèm mã lỗi NO_SESSION_SLOT.
- Áp requireActiveSlot lên TOÀN BỘ nhóm "cần đăng nhập" ở Prompt 3.
- Client nhận 409 NO_SESSION_SLOT thì hiện màn hình chặn ở B5. KHÔNG signOut.
- Cache kết quả đọc RTDB khoảng 30 giây trong memory để không đọc lại mỗi request.

B7b. VÌ SAO GIỮ ĐĂNG NHẬP VẪN AN TOÀN
Người bị chặn vẫn giữ ID token hợp lệ nên về lý thuyết gọi API trực tiếp được. Thứ chặn điều đó là middleware requireActiveSlot: server kiểm tra THIẾT BỊ CÓ GIỮ SLOT KHÔNG, chứ không chỉ kiểm tra đã đăng nhập chưa. Không có B7 thì việc giữ đăng nhập là một lỗ hổng. Hai phần này bắt buộc đi cùng nhau.

B8. Gỡ đường vòng

- Hiện client có fallback: khi backend proxy lỗi thì gọi THẲNG tới API bên thứ ba (phimapi.com, ophim1.com). Đường này đi vòng qua toàn bộ kiểm tra ở B7.
- GỠ BỎ fallback gọi thẳng đó. Nếu backend proxy lỗi thì báo lỗi cho người dùng, không tự đi đường vòng.

PHẦN C — ADMIN NHÌN THẤY VÀ CAN THIỆP

- Admin Dashboard, trang chi tiết user: đọc node RTDB sessions/{uid} và hiển thị 2 slot theo thời gian thực — thiết bị nào, đang xem phim hay đọc truyện, nội dung gì, bắt đầu lúc nào.
- Nút "Ngắt phiên": gọi một endpoint server CHỈ ADMIN, dùng firebase-admin xóa node slot đó. Không cho client tự xóa slot của người khác.

PHẦN D — RÀ SOÁT

- Chạy tsc --noEmit, sửa hết lỗi.
- XUẤT LẠI TOÀN BỘ firestore.rules VÀ database.rules.json sau khi sửa.
- Liệt kê file đã sửa.

===== HẾT PROMPT 4 =====

SAU KHI CHẠY XONG: QUAY LẠI BƯỚC 7, PUBLISH LẠI CẢ HAI FILE RULES.

XONG KHI:
[ ] Tạo hồ sơ thứ 3 -> bị chặn
[ ] 3 trình duyệt cùng một tài khoản: cái thứ 3 bị chặn, hiện đúng 2 thiết bị
đang chiếm slot
[ ] PHÉP THỬ QUAN TRỌNG NHẤT: trên thiết bị thứ 3, đăng nhập 1 lần rồi ĐÓNG
HẲN trình duyệt, mở lại và vào app. Phải VẪN bị chặn. Nếu vào được nghĩa
là claimSession đang nằm sai chỗ, không nằm trong onAuthStateChanged
[ ] Thiết bị thứ 3 KHÔNG tải được trang chủ, KHÔNG đọc được Firestore
[ ] Thiết bị thứ 3 KHÔNG bị bắt đăng nhập lại. Đóng 1 thiết bị khác rồi bấm
"Thử lại" là vào thẳng app
[ ] 1 thiết bị xem phim + 1 thiết bị đọc truyện -> thiết bị thứ 3 vẫn bị chặn
[ ] Mở 2 tab trên CÙNG một máy -> chỉ tính 1 slot
[ ] Cả hai file rules đã publish lên Console

GIỚI HẠN CỦA CƠ CHẾ NÀY
Segment video tải THẲNG từ CDN bên thứ ba, không qua server bạn. Nên người có
kiến thức kỹ thuật, khi đã lấy được link m3u8, vẫn mở được bằng VLC. Không
chặn triệt để được trừ khi proxy toàn bộ segment, mà việc đó tốn băng thông
nên không đáng. Cơ chế này chặn được việc chia sẻ mật khẩu thông thường, và
với nhóm kín người quen thì đó là mức đúng.

================================================================================
BƯỚC 11 — PROMPT 5: QUYỀN KIỂM SOÁT CỦA ADMIN
================================================================================
Ba thứ bạn SẼ cần khi vận hành 50 tài khoản.

VÌ SAO BẮT BUỘC

1. Khóa tài khoản hiện chỉ kiểm tra LÚC ĐĂNG NHẬP. Người đã đăng nhập sẵn vẫn
   dùng tiếp — Firebase Auth giữ phiên gần như vô thời hạn. Bạn bấm "khóa" mà
   thực tế không cắt được ai.
2. Admin chưa đổi được mật khẩu cho user. Với 50 người, quên mật khẩu chắc
   chắn xảy ra.
3. Chưa xóa hẳn được tài khoản khỏi Firebase Auth.

===== BẮT ĐẦU COPY PROMPT 5 =====

Bổ sung các quyền kiểm soát của admin. Tất cả đều dùng firebase-admin ở server.ts, KHÔNG làm ở client.

PHẦN A — KHÓA TÀI KHOẢN PHẢI CÓ HIỆU LỰC NGAY

Hiện trạng: status 'blocked' chỉ được kiểm tra lúc đăng nhập. Người đã đăng nhập từ trước vẫn dùng tiếp vô thời hạn. Phải sửa cả hai đầu:

A1. Chặn ở middleware requireAuth trong server.ts

- Sau khi verifyIdToken thành công, đọc thêm Firestore accounts/{uid}.
- Nếu status === 'blocked' thì trả về 403 kèm { error: 'ACCOUNT_BLOCKED' }.
- Cache kết quả đọc này trong memory khoảng 60 giây để không tốn quota mỗi request.

A2. Thu hồi phiên đăng nhập

- Endpoint POST /api/admin/users/:uid/block, chỉ admin gọi được.
- Làm 3 việc: cập nhật Firestore status = 'blocked', gọi admin.auth().revokeRefreshTokens(uid) để vô hiệu hóa mọi phiên hiện có, và xóa node RTDB sessions/{uid} để nhả slot.
- Thêm endpoint POST /api/admin/users/:uid/unblock làm ngược lại.

A3. Client xử lý bị khóa giữa chừng

- Khi nhận 403 kèm ACCOUNT_BLOCKED từ bất kỳ request nào: signOut ngay, đẩy về màn hình đăng nhập, hiện "Tài khoản đã bị quản trị viên tạm khóa."

PHẦN A2 — THỜI HẠN TÀI KHOẢN PHẢI CÓ HIỆU LỰC NGAY

Cùng một vấn đề với khóa tài khoản: kiểm tra ở client lúc đăng nhập là không đủ, vì người đã đăng nhập sẵn không đi qua đó nữa.

A2.1 Chặn ở middleware requireAuth

- Trong cùng lượt đọc Firestore accounts/{uid} đã làm ở A1 (không đọc thêm lần nữa), kiểm tra luôn expiresAt.
- Nếu expiresAt tồn tại và nhỏ hơn Date.now() thì trả về 403 kèm { error: 'ACCOUNT_EXPIRED', expiresAt }.
- Tài khoản role 'admin' bỏ qua kiểm tra này.

A2.2 Gắn thời hạn vào custom claim

- Khi tạo tài khoản hoặc gia hạn, gọi admin.auth().setCustomUserClaims(uid, { expiresAt: <số epoch ms> }). Giữ nguyên các claim đang có, đừng ghi đè mất claim admin.
- Mục đích: để Firestore Security Rules kiểm tra được thời hạn mà KHÔNG cần lệnh get(), tức không tốn lượt đọc. Nếu không có claim, người hết hạn vẫn đọc ghi Firestore trực tiếp được dù server đã chặn.
- Sau khi gán claim, gọi admin.auth().revokeRefreshTokens(uid) để token cũ không dùng tiếp được.

A2.3 Endpoint gia hạn

- POST /api/admin/users/:uid/extend, chỉ admin, nhận { months } với giá trị từ 1 đến 12.
- QUY TẮC TÍNH MỐC BẮT ĐẦU, làm đúng:
  Nếu tài khoản CHƯA hết hạn -> cộng thêm vào expiresAt hiện tại, để người dùng không mất phần thời gian còn lại.
  Nếu tài khoản ĐÃ hết hạn -> cộng từ thời điểm hiện tại.
- Tính theo tháng lịch với xử lý tràn ngày, giống Prompt 2 bước 2b.
- Cập nhật cả field expiresAt trong Firestore VÀ custom claim.
- Trả về expiresAt mới để giao diện cập nhật ngay.

A2.4 Client xử lý hết hạn giữa chừng

- Khi nhận 403 kèm ACCOUNT_EXPIRED từ bất kỳ request nào: nhả slot phiên trong RTDB, signOut, hiện màn hình "Tài khoản đã hết hạn sử dụng" kèm ngày hết hạn.
- Thông báo này phải KHÁC với thông báo bị khóa, để người dùng biết cần làm gì.

A2.5 Giao diện admin

- Danh sách user: thêm cột Ngày hết hạn và Số ngày còn lại. Tô màu: đỏ nếu đã hết hạn, vàng nếu còn dưới 7 ngày.
- Thêm bộ lọc nhanh: Đang hoạt động / Sắp hết hạn / Đã hết hạn.
- Trang chi tiết user: ô chọn 1 đến 12 tháng kèm nút Gia hạn. Hiển thị rõ ngày hết hạn mới sẽ là ngày nào TRƯỚC khi bấm xác nhận.

A2.6 KHÔNG CẦN JOB ĐỊNH KỲ
Không viết cron, không viết scheduled function để quét tài khoản hết hạn. Hết hạn được xác định bằng cách SO SÁNH TẠI THỜI ĐIỂM TRUY CẬP, nên không cần job nào cả. Đây cũng là lý do cơ chế này không tốn chi phí.

PHẦN B — ADMIN ĐỔI MẬT KHẨU CHO USER

Đây là phần được đánh dấu TODO ở Prompt 2. Giờ đã có firebase-admin nên làm được.

- Endpoint POST /api/admin/users/:uid/password, chỉ admin, nhận newPassword trong body.
- Dùng admin.auth().updateUser(uid, { password: newPassword }).
- Sau khi đổi, gọi admin.auth().revokeRefreshTokens(uid) để đá mọi phiên cũ ra.
- Mật khẩu mới tối thiểu 8 ký tự, từ chối nếu ngắn hơn.
- Admin Dashboard: nút "Đặt lại mật khẩu" ở trang chi tiết user, có ô nhập mật khẩu mới và nút sinh mật khẩu ngẫu nhiên mạnh để admin copy gửi cho người dùng.

PHẦN C — XÓA HẲN TÀI KHOẢN

- Endpoint DELETE /api/admin/users/:uid, chỉ admin.
- Thứ tự: xóa node RTDB sessions/{uid}, xóa các subcollection của accounts/{uid}, xóa document accounts/{uid}, cuối cùng gọi admin.auth().deleteUser(uid).
- Chặn cứng: không cho xóa tài khoản có role === 'admin'.
- Admin Dashboard: nút Xóa phải có hộp xác nhận bắt gõ đúng username mới cho xóa.

PHẦN D — RÀ SOÁT

- Tất cả endpoint /api/admin/\* phải đi qua requireAuth + requireAdmin.
- Chạy tsc --noEmit, sửa hết lỗi.
- Liệt kê các endpoint admin mới và file đã sửa.

===== HẾT PROMPT 5 =====

XONG KHI:
[ ] Đăng nhập user thường ở tab khác, admin bấm Khóa -> trong vòng 1 phút
user đó bị đá về màn hình đăng nhập
[ ] Admin đặt lại được mật khẩu, user đăng nhập được bằng mật khẩu mới
[ ] Xóa được một tài khoản thử nghiệm, nó biến mất khỏi Authentication
[ ] Không xóa được tài khoản admin
[ ] Sửa tay expiresAt của một user về quá khứ trong Firestore Console ->
user đó bị chặn với thông báo HẾT HẠN, khác với thông báo bị khóa
[ ] Gia hạn user đó 1 tháng -> vào lại được ngay
[ ] Gia hạn một tài khoản CHƯA hết hạn -> thời gian còn lại được CỘNG DỒN,
không bị mất
[ ] Danh sách user hiển thị đúng ngày hết hạn và số ngày còn lại

================================================================================
BƯỚC 12 — PROMPT 6: TỐI ƯU QUOTA FIRESTORE
================================================================================

- BẮT BUỘC, KHÔNG PHẢI TÙY CHỌN \*
  Thiếu bước này, riêng việc ghi tiến độ xem đã vượt hạn mức write 4,5 lần ở
  worst case. App sẽ hỏng từ chiều mỗi ngày. Nó không tốn tiền, nhưng thiếu nó
  thì app không dùng được.

HAI CHỖ THỰC SỰ ĐỐT QUOTA

1. GHI tiến độ xem quá dày. Lưu mỗi 10 giây thì một phim 45 phút tốn 270 lượt
   ghi. 15 người xem 2 tiếng/ngày là khoảng 10.800 ghi/ngày, hơn nửa hạn mức.
2. Hàm get() TRONG SECURITY RULES bị tính là một lượt đọc. Hàm isAdmin() viết
   ở Prompt 2 gọi get() mỗi lần đánh giá, nhân đôi số đọc của cả app.

Lưu ý: việc duyệt và TÌM KIẾM PHIM KHÔNG ĐỤNG TỚI FIRESTORE. Luồng đó đi
client -> server.ts -> API bên thứ ba.

===== BẮT ĐẦU COPY PROMPT 6 =====

Tối ưu lượng đọc ghi Firestore để chạy an toàn trong hạn mức gói Spark (50.000 đọc/ngày, 20.000 ghi/ngày).

PHẦN A — BỎ get() TRONG SECURITY RULES

Mỗi lần get() trong rules bị tính là MỘT LƯỢT ĐỌC, nhân đôi chi phí đọc của toàn app. Sửa bằng custom claim:

A1. Gán custom claim

- Endpoint admin POST /api/admin/users/:uid/set-admin, dùng admin.auth().setCustomUserClaims(uid, { admin: true }).
- Hướng dẫn rõ trong báo cáo cách tôi gọi endpoint này lần đầu cho tài khoản admin hiện có.
- Mỗi khi tạo tài khoản mới với role admin thì gán claim luôn.

A2. Sửa rules dùng claim thay vì get()
function isSignedIn() { return request.auth != null; }
function isAdmin() { return isSignedIn() && request.auth.token.admin == true; }
function notExpired() {
return isAdmin() ||
(isSignedIn()
&& request.auth.token.expiresAt is number
&& request.auth.token.expiresAt > request.time.toMillis());
}

- Bỏ hoàn toàn hàm me() và mọi lệnh get() trong firestore.rules.
- Giữ nguyên toàn bộ logic phân quyền, chỉ đổi cách xác định admin.
- THÊM notExpired() vào MỌI luật dành cho người dùng thường. Ví dụ:
  allow read: if (request.auth.uid == uid && notExpired()) || isAdmin();
  Mục đích: tài khoản hết hạn không đọc ghi Firestore trực tiếp được, kể cả khi
  còn giữ ID token hợp lệ và kể cả khi gọi SDK từ DevTools.
- Hàm này so sánh với request.time tức THỜI ĐIỂM HIỆN TẠI, nên một token cũ
  cấp trước lúc hết hạn vẫn bị chặn đúng. Không cần job quét định kỳ.

A3. Thứ tự điều kiện phải đặt phép rẻ lên trước

- Rules dùng toán tử || có short-circuit. Luôn viết phép so sánh uid TRƯỚC:
  allow read: if request.auth.uid == uid || isAdmin();
  Với người dùng thường, vế đầu đúng nên vế sau không bị đánh giá.

A4. Client phải refresh token sau khi claim đổi

- Sau khi gán claim, gọi getIdToken(true) để lấy token mới có claim. Nếu không, claim chưa có hiệu lực cho tới khi token tự hết hạn.

PHẦN B — TIẾN ĐỘ XEM: TÁCH LÀM BA TẦNG

NGUYÊN TẮC CHI PHÍ, HIỂU TRƯỚC KHI SỬA:

- localStorage: miễn phí hoàn toàn, nhưng chỉ có trên đúng thiết bị đó.
- Realtime Database: tính phí theo DUNG LƯỢNG LƯU và BĂNG THÔNG TẢI VỀ. KHÔNG tính theo số lượt ghi. Ghi dày gần như miễn phí.
- Firestore: tính phí theo SỐ LƯỢT đọc và ghi. Ghi dày là đắt nhất. Chỉ dùng cho dữ liệu cần truy vấn và sắp xếp.

B1. TẦNG 1 — localStorage, ghi liên tục

- Cập nhật mỗi 5 giây trong lúc đang phát. Key gồm profileId và movieSlug.
- Dùng để khôi phục tức thì khi xem lại trên CÙNG thiết bị.

B2. TẦNG 2 — Realtime Database, đồng bộ định kỳ

- Ghi vào node progress/{uid}/{profileId}/{movieSlug}
- Nội dung: currentTime, duration, episodeSlug, updatedAt. Khoảng 200 byte.
- Tần suất: mỗi 30 giây trong lúc đang phát.
- Mục đích: xem dở trên điện thoại, mở TV xem tiếp.
- Dọn rác: chỉ giữ tối đa 50 mục gần nhất cho mỗi hồ sơ, xóa mục cũ hơn khi vượt, để không chạm trần 1 GB lưu trữ.

B3. TẦNG 3 — Firestore, chỉ ghi khi KẾT THÚC phiên xem
Ghi vào collection history như hiện tại, nhưng CHỈ tại các mốc sau:

- Khi đóng trình phát
- Khi chuyển tập hoặc chuyển phim
- Khi tạm dừng liên tục quá 30 giây
- Khi rời trang (beforeunload và visibilitychange sang hidden)
  KHÔNG ghi định kỳ trong lúc đang phát. Một phiên xem chỉ tốn 2-3 lượt ghi thay vì 270.
  Dùng debounce 3 giây. Bỏ qua ghi nếu tiến độ thay đổi dưới 10 giây so với lần trước.

B4. ĐỌC NGƯỢC KHI KHÔI PHỤC TIẾN ĐỘ
Khi mở một phim, lấy mốc thời gian theo thứ tự ưu tiên:

1. localStorage
2. RTDB progress (nếu updatedAt mới hơn localStorage)
3. Firestore history
   Hàng "Xem tiếp" ở trang chủ vẫn đọc từ Firestore history, vì cần sắp xếp theo thời gian.

B5. ÁP DỤNG Y HỆT CHO TRUYỆN TRANH
mangaHistory dùng đúng mô hình 3 tầng trên, node RTDB progress_manga/{uid}/{profileId}/{mangaId}.

PHẦN C — GOM CÁC LƯỢT GHI THỐNG KÊ

- userStats và userActivityHistory: CHỈ ghi MỘT LẦN khi kết thúc phiên xem, với tổng số giây đã xem. Không ghi liên tục.
- Dùng writeBatch khi cần ghi nhiều document cùng lúc.

PHẦN D — CACHE CÁC DỮ LIỆU ÍT ĐỔI
Các collection sau gần như không đổi trong một phiên dùng nhưng đang bị đọc lại mỗi lần vào trang: system_apis, notifications, customAvatars, global, system_cache.
Sửa: đọc một lần khi khởi động app, giữ trong memory hoặc sessionStorage cho cả phiên. Chỉ đọc lại khi người dùng bấm làm mới hoặc admin vừa sửa.

PHẦN E — SỬA TRUY VẤN N+1 Ở ADMIN
Hàm getAllAccounts() hiện duyệt từng account rồi query subcollection profiles. Với 50 tài khoản là 51 lượt đọc mỗi lần mở danh sách user.
Sửa: bỏ phần đếm profiles trong danh sách tổng, chỉ đếm khi admin mở trang chi tiết một user.

PHẦN F — BÁO CÁO KIỂM TOÁN
Xuất bảng liệt kê MỌI chỗ ghi Firestore trong source, gồm: file, mục đích, tần suất ghi ước tính. Đánh dấu chỗ nào đã được tối ưu.

===== HẾT PROMPT 6 =====

SAU KHI CHẠY XONG, THEO ĐÚNG THỨ TỰ:

1. Quay lại BƯỚC 7, publish lại firestore.rules
2. Gọi endpoint set-admin một lần cho tài khoản admin
3. ĐĂNG XUẤT VÀ ĐĂNG NHẬP LẠI để token mới có claim
   Không làm bước 3 thì admin mất quyền và bạn sẽ tưởng là hỏng.

XONG KHI:
[ ] firestore.rules không còn lệnh get() nào
[ ] Admin vẫn vào được Dashboard sau khi đăng nhập lại
[ ] User thường vẫn bị chặn đúng
[ ] Xem phim 5 phút, mở Firebase Console -> Usage: số lượt ghi tăng khoảng 5
chứ không phải khoảng 30

################################################################################

# PHẦN D — NGHIỆM THU

################################################################################

================================================================================
BƯỚC 13 — TỰ KIỂM TRA BẢO MẬT
================================================================================
Đừng tin là xong vì không thấy lỗi. Chạy đủ 5 phép thử.
CẢ 5 ĐỀU PHẢI THẤT BẠI thì mới đạt.

THỬ 1 — Giả mạo admin bằng localStorage
Đăng xuất, mở DevTools Console, chạy:

    localStorage.setItem('qtb_logged_in_account_v1', JSON.stringify({
      id:'admin', username:'admin', role:'admin', status:'active'
    })); location.reload();

ĐẠT KHI: vẫn ở màn hình đăng nhập. Đây chính là lỗ hổng của app cũ.

THỬ 2 — Gọi API không kèm token
Mở tab ẩn danh, dán URL app kèm đuôi /api/top10/netflix-vn vào thanh địa chỉ.
ĐẠT KHI: trả về 401, không trả về dữ liệu.

THỬ 3 — Đọc Firestore khi chưa đăng nhập
Mở app ở tab ẩn danh, chưa đăng nhập, mở Console chạy:

    firebase.firestore().collection('accounts').get()
      .then(s => console.log('LO HONG! Doc duoc', s.size, 'document'))
      .catch(e => console.log('DAT:', e.code));

ĐẠT KHI: in ra DAT: permission-denied

THỬ 4 — User thường đọc dữ liệu người khác
Tạo một tài khoản user thường, đăng nhập bằng nó, chạy lại lệnh ở Thử 3.
ĐẠT KHI: vẫn permission-denied.

THỬ 5 — Lách giới hạn hồ sơ bằng DevTools
Đăng nhập user thường đã có đủ 2 hồ sơ, mở Console chạy:

    firebase.firestore()
      .doc('accounts/' + firebase.auth().currentUser.uid + '/profiles/p3')
      .set({name:'lach'})
      .then(() => console.log('LO HONG! Tao duoc ho so thu 3'))
      .catch(e => console.log('DAT:', e.code));

ĐẠT KHI: in ra DAT: permission-denied
Phép thử này chứng minh giới hạn nằm ở tầng database, không phải chỉ ở UI.

NGHIỆM THU CHỨC NĂNG:
[ ] Xem được một tập phim trọn vẹn, tua được, lưu được tiến độ
[ ] Đọc được một chương truyện
[ ] Tạo phòng Watch Together và vào được bằng mã PIN
[ ] Admin tạo được tài khoản mới mà không bị đăng xuất
[ ] Tạo tới tài khoản thứ 51 thì bị chặn
[ ] Tạo tới hồ sơ thứ 3 thì bị chặn
[ ] Thiết bị thứ 3 cùng lúc thì bị chặn
[ ] Tạo tài khoản chọn được thời hạn 1 đến 12 tháng
[ ] Tài khoản hết hạn không vào được, admin gia hạn thì vào lại được ngay

THỬ 6 — Tài khoản hết hạn có đọc được Firestore không
Sửa tay expiresAt của một user về quá khứ trong Firestore Console. Đăng nhập
bằng user đó (hoặc dùng tab đang đăng nhập sẵn), mở Console chạy:

    firebase.firestore()
      .doc('accounts/' + firebase.auth().currentUser.uid)
      .get()
      .then(() => console.log('LO HONG! Het han van doc duoc'))
      .catch(e => console.log('DAT:', e.code));

ĐẠT KHI: in ra DAT: permission-denied
Nếu đọc được nghĩa là hàm notExpired() chưa được gắn vào rules, hoặc custom
claim expiresAt chưa được gán. Xem lại Prompt 6 phần A2.

################################################################################

# PHẦN E — BẢN APK

################################################################################

================================================================================
BƯỚC 14 — PROMPT 7: CƠ CHẾ CẬP NHẬT CHO BẢN APK
================================================================================

HIỂU ĐÚNG TRƯỚC KHI LÀM
App Capacitor có HAI tầng tách rời:
Tầng web — HTML, CSS, JavaScript. Chiếm khoảng 95% số lần bạn sửa code.
Tầng native — Java/Kotlin, plugin, quyền, cấu hình. Rất ít khi đổi.

Mặc định Capacitor NHÚNG tầng web vào APK. Đó là lý do sửa một dòng JavaScript
cũng phải build và cài lại APK.

Nếu trỏ Capacitor vào thẳng URL server (tùy chọn server.url), tầng web được
tải từ server mỗi lần mở app:

- Sửa code web -> deploy server là xong, APK tự có bản mới. KHÔNG cài lại.
- Sửa native -> mới phải build APK mới, việc này rất hiếm.

App của bạn vốn cần mạng mới chạy được nên không mất gì khi tải web từ server.

===== BẮT ĐẦU COPY PROMPT 7 =====

Thêm cơ chế cập nhật cho bản Android đóng gói bằng Capacitor. App không phát hành trên Google Play, người dùng cài APK trực tiếp.

PHẦN A — CHO TẦNG WEB TỰ CẬP NHẬT

A1. Sửa capacitor.config.ts, thêm mục server trỏ vào URL production:
server: {
url: 'https://<domain-production-cua-toi>',
cleartext: false
}
Đọc URL này từ biến môi trường, đừng hardcode, vì bản dev và production khác nhau.

A2. Hệ quả cần xử lý

- localStorage giờ thuộc origin của URL remote, không còn là https://localhost. Dữ liệu localStorage cũ trên máy người dùng sẽ mất sau khi đổi. Chấp nhận được vì đây là bản mới.
- Nếu server không truy cập được, app sẽ trắng màn hình. Thêm màn hình lỗi rõ ràng: "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." kèm nút Thử lại.
- Kiểm tra lại các plugin Capacitor (@capacitor/app, @capacitor/filesystem) vẫn hoạt động sau khi đổi sang server.url.

A3. Ghi chú vào README
Ghi rõ: từ nay sửa code web chỉ cần deploy server. Chỉ build APK mới khi đổi plugin, đổi quyền, hoặc đổi cấu hình native.

PHẦN B — THÔNG BÁO KHI CÓ BẢN APK MỚI

B1. Endpoint phiên bản trong server.ts

- GET /api/app/version, KHÔNG cần đăng nhập, trả về:
  {
  "latestVersionCode": 12,
  "latestVersionName": "1.2.0",
  "minSupportedVersionCode": 10,
  "apkUrl": "https://github.com/<user>/<repo>/releases/download/v1.2.0/app.apk",
  "releaseNotes": "Mô tả ngắn những gì đã sửa"
  }
- Đọc các giá trị này từ biến môi trường hoặc từ một document Firestore để admin đổi được mà không phải deploy lại.

B2. Client kiểm tra phiên bản

- Chỉ chạy khi đang ở bản native. Dùng Capacitor.isNativePlatform() để nhận biết, bản web bỏ qua hoàn toàn.
- Khi app khởi động, dùng App.getInfo() của @capacitor/app lấy versionCode hiện tại, gọi /api/app/version so sánh.

B3. Hai mức thông báo

- NẾU versionCode < minSupportedVersionCode: BẮT BUỘC cập nhật. Màn hình chặn toàn trang, không cho dùng tiếp, chỉ có nút Tải bản mới. Dùng khi có thay đổi phá vỡ tương thích, ví dụ đổi cơ chế xác thực.
- NẾU versionCode < latestVersionCode nhưng >= minSupported: cập nhật tùy chọn. Modal 2 nút: Cập nhật ngay và Để sau. Nhớ lựa chọn "Để sau" trong localStorage theo từng versionCode để không hỏi lại mỗi lần mở app.

B4. Nút Cập nhật

- Mở apkUrl bằng trình duyệt hệ thống. Trình duyệt tải file về, người dùng bấm vào file là Android hiện hộp thoại cài đặt.
- KHÔNG cố tự động cài. Android bắt buộc người dùng xác nhận trừ khi app là system app. Mọi cách lách đều phức tạp và không đáng.
- Hiện kèm hướng dẫn ngắn: "Nếu Android chặn, vào Cài đặt > Ứng dụng > Cài đặt ứng dụng không rõ nguồn gốc và cho phép trình duyệt."

PHẦN C — NƠI ĐẶT FILE APK

- Dùng GitHub Releases. Miễn phí, băng thông không giới hạn, KHÔNG tốn băng thông Cloud Run.
- TUYỆT ĐỐI không đặt file APK trong thư mục public của server. Mỗi lượt tải khoảng 30 MB, 50 người tải là 1,5 GB băng thông cho một lần phát hành.
- Biến môi trường VITE_APK_URL đã có sẵn trong dự án, trỏ nó vào link GitHub Releases.

PHẦN D — RÀ SOÁT

- Chạy tsc --noEmit, sửa hết lỗi.
- Xác nhận bản chạy trên trình duyệt web KHÔNG hiện thông báo cập nhật APK.

===== HẾT PROMPT 7 =====

XONG KHI:
[ ] Sửa một dòng chữ trong app, deploy server, mở lại APK -> thấy ngay thay
đổi mà KHÔNG cài lại APK
[ ] Đặt minSupportedVersionCode cao hơn bản đang cài -> APK hiện màn hình
bắt buộc cập nhật
[ ] Đặt latestVersionCode cao hơn -> hiện modal tùy chọn, bấm "Để sau" thì
lần mở sau không hỏi lại
[ ] Mở trên trình duyệt web -> không có thông báo cập nhật nào

- CẢNH BÁO VỀ KEYSTORE — SAI LÀ KHÔNG SỬA ĐƯỢC \*
  Luôn ký APK bằng CÙNG MỘT KEYSTORE. Android từ chối cài bản cập nhật nếu chữ
  ký khác, người dùng sẽ phải gỡ app cũ rồi cài lại và mất hết dữ liệu cục bộ.
  Sao lưu file keystore và mật khẩu của nó ở nơi an toàn. Mất keystore là mất
  vĩnh viễn khả năng cập nhật cho mọi máy đã cài.

################################################################################

# PHẦN F — DỌN HỆ THỐNG CŨ

################################################################################

================================================================================
BƯỚC 15 — XỬ LÝ APP CŨ
================================================================================
App cũ bạn giữ dùng cá nhân. Nhưng Firestore của nó đang mở hoàn toàn và chứa
hash mật khẩu cùng lịch sử xem của bạn. Làm tối thiểu 3 việc.

== 15.1 ĐỔI MẬT KHẨU ADMIN APP CŨ ==
Mật khẩu Admin@2026! đang nằm hardcode trong bundle JS công khai.
Nếu bạn dùng lại nó ở đâu khác, đổi luôn chỗ đó.

== 15.2 DÁN RULES CẦM MÁU CHO PROJECT FIREBASE CŨ ==
Firebase Console của mail cũ -> Firestore -> Rules -> dán đè -> Publish:

rules_version = '2';
service cloud.firestore {
match /databases/{database}/documents {

    // Chan cung moi thao tac ghi vao accounts.
    // Ngan chiem quyen admin va ngan nguoi la tu tao tai khoan.
    match /accounts/{accountId} {
      allow read: if true;
      allow write: if false;
      match /{sub=**} {
        allow read, write: if true;
      }
    }

    match /customAvatars/{id}       { allow read, write: if true; }
    match /system_apis/{id}         { allow read, write: if true; }
    match /activeSessions/{id}      { allow read, write: if true; }
    match /notifications/{id}       { allow read, write: if true; }
    match /userStats/{id}           { allow read, write: if true; }
    match /userActivityHistory/{id} { allow read, write: if true; }
    match /tvPairCodes/{id}         { allow read, write: if true; }
    match /system_cache/{id}        { allow read, write: if true; }
    match /global/{id}              { allow read, write: if true; }

}
}

VÌ SAO PHẢI BỎ DÒNG WILDCARD: Firestore cộng dồn luật theo kiểu OR. Giữ lại
match /{document=\*\*} rồi thêm luật chặn bên cạnh thì luật chặn vô tác dụng.
Phải bỏ hẳn wildcard và liệt kê từng collection.

Đoạn này tạm làm hỏng việc admin tạo hoặc sửa tài khoản trên app cũ. Khi cần,
đổi allow write: if false thành if true, làm xong đổi lại.

== 15.3 THU HỒI KEY CŨ ==

- Thu hồi TMDB_API_KEY cũ trên themoviedb.org
- Nếu app cũ không cần chạy công khai nữa, tắt hẳn deployment Cloud Run cũ

* ĐÂY LÀ GARÔ, KHÔNG PHẢI CHỮA BỆNH \*
  Dữ liệu trong app cũ vẫn đọc được. Nó chỉ chặn kịch bản tệ nhất là bị chiếm
  quyền admin và bị xóa sạch database. Vì app cũ chỉ mình bạn dùng, như vậy là
  chấp nhận được.

################################################################################

# PHỤ LỤC — SỰ CỐ THƯỜNG GẶP

################################################################################

Triệu chứng Nguyên nhân khả dĩ nhất

---

permission denied ở mọi nơi Chưa publish rules. Quay lại bước 7.
(sau bước 😎

Đăng nhập xong vẫn bị đá ra Document ID của accounts không phải UID.
Xem lại bước 8.

Phim không phát được, Network Thiếu xhrSetup ở Prompt 3 bước 6.
trả 401 ở /api/proxy/m3u8

Thiết bị thứ 3 vẫn vào được app claimSession nằm sai chỗ, phải nằm
trong onAuthStateChanged. Xem bước 10 B4.

Admin mất quyền sau Prompt 6 Chưa đăng xuất đăng nhập lại để token
nhận custom claim. Xem cuối bước 12.

Ảnh poster mất hết Áp requireAuth lên /api/proxy/image.
Thẻ img không gửi được header. Xem
Prompt 3 bước 4.

Tạo user mới thì admin bị đăng xuất Không dùng Firebase app instance thứ hai.
Xem Prompt 2 bước 2.

App trắng màn hình trên APK server.url trỏ sai, hoặc server đang
không truy cập được. Xem bước 14.

Tài khoản hết hạn vẫn đọc được Chưa gắn notExpired() vào rules, hoặc
Firestore chưa gán custom claim expiresAt.
Xem Prompt 6 phần A2.

Gia hạn xong user vẫn bị chặn Chưa gọi revokeRefreshTokens, token cũ
còn claim hết hạn. User đăng nhập lại
là được. Xem Prompt 5 phần A2.2.

KHI BÁO LỖI CHO TÔI, GỬI KÈM:

1. Đang ở bước số mấy
2. Thông báo lỗi NGUYÊN VĂN
3. Tab Network nếu là lỗi mạng
   Đừng chạy prompt tiếp theo khi bước hiện tại chưa đạt. Lỗi sẽ chồng lên nhau
   và rất khó truy.
