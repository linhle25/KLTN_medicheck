# Bộ câu hỏi "sửa giao diện ngay tại chỗ" (frontend MediCheck)

Hội đồng hoặc người hướng dẫn thường thử người làm ra sản phẩm bằng một yêu cầu rất cụ thể: "em đổi chỗ này thành thế kia xem". Bộ câu hỏi này gom các yêu cầu loại đó, mỗi câu kèm **file và dòng cần sửa**, **đoạn mã mẫu**, **nơi dễ bị sót** và **cách kiểm tra**. Vị trí dòng lấy từ mã nguồn ngày 06/11/2026; nếu file thay đổi thì tìm lại theo đoạn chữ ghi trong cột "tìm bằng".

**Cách trả lời khi bị hỏi.** Nói trước ba điều: "em sửa ở file nào", "việc này ảnh hưởng những màn hình nào", "em kiểm tra bằng cách nào". Hội đồng chấm điểm vào việc em biết **phạm vi ảnh hưởng**, không chỉ biết sửa.

**Chạy thử.** Trong thư mục `frontend/`: `npm run dev` (chạy local, tự nạp lại khi lưu file), `npm run lint`, `npm run build`. Backend cần chạy ở `http://localhost:8000` (xem `NEXT_PUBLIC_API_URL` trong [next.config.js](../../frontend/next.config.js)).

**Cấu trúc cần nhớ để chỉ đúng chỗ.**

| Cần tìm | Ở đâu |
| --- | --- |
| Khung và thanh trên của bệnh nhân | [app/(patient)/layout.tsx](../../frontend/app/(patient)/layout.tsx) |
| Khung của dược sĩ / quản trị viên | [app/(pharmacist)/layout.tsx](../../frontend/app/(pharmacist)/layout.tsx), [app/admin/layout.tsx](../../frontend/app/admin/layout.tsx) |
| Phiên đăng nhập (tên, email, vai trò) | [lib/auth.ts](../../frontend/lib/auth.ts) |
| Gọi API | [lib/api.ts](../../frontend/lib/api.ts) |
| Màu, kiểu chữ, khoảng cách | [app/globals.css](../../frontend/app/globals.css) (biến CSS ở đầu file) |
| Thanh điều hướng | [components/Sidebar.tsx](../../frontend/components/Sidebar.tsx) |
| Kết quả tương tác | [components/graph/](../../frontend/components/graph/) |

**Mục lục:** 1 Tên hiển thị · 2 Đổi nhãn chữ · 3 Màu sắc · 4 Giới hạn của khách · 5 Điều hướng · 6 Thông báo miễn trừ · 7 Hành vi hiển thị · 8 Câu hỏi chung về quy trình

---

## 1. Tên hiển thị

### 1.1 "Đổi tên hiển thị trên thanh trên thành email." ★

**Tìm bằng:** `const fullName = session.hoTen.trim()` (có ở 3 layout).

**Ở đâu.** Thanh trên của bệnh nhân [app/(patient)/layout.tsx:76–117](../../frontend/app/(patient)/layout.tsx#L76), của dược sĩ [app/(pharmacist)/layout.tsx:50–69](../../frontend/app/(pharmacist)/layout.tsx#L50), của quản trị viên [app/admin/layout.tsx:76–100](../../frontend/app/admin/layout.tsx#L76). Ba file này lặp cùng một đoạn.

**Cách sửa (bệnh nhân).**

```tsx
// trước
const fullName = session.hoTen.trim() || "Người dùng MediCheck";
const avatarLetter = fullName.split(/\s+/).pop()?.charAt(0).toUpperCase() || "M";
// ...
<span className="patient-header__name">{fullName}</span>
// ...
{fullName} · {session.email}

// sau
const fullName = session.hoTen.trim() || "Người dùng MediCheck";
const displayName = session.email || fullName;          // email nếu có, không thì tên
const avatarLetter = displayName.charAt(0).toUpperCase() || "M";
// ...
<span className="patient-header__name">{displayName}</span>
// ...
{fullName}                                              // tooltip bỏ email vì đã hiện ở trên
```

**Dễ bị sót.**
1. Phải sửa **cả ba layout**, nếu không dược sĩ và quản trị viên vẫn hiện tên.
2. `session.email` có thể rỗng: [lib/auth.ts:44](../../frontend/lib/auth.ts#L44) gán `stored.email ?? ""` khi đọc từ bộ nhớ. Vì vậy phải có `|| fullName` làm phương án dự phòng.
3. Chữ avatar: trước lấy chữ cái cuối của tên, nay lấy chữ đầu của email, nên phải sửa dòng `avatarLetter`.
4. Email dài có thể tràn thanh trên; thêm CSS cắt chữ cho `.patient-header__name` (ví dụ `max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`).
5. `aria-label={`Hồ sơ của ${fullName}`}` là nhãn đọc cho người dùng trình đọc màn hình, không cần đổi.

**Cách làm gọn khi hội đồng hỏi "em có thấy trùng mã không?".** Đưa phần này vào một hàm dùng chung trong [lib/format.ts](../../frontend/lib/format.ts), ví dụ `getDisplayIdentity(session, fallback)` trả về `{ displayName, avatarLetter }`, rồi cả ba layout gọi nó. Lần sau đổi cách hiển thị chỉ sửa một chỗ.

**Kiểm tra.** Đăng nhập lần lượt bằng ba vai trò; làm mới trang (để thử đường đọc lại phiên); thu nhỏ cửa sổ xem email có tràn không.

### 1.2 "Lời chào ở trang chủ bệnh nhân cũng đổi thành email." ★

**Tìm bằng:** `Xin chào, {fullName}` tại [app/(patient)/dashboard/page.tsx:79–88](../../frontend/app/(patient)/dashboard/page.tsx#L79).

Bản máy tính dùng `fullName`, bản điện thoại dùng `shortName` (chữ cuối của họ tên). Với email, `shortName` nên là phần trước dấu `@`:

```tsx
const email = session.email || "";
const fullName = email || session.hoTen.trim() || "bạn";
const shortName = email ? email.split("@")[0] : (session.hoTen.trim().split(/\s+/).pop() || "bạn");
```

**Dễ bị sót:** quên bản điện thoại (dòng 88). **Câu hội đồng có thể hỏi thêm:** "vì sao lời chào dùng email thì lại không thân thiện?" Trả lời: đó là yêu cầu hiển thị; trong sản phẩm thật em để tên vì lời chào bằng tên tự nhiên hơn, còn email dùng ở nơi cần phân biệt tài khoản như trang quản trị.

### 1.3 "Trang quản trị, cột người dùng hiện email trước tên." ★

**Tìm bằng:** `admin-user-cell` tại [app/admin/users/page.tsx:62](../../frontend/app/admin/users/page.tsx#L62). Ô này lấy chữ cái đầu của `user.ho_ten` làm avatar và có `user.email`. Đổi thứ tự hai dòng chữ, và nhớ đổi cả chữ cái avatar cho đồng nhất. Đây là dữ liệu từ API (`ho_ten`, `email`), không cần sửa backend.

### 1.4 "Hiển thị thêm vai trò cạnh tên." ★

Phiên đã có `vaiTro` ([lib/auth.ts:29](../../frontend/lib/auth.ts#L29)), nên chỉ cần dùng ở layout: thêm một thẻ nhỏ như `<span className="patient-header__role">Bệnh nhân</span>`. Không cần gọi thêm API.

---

## 2. Đổi nhãn chữ

### 2.1 "Đổi 'Nghiêm trọng' thành 'Nặng' ở toàn bộ giao diện." ★★

**Tìm bằng:** `Nghiêm trọng`. Nhãn ở dải đếm mức độ nằm tại [components/graph/SeverityCountStrip.tsx:4](../../frontend/components/graph/SeverityCountStrip.tsx#L4). Chỉ sửa `label`, **không đổi `key: "nang"`**, vì khóa này trùng với dữ liệu từ backend (`nang`, `trung_binh`, `nhe`, `chua_phan_loai`).

**Dễ bị sót.** Chữ này có thể xuất hiện ở nhiều nơi: chú thích trong đồ thị, tooltip, tab chi tiết, cảnh báo. Chạy `Ctrl+Shift+F` tìm cả `Nghiêm trọng`, `nghiêm trọng`, `Nặng` trong `frontend/`. Cẩn thận phân biệt nhãn mức độ với câu như "Chưa phát hiện cảnh báo nghiêm trọng" ở trang lịch sử, vì đó là câu văn thường, có thể không cần đổi.

**Nguyên tắc hội đồng muốn nghe:** nhãn hiển thị tách khỏi **khóa dữ liệu**. Đổi nhãn thì sửa giao diện; đổi khóa thì phải sửa cả backend và dữ liệu.

### 2.2 "Đổi nút 'Nhờ dược sĩ xác nhận' thành 'Hỏi dược sĩ'." ★

**Tìm bằng:** `Nhờ dược sĩ xác nhận`, tại [components/PharmacistReviewPrompt.tsx:227](../../frontend/components/PharmacistReviewPrompt.tsx#L227) và có thể thêm ở tiêu đề khung. Sửa chữ, nhưng nhớ kịch bản thuyết trình ([KichBan_ThuyetTrinh_LuongHeThong.md](KichBan_ThuyetTrinh_LuongHeThong.md)) đang nhắc tên cũ, nên đổi cả ở đó cho khớp.

### 2.3 "Đổi 'Cần xử lý gấp' thành 'Ưu tiên cao' ở trang dược sĩ." ★

**Tìm bằng:** `Cần xử lý gấp`, có **ba chỗ** trong [app/(pharmacist)/pharmacist-dashboard/page.tsx](../../frontend/app/(pharmacist)/pharmacist-dashboard/page.tsx): nhãn thẻ thống kê (dòng 100), tiêu đề mục (dòng 118), và nhãn trong từng dòng (dòng 149). Chỉ đổi một chỗ là giao diện bị lệch nhau.

### 2.4 "Đổi chữ nút 'Tra cứu ngay' ở trang chủ." ★

**Tìm bằng:** `Tra cứu ngay` tại [app/page.tsx:295](../../frontend/app/page.tsx#L295). Một chỗ duy nhất.

### 2.5 "Đổi lời chào hay lời cảm ơn khi đăng xuất." ★

Nằm ngay trong hàm `logout()` ở [app/(patient)/layout.tsx](../../frontend/app/(patient)/layout.tsx) (thông báo "Đã đăng xuất / Hẹn gặp lại bạn tại MediCheck."). Layout dược sĩ và quản trị viên có hàm riêng, nên kiểm tra cả hai.

### 2.6 "Đổi chữ 'Xin chào' ở trang chủ thành 'Chào mừng trở lại'." ★

"Trang chủ" có thể là **ba trang khác nhau**, nên hỏi lại hội đồng hoặc nêu rõ em đang sửa trang nào:

| Trang | File | Dòng |
| --- | --- | --- |
| Trang chủ **bệnh nhân** sau đăng nhập | [app/(patient)/dashboard/page.tsx](../../frontend/app/(patient)/dashboard/page.tsx#L87) | 87 (bản máy tính) và 88 (bản điện thoại) |
| Trang chủ **dược sĩ** | [app/(pharmacist)/pharmacist-dashboard/page.tsx](../../frontend/app/(pharmacist)/pharmacist-dashboard/page.tsx#L57) | 57 |
| Trang chủ **công khai** (khách) | [app/page.tsx](../../frontend/app/page.tsx) | tiêu đề `<h1>` ở khoảng dòng 398 và 409; không có chữ "Xin chào" |

```tsx
// trước (bệnh nhân)
<span className="dashboard-title__desktop">Xin chào, {fullName}</span>
<span className="dashboard-title__mobile">Xin chào, {shortName}</span>

// sau
<span className="dashboard-title__desktop">Chào mừng trở lại, {fullName}</span>
<span className="dashboard-title__mobile">Chào mừng trở lại, {shortName}</span>
```

**Dễ bị sót.**
1. Bệnh nhân có **hai dòng** (máy tính và điện thoại), chỉ sửa một dòng thì thu nhỏ cửa sổ sẽ lộ ra chữ cũ.
2. Dược sĩ có chữ riêng ở dòng 57 và dùng `session.hoTen` thẳng, không qua `fullName` như bệnh nhân.
3. Chữ "Chào mừng" ở [app/auth/page.tsx:113–114](../../frontend/app/auth/page.tsx#L113) là **thông báo sau khi đăng nhập hoặc đăng ký**, là chữ khác, nên không đổi theo; hỏi hội đồng có muốn đổi luôn không.
4. Kiểm tra bằng cách tìm `Xin chào` trong `frontend/` (có đúng ba kết quả ở hai trang dashboard).

### 2.7 "Highlight (làm nổi bật) một từ hoặc một cụm trong câu." ★★

Có hai nhu cầu khác nhau, đừng nhầm:

**(a) Làm nổi bật một từ cố định trong giao diện** (ví dụ tô màu chữ "an toàn" trong dòng phụ đề). Bọc từ đó trong một thẻ có lớp CSS riêng rồi tạo lớp đó trong `globals.css`:

```tsx
// dashboard/page.tsx, dòng phụ đề
<p className="dashboard-subtitle">
  Hãy dành vài phút kiểm tra đơn thuốc để dùng thuốc <mark className="text-highlight">an toàn</mark> và yên tâm hơn mỗi ngày.
</p>
```

```css
/* thêm cuối app/globals.css */
.text-highlight {
  background: none;            /* <mark> mặc định có nền vàng, nên reset nếu không muốn nền */
  color: var(--primary);       /* hoặc: background: #fff3bf; để tô nền vàng như bút dạ */
  font-weight: 700;
}
```

Muốn **tô nền như bút dạ** thì bỏ dòng `background: none` và đặt `background: #fff3bf; padding: 0 4px; border-radius: 4px;`. Dùng biến màu có sẵn (`--primary`, `--severe`...) thay vì mã màu viết cứng để chế độ tối vẫn hợp; nếu dùng nền sáng cố định thì kiểm tra lại ở chế độ tối.

**(b) Highlight do hệ thống tạo ra** (cụm từ in đậm xanh trong đoạn "Tóm tắt tổng quan" của kết quả tương tác). Đây là chức năng đã có: backend trả về danh sách cụm cần nhấn mạnh, giao diện dựng ở [components/graph/InteractionOverview.tsx](../../frontend/components/graph/InteractionOverview.tsx) (hàm `renderOverviewText`), và kiểu nằm ở lớp `.overview-highlight` ([globals.css:1515](../../frontend/app/globals.css#L1515)): `font-weight: 700; color: var(--primary);`. Muốn **đổi cách nó trông** (ví dụ tô nền vàng) chỉ sửa lớp CSS này, không đụng mã React. Muốn **đổi cụm nào được nhấn mạnh** thì phải sửa ở backend (`rollup_explain.py`), vì danh sách cụm do đó sinh ra; đây là điểm hội đồng có thể hỏi "chỉ sửa giao diện được không".

**Câu trả lời mẫu.** "Em sửa ở hai chỗ: thẻ bọc từ trong component, và lớp CSS trong globals.css. Em tách kiểu ra lớp riêng để dùng lại, và dùng biến màu để chế độ tối không bị lệch."

**Dễ bị sót.** Có nhiều lớp CSS đè lên nhau trong `globals.css` (ví dụ tiêu đề dashboard bị khai báo lại ở nhiều dòng như 2295, 6228, 7610), nên nếu sửa một lớp mà giao diện không đổi, mở công cụ kiểm tra của trình duyệt (F12), chọn phần tử và xem quy tắc nào đang thắng. Có thể cần đặt lớp mới ở cuối file hoặc nâng độ ưu tiên.

---

## 3. Màu sắc và giao diện

### 3.1 "Đổi màu của mức 'nặng' từ đỏ sang cam đậm." ★★

Màu được khai báo bằng biến CSS ở đầu [app/globals.css](../../frontend/app/globals.css): `--severe: #d52b1e;` và `--severe-container`. Đổi giá trị biến thì mọi nơi dùng biến sẽ đổi theo.

**Dễ bị sót.**
1. Có nơi dùng màu viết cứng (ví dụ mã `#…` trực tiếp) thay vì biến; tìm `d52b1e` và các mã đỏ khác trong `globals.css` và các file `.tsx`.
2. Chế độ tối (`html[data-theme="dark"]`) có bộ màu riêng.
3. Đồ thị tương tác ([components/graph/InteractionGraphView.tsx](../../frontend/components/graph/InteractionGraphView.tsx)) có thể tô màu cạnh bằng giá trị trong mã, không qua CSS, nên kiểm tra riêng.
4. Màu mức độ phải vẫn phân biệt được giữa nặng, trung bình, nhẹ, và đủ tương phản; không dùng riêng màu để truyền thông tin (đã có nhãn chữ kèm theo).

### 3.2 "Đổi màu chủ đạo của ứng dụng sang xanh lá." ★★

Biến `--primary`, `--primary-container`, `--primary-fixed` ở đầu `globals.css` (khoảng dòng 16–20). Lưu ý file CSS này **khai báo lại các biến ở nhiều chỗ** (ví dụ khoảng dòng 2049 và 6085), nên đổi một nơi có thể chưa đủ; tìm `--primary:` trong cả file.

### 3.3 "Bật nút chuyển chế độ sáng/tối." ★

Trong [app/(patient)/layout.tsx](../../frontend/app/(patient)/layout.tsx) có dòng `{/* <ThemeModeToggle /> */}` đang bị tắt bằng chú thích. Bỏ chú thích là hiện nút. **Dễ bị hỏi:** vì sao đang tắt? Trả lời đúng với thực tế: chế độ tối chưa được rà soát đủ trên mọi trang, nên em để tắt trong bản nộp. *(Chỉ nói vậy nếu đúng; nếu lý do khác thì nói lý do thật.)*

### 3.4 "Đổi phông chữ." ★

Phông được chọn ở [app/layout.tsx](../../frontend/app/layout.tsx) và biến CSS `font-family` trong `globals.css`. Cần chọn phông **có hỗ trợ tiếng Việt**, không thì dấu bị hiện bằng phông dự phòng.

---

## 4. Giới hạn của khách

### 4.1 "Cho khách tra tối đa 5 thuốc thay vì 3." ★★

**Tìm bằng:** `next.length >= 3` tại [app/page.tsx:195](../../frontend/app/page.tsx#L195). Sửa thành `>= 5`.

**Dễ bị sót.**
1. Có thể còn chữ "3 thuốc" ở trang chủ, trong thông báo và trong đoạn mời đăng nhập (khoảng dòng 363); tìm `3 thuốc` và `ba thuốc`.
2. **Giới hạn này chỉ có ở giao diện.** Nếu backend cũng giới hạn thì phải sửa cả hai, nếu không người dùng gọi thẳng API vẫn qua mặt được giới hạn giao diện. Câu trả lời đúng khi bị hỏi: "giới hạn ở giao diện là để hướng dẫn người dùng, kiểm soát thật phải ở backend". *(Cần kiểm tra backend có chặn không trước khi nói.)*
3. Tài liệu em đã viết (kịch bản thuyết trình, mục 2) ghi "tối đa 3 thuốc" và ví dụ Đơn 1 vừa đúng 3 thuốc; đổi số thì phải sửa kịch bản.

---

## 5. Điều hướng

### 5.1 "Đổi tên mục 'Lịch sử' thành 'Lịch sử kiểm tra'." ★

Chữ này nằm ở [components/Sidebar.tsx:153](../../frontend/components/Sidebar.tsx#L153). Thanh dưới `BottomNav` đã bị xóa, nhưng thanh bên của dược sĩ ([app/(pharmacist)/layout.tsx](../../frontend/app/(pharmacist)/layout.tsx)) và quản trị viên ([app/admin/layout.tsx](../../frontend/app/admin/layout.tsx)) có menu riêng, nên nếu đổi nhãn dùng chung phải kiểm tra cả ba. Tương tự mục "Hồ sơ" ([Sidebar.tsx:104](../../frontend/components/Sidebar.tsx#L104)).

### 5.2 "Thêm một mục mới vào thanh bên, ví dụ 'Hướng dẫn'." ★★★

Phải làm đủ bốn việc: (1) tạo trang mới, ví dụ `app/(patient)/guide/page.tsx`; (2) thêm liên kết ở `Sidebar.tsx`; (3) kiểm tra menu hiển thị trên điện thoại (thanh bên mở dạng ngăn kéo); (4) kiểm tra hàm xác định mục đang chọn (`isActive("/…")` trong `Sidebar.tsx`) để mục sáng đúng. Vì trang nằm trong nhóm `(patient)` nên tự được bảo vệ bởi layout kiểm tra phiên, nhưng quyền theo vai trò vẫn nên kiểm tra.

### 5.3 "Đổi trang đích sau khi đăng nhập." ★★

Điều hướng sau đăng nhập nằm trong [app/auth/page.tsx](../../frontend/app/auth/page.tsx), thường dựa theo `vaiTro`. Đổi đích ở đó, và thử cả ba vai trò vì mỗi vai trò đến một trang khác nhau.

---

## 6. Thông báo miễn trừ trách nhiệm

### 6.1 "Đổi nội dung câu lưu ý 'chỉ mang tính tham khảo'." ★★

[components/Disclaimer.tsx](../../frontend/components/Disclaimer.tsx) lấy chữ từ `ds.components.disclaimer.text`, tức file [design-system.json](../../frontend/design-system.json), không viết cứng trong component. Sửa chữ ở file JSON. Đây là chữ liên quan an toàn, nên khi hội đồng đề nghị **rút gọn hoặc bỏ**, nên trả lời rằng em giữ lại vì đó là một phần của nguyên tắc "không thay thế dược sĩ", và chỉ sẵn sàng đổi cách diễn đạt, không bỏ.

**Dễ bị sót:** câu lưu ý ở **phần tóm tắt tổng quan** do backend sinh ra (lời nhắc cố định) nằm ở backend, không ở file này.

---

## 7. Hành vi hiển thị

### 7.1 "Chỉ hiện khung 'Nhờ dược sĩ' khi có cảnh báo nặng." ★★★

Đây là đề xuất em đã nêu khi thảo luận câu hỏi về vòng dược sĩ. Khung nằm ở [components/PharmacistReviewPrompt.tsx](../../frontend/components/PharmacistReviewPrompt.tsx). Cần biết kết quả có cặp nặng hay không: dữ liệu tương tác của lượt kiểm tra có mức `nang`; component cha truyền một cờ (ví dụ `hasSevere`) xuống, và nút chỉ hiện (hoặc nổi bật) khi cờ bật. Cần quyết định: **ẩn hẳn** hay **làm mờ** khi không có cảnh báo nặng? Em nghiêng về làm mờ kèm chữ "Bạn vẫn có thể hỏi dược sĩ", vì ẩn hẳn khiến người đang lo lắng không có chỗ hỏi.

### 7.2 "Đổi định dạng ngày giờ." ★

Mọi chỗ hiển thị đều đi qua [lib/datetime.ts](../../frontend/lib/datetime.ts) (`formatVietnameseDateTime`). Sửa tại đây thì đổi toàn bộ; đừng sửa từng trang. Riêng ô chọn ngày sinh ở khung nhờ dược sĩ là `<input type="date">` của trình duyệt, nên hiện `mm/dd/yyyy` theo ngôn ngữ của trình duyệt chứ không theo mã của em. Muốn ra `dd/mm/yyyy` thì phải dùng ô nhập tự viết hoặc thư viện chọn ngày.

### 7.3 "Hiển thị mỗi trang lịch sử 5 lượt thay vì toàn bộ." ★★

Hiện trang [app/(patient)/history/page.tsx](../../frontend/app/(patient)/history/page.tsx) lọc theo trạng thái ở phía giao diện (nút "Tất cả" ở dòng 98). Thêm phân trang: lấy `items.slice(page*5, page*5+5)` và hai nút trang. Nếu dữ liệu lớn, phân trang nên làm ở backend; với số lượt kiểm tra của một bệnh nhân, làm ở giao diện là đủ.

### 7.4 "Thêm lọc theo mức độ vào trang lịch sử." ★★

Cần backend trả về mức nặng nhất của mỗi lượt (hoặc cờ `has_severe`). Nếu API đã trả, chỉ cần thêm một nhóm nút lọc cạnh nhóm lọc trạng thái. Nếu chưa, phải sửa cả backend; đó là câu trả lời cần nói rõ khi bị hỏi "chỉ sửa giao diện được không".

---

## 8. Câu hỏi chung về quy trình

| Câu hỏi | Trả lời ngắn |
| --- | --- |
| Em sửa xong làm sao biết không làm hỏng chỗ khác? | Chạy `npm run lint` và `npm run build` để bắt lỗi kiểu và cú pháp; mở lại các màn hình bị ảnh hưởng bằng cả ba vai trò và ở cả màn hình hẹp (điện thoại). Em tìm toàn bộ chuỗi chữ bằng tìm kiếm trong dự án để không sót chỗ lặp. |
| Vì sao có đoạn mã lặp ở ba layout? | Do ba vai trò phát triển dần. Hướng cải thiện là gom vào một hàm hoặc thành phần dùng chung, như đã nêu ở mục 1.1. |
| Đổi giao diện có cần sửa backend không? | Không nếu dữ liệu đã có sẵn trong phản hồi API, như tên, email, vai trò, mức độ. Cần sửa backend khi phải thêm trường mới, đổi khóa dữ liệu hay áp quy tắc kiểm soát (ví dụ giới hạn 3 thuốc). |
| Sửa xong, lên web thật như thế nào? | Đẩy mã lên GitHub; luồng CD tự triển khai (giao diện lên Vercel, backend lên Render). Em kiểm tra trên bản local trước, rồi đối chiếu bản đã triển khai. |
| Làm sao để chữ trên giao diện dễ đổi hơn? | Hiện chữ viết trực tiếp trong từng component (trừ nội dung lưu ý). Hướng cải thiện là gom chữ vào một file chung (hoặc dùng thư viện đa ngôn ngữ), để đổi tên một nhãn chỉ cần sửa một chỗ. |
| Phiên đăng nhập lưu ở đâu? Đổi email hiển thị có lộ thông tin không? | Phiên nằm trong cookie HttpOnly; phần giao diện chỉ giữ thông tin hiển thị (`hoTen`, `email`, `vaiTro`). Email chỉ hiện cho chính người đăng nhập, nên hiển thị nó trên thanh trên không lộ thêm thông tin nào với người khác; cần chú ý khi chụp màn hình để trình chiếu. |

---

## Danh sách việc nên luyện (thứ tự ưu tiên)

1. **1.1** đổi tên hiển thị thành email (ví dụ chính, dễ bị hỏi nhất), làm đủ ba layout.
2. **4.1** đổi giới hạn khách 3 thành 5, và biết giới hạn thật nằm ở backend hay giao diện.
3. **2.1** đổi nhãn mức độ mà không đổi khóa dữ liệu.
4. **5.1** đổi nhãn ở cả thanh bên và thanh dưới.
5. **3.1** đổi màu mức độ qua biến CSS, nhớ chế độ tối.
6. **7.1** khung dược sĩ theo cảnh báo nặng, để trả lời nhất quán với phần thảo luận vòng dược sĩ.

**Điểm em cần tự xác nhận trước khi dùng các câu trả lời trên:** (a) backend có chặn giới hạn 3 thuốc của khách không (4.1); (b) lý do thật khiến nút `ThemeModeToggle` đang bị tắt (3.3); (c) màu đồ thị tương tác có dùng giá trị viết cứng không (3.1); (d) component cha có truyền cờ cảnh báo nặng xuống khung dược sĩ chưa (7.1).
