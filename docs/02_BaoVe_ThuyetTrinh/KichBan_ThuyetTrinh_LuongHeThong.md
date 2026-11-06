# Kịch bản thuyết trình luồng hệ thống MediCheck (theo hành trình người dùng, kèm 2 đơn thuốc mẫu)

Dành cho phần trình bày và demo luồng hệ thống trong buổi bảo vệ khóa luận, khoảng 14–15 phút. Viết ngôi thứ nhất, giọng trang trọng. Mỗi phần có **[Màn hình]** (cần chiếu gì), lời thoại trong ngoặc kép và **câu nối**.

**Trình tự:** Khách (trang chủ) → Đăng ký/đăng nhập → Bệnh nhân (từng trang) → Dược sĩ (từng trang) → Quay lại bệnh nhân nhận kết quả → Tổng kết.

Ví dụ xuyên suốt dùng [hai_don_thuoc.png](../../don_thuoc_mau/hai_don_thuoc.png). Hai đơn là **cùng một bệnh nhân nam 62 tuổi**, do hai nơi khác nhau kê/bán:

| | Đơn 1 – Phòng khám An Tâm (20/10/2026) | Đơn 2 – Nhà thuốc Sức Khỏe Vàng (02/11/2026) |
| --- | --- | --- |
| Chẩn đoán | Tăng huyết áp (I10), rối loạn lipid máu (E78.5) | Cảm cúm: sốt, đau đầu, đau họng, sổ mũi |
| Thuốc | Lovastatin 20mg, Amlodipin 5mg, Aspirin 81mg | Ibuprofen 400mg, Cetirizin 10mg, Acetylcystein 200mg, Dextromethorphan 15mg |

Ý chính của ví dụ: **từng đơn nhìn riêng thì ổn, nhưng khi bệnh nhân uống cùng lúc thì xuất hiện cảnh báo mà không bác sĩ hay dược sĩ nào nhìn thấy**, vì mỗi người chỉ thấy một đơn.

Đơn 1 có đúng 3 thuốc, vừa bằng giới hạn tra cứu của khách (tối đa 3 thuốc). Đơn 2 có 4 thuốc, nên vừa hay để minh họa lý do phải đăng nhập.

## Kết quả thực tế đã chạy thử (để nói và để đối chiếu khi demo)

Tôi đã chạy hai đơn qua agent 5 node và các hàm tra thực phẩm/bệnh nền trên CSDL thật ngày 05/11/2026.

**Đơn 1 chạy riêng (Lovastatin, Amlodipine, Aspirin):**

| Cặp | Kết quả |
| --- | --- |
| Aspirin × Amlodipine | **Trung bình**: thuốc ức chế COX có thể làm giảm tác dụng hạ huyết áp của thuốc chẹn kênh canxi |
| Lovastatin × Aspirin | Chưa phân loại (DDInter ghi N/A) |
| Lovastatin × Amlodipine | Không có dữ liệu trong DDInter (cờ "không đủ dữ liệu", **không bịa**) |
| Thuốc–thực phẩm | Lovastatin × nước ép bưởi: **nặng**; Lovastatin × rượu và Aspirin × rượu: trung bình; Amlodipine × nước bưởi: nhẹ |
| Thuốc–bệnh nền | Aspirin: bệnh thận, hen suyễn, loét dạ dày (nặng); Lovastatin: bệnh gan, bệnh thận (nặng) |

**Đơn 2 chạy riêng (Ibuprofen, Cetirizine, Acetylcysteine, Dextromethorphan):**

| Cặp | Kết quả |
| --- | --- |
| Cetirizine × Ibuprofen, Acetylcysteine × Ibuprofen, Acetylcysteine × Cetirizine, Dextromethorphan × Ibuprofen | Chưa phân loại |
| Dextromethorphan × Cetirizine, Dextromethorphan × Acetylcysteine | Không có dữ liệu |
| Không có cặp nào ở mức nhẹ/trung bình/nặng | `has_severe = False` |
| Thuốc–thực phẩm | Ibuprofen × rượu, Cetirizine × rượu, Dextromethorphan × rượu: trung bình |
| Thuốc–bệnh nền | Ibuprofen × **tăng huyết áp**: trung bình; Ibuprofen × loét dạ dày, bệnh thận, hen suyễn: nặng |

**Gộp cả 7 thuốc (uống cùng lúc), `has_severe = True`:**

| Cặp | Mức độ | Ý nghĩa |
| --- | --- | --- |
| **Aspirin × Ibuprofen** | **Nặng** | Ibuprofen cạnh tranh gắn COX tiểu cầu, có thể **làm mất tác dụng bảo vệ tim mạch của aspirin liều thấp** |
| Amlodipine × Ibuprofen | Trung bình | NSAID làm giảm tác dụng hạ áp của amlodipin |
| Aspirin × Amlodipine | Trung bình | như trên |

Cặp nặng này không xuất hiện ở đơn nào khi chạy riêng. Đó là điểm nhấn của toàn bộ phần thuyết trình.

### Hai điều phải xử lý trước khi lên demo

1. **Cách gõ tên thuốc.** Khi tôi gửi thẳng chuỗi "Amlodipin", "Cetirizin", "Acetylcystein" vào agent thì `normalize` không khớp, còn "Amlodipine", "Cetirizine", "Acetylcysteine" thì khớp. Trên giao diện, người dùng phải **chọn thuốc từ danh sách gợi ý** (ô tìm kiếm không cho gõ tự do), nên cần **chạy thử trước** cả 7 thuốc trên giao diện thật và ghi lại đúng tên gợi ý sẽ chọn khi demo.
2. **Một dòng dữ liệu đáng ngờ.** Với Lovastatin, bảng thuốc–thực phẩm có dòng "trà xanh" nhưng nội dung mô tả lại nói về nước ép bưởi. **Đừng bấm vào dòng này khi demo**; nên kiểm tra và sửa dữ liệu nguồn.

Các cặp "chưa phân loại" và "không có dữ liệu" là dữ liệu thật của DDInter, nên đó cũng là chỗ để minh họa nguyên tắc "thiếu dữ liệu thì báo thiếu, không suy đoán".

---

## Phần 0 – Mở đầu bằng tình huống (1 phút)

**[Màn hình]** Ảnh hai đơn thuốc cạnh nhau.

"Em xin kính chào quý thầy cô. Em xin trình bày luồng hoạt động của MediCheck bằng một tình huống cụ thể, và đi theo đúng hành trình của người dùng: từ lúc là khách, đến khi đăng nhập, rồi đến phía dược sĩ.

Đây là hai đơn thuốc của **cùng một bác nam 62 tuổi**. Đơn bên trái do bác sĩ phòng khám An Tâm kê ngày 20/10 để điều trị tăng huyết áp và rối loạn lipid máu: Lovastatin, Amlodipin và Aspirin liều thấp. Đơn bên phải do dược sĩ nhà thuốc tư vấn ngày 02/11 khi bác bị cảm cúm: Ibuprofen, Cetirizin, Acetylcystein và Dextromethorphan (thuốc ho).

Mỗi người chỉ thấy đơn của mình, và với từng đơn thì không có gì bất thường. Nhưng người uống cả bảy loại thuốc lại chỉ có một. Câu hỏi của em là: **làm sao phát hiện rủi ro nằm giữa hai đơn?**"

**Câu nối:** "Trước khi vào giao diện, em xin nói nguyên tắc thiết kế ở phía sau, để quý thầy cô hiểu vì sao mỗi bước hoạt động như vậy."

## Phần 1 – Nguyên tắc và kiến trúc tóm tắt (1 phút)

**[Màn hình]** Sơ đồ mục 1 của [architecture.md](../04_KyThuat/architecture.md), hoặc một dòng luồng: Giao diện Next.js → API FastAPI → Agent LangGraph 5 node → Supabase Postgres → LLM diễn giải.

"Nguyên tắc cốt lõi là **tách tra cứu khỏi diễn giải**. Mọi cặp tương tác đều đến từ cơ sở dữ liệu DDInter 2.0, gồm 160.227 cặp thuốc–thuốc, 803 tương tác thuốc–thực phẩm và 7.672 tương tác thuốc–bệnh nền. Agent LangGraph có năm node và cả năm đều tất định, không node nào gọi mô hình ngôn ngữ. Mô hình chỉ vào cuộc sau cùng để diễn giải dữ liệu đã tra, và mọi đoạn nó viết đều qua guardrail. Cuối cùng là dược sĩ xác nhận. Em sẽ chỉ ra từng thành phần này đúng lúc nó xuất hiện trên giao diện."

**Câu nối:** "Bây giờ em xin bắt đầu với một người chưa có tài khoản, vào trang chủ."

## Phần 2 – Khách: trang chủ và tra cứu nhanh (1 phút 30 giây)

**[Màn hình]** Trang chủ [app/page.tsx](../../frontend/app/page.tsx): phần giới thiệu, ô tìm kiếm, các tính năng.

"Khi chưa đăng nhập, người dùng thấy trang chủ giới thiệu ba tính năng: kiểm tra tương tác, đồ thị tương tác trực quan, và hỗ trợ chuyên gia. Ở giữa là ô tra cứu nhanh, không cần tài khoản.

Em nhập Đơn 1. Em gõ từng tên và **chọn thuốc từ danh sách gợi ý**; hệ thống không cho gõ tự do, vì đó là cách bảo đảm tên thuốc khớp với cơ sở dữ liệu. Danh sách gợi ý đến từ bước phân giải biệt dược sang hoạt chất, dựa trên bảng sản phẩm Việt Nam, hiện khớp được 41.302 trên 68.562 sản phẩm.

Em chọn Lovastatin, Amlodipin, Aspirin rồi bấm 'Tra cứu ngay'. Agent chạy và trả kết quả ngay trên trang: một cảnh báo **trung bình** giữa Aspirin và Amlodipine, một cặp 'chưa phân loại', và một cặp không đủ dữ liệu.

Khách có hai giới hạn có chủ đích. Một, **tối đa 3 thuốc**. Nếu em thêm thuốc thứ tư, hệ thống nhắc đăng nhập. Hai, kết quả của khách **không được lưu** và không thể gửi dược sĩ, vì cần biết ai là người gửi thì mới có phản hồi."

**Câu nối:** "Đơn 2 có bốn thuốc, và bác còn muốn lưu lại, nên bác cần một tài khoản."

## Phần 3 – Đăng ký và đăng nhập (1 phút 30 giây)

**[Màn hình]** Trang [app/auth/page.tsx](../../frontend/app/auth/page.tsx): hai tab Đăng nhập / Tạo tài khoản mới, nút Google, ô chứng chỉ hành nghề khi chọn vai trò dược sĩ.

"Trang xác thực có hai hình thức: đăng ký bằng email, hoặc đăng nhập bằng Google. Email đăng ký phải được **xác minh bằng thư gửi qua Gmail API**; với Google, email đã được Google xác minh nên người dùng chỉ cần chọn vai trò. Có thêm luồng quên và đặt lại mật khẩu.

Khi đăng ký, người dùng chọn vai trò. **Bệnh nhân** vào được ngay. **Dược sĩ** phải khai số chứng chỉ hành nghề và nơi công tác, và tài khoản ở trạng thái chờ cho đến khi quản trị viên duyệt, vì dược sĩ là người đưa ra xác nhận chuyên môn nên em không để ai tự xưng là dược sĩ. Quản trị viên có trang riêng để duyệt dược sĩ, quản lý người dùng, danh mục thuốc và phản hồi.

Về bảo mật, mật khẩu được băm Argon2, phiên là JWT trong cookie HttpOnly có refresh token xoay vòng, kèm CSRF token cho mọi thao tác ghi. Hệ thống phân quyền theo ba vai trò, nên bệnh nhân không thể vào trang dược sĩ và ngược lại."

**Câu nối:** "Bác đăng nhập bằng tài khoản bệnh nhân. Em xin lần lượt giới thiệu từng trang mà bác nhìn thấy, theo thanh điều hướng bên trái."

## Phần 4 – Bệnh nhân: giới thiệu từng trang (5 phút)

Thanh điều hướng của bệnh nhân gồm: **Trang chủ, Hồ sơ, Đơn thuốc của tôi, Tương tác, Lịch sử**. Chuông thông báo nằm ở thanh trên.

### 4.1 Trang chủ bệnh nhân (30 giây)

**[Màn hình]** [dashboard/page.tsx](../../frontend/app/(patient)/dashboard/page.tsx).

"Trang đầu tiên là trang chủ. Hệ thống chào bác theo tên, có linh vật Cáo Medi nhắc những lưu ý an toàn. Trang hiển thị số thuốc đang theo dõi, danh sách đơn thuốc đang lưu, vài lần kiểm tra gần đây, và đặc biệt là **thông báo 'Cập nhật từ dược sĩ'**. Khi dược sĩ xác nhận xong, bác sẽ thấy ở đây. Từ đây bác bấm sang trang tra cứu tương tác."

### 4.2 Hồ sơ (1 phút)

**[Màn hình]** [profile/page.tsx](../../frontend/app/(patient)/profile/page.tsx), tab thông tin cá nhân.

"Trang Hồ sơ có hai phần. Phần **thông tin cá nhân** gồm họ tên, giới tính, tuổi, cân nặng, chiều cao, rồi **tiền sử y tế**: bệnh lý nền được chọn từ danh mục chuẩn (gõ ít nhất hai ký tự để tìm), ghi chú bệnh khác, dị ứng thuốc, và tình trạng mang thai hoặc cho con bú.

Bác khai **tăng huyết áp** và **rối loạn lipid máu**. Thông tin này không để chẩn đoán. Nó dùng để **lọc tương tác thuốc–bệnh nền**, nên về sau bác chỉ thấy cảnh báo liên quan đến bệnh của mình thay vì hàng chục cảnh báo chung chung. Nếu bác chưa khai, hệ thống quay về chế độ tổng quát và hiện cả danh sách rộng, kèm lời nhắc cập nhật hồ sơ."

### 4.3 Đơn thuốc của tôi (1 phút)

**[Màn hình]** Tab đơn thuốc, `/profile?tab=prescriptions`.

"Trang này quản lý các đơn đang dùng: thêm đơn, đổi tên, xóa đơn, thêm thuốc vào đơn. Em tạo **hai đơn**: 'Đơn An Tâm 20/10' và 'Đơn nhà thuốc 02/11', mỗi đơn thêm đúng các thuốc in trên đơn giấy, chọn thuốc từ danh sách gợi ý.

Đây là điểm đặc biệt của hệ thống: **một người có nhiều đơn, và hệ thống coi tất cả đơn là một danh sách thuốc đang dùng**. Vì cùng một người uống, rủi ro nằm cả bên trong lẫn giữa các đơn. Nhấn vào từng thuốc, bác xem được trang **chi tiết thuốc**: tên, dạng bào chế, thời gian uống, hướng dẫn sử dụng và lịch sử dùng thuốc gần đây."

### 4.4 Tương tác: nơi agent chạy (2 phút) — phần trọng tâm

**[Màn hình]** [interaction/page.tsx](../../frontend/app/(patient)/interaction/page.tsx): bảng đơn thuốc, nút 'Nhập từ hồ sơ', nút 'Thêm đơn thuốc', 'Phân tích tương tác'.

"Đây là trang kiểm tra. Em nhập hai đơn từ hồ sơ chỉ bằng một nút, rồi bấm **Phân tích tương tác**. Lúc này backend điều phối agent LangGraph. Mỗi node ghi vào một trạng thái chung `MedCheckState`, và node nào lỗi thì đồ thị dừng sớm.

- **`normalize`**: đổi 7 tên thuốc về hoạt chất chuẩn kèm mã DDInter. Aspirin thành Acetylsalicylic acid.
- **`lookup`**: với 7 hoạt chất có 21 cặp, truy vấn SQL từng cặp. Chỉ ba cặp có mức độ rõ ràng.
- **`rank`**: ánh xạ về bốn bậc nhẹ, trung bình, nặng, chưa phân loại và đặt cờ có cảnh báo nặng. Đó chỉ là một bảng ánh xạ.
- **`explain`**: gắn mô tả gốc, bản dịch tiếng Việt đã lưu và nguồn trích dẫn.
- **`guardrail`**: đoạn nào thiếu nguồn trích dẫn thì chặn, và lọc câu khuyên tự ý đổi, ngừng hay chỉnh liều.

Song song, hệ thống tra **thuốc–thực phẩm** và **thuốc–bệnh nền** bằng SQL, lọc theo hai bệnh nền bác đã khai. Sau đó DeepSeek mới được gọi, để diễn giải theo từng thuốc, tóm tắt tổng quan, giải thích thực phẩm và bệnh nền. Bốn nhánh này chạy song song bằng `asyncio.gather`, và mọi đoạn nó viết đều đi qua `filter_banned_language()`."

### 4.5 Kết quả: đồ thị, chi tiết và nhờ dược sĩ (1 phút 30 giây)

**[Màn hình]** Kết quả trên trang tương tác: bản đồ tương tác, dải đếm mức độ, tab chi tiết, tóm tắt tổng quan, khung 'Nhờ dược sĩ xác nhận'.

"Kết quả có ba phần. Thứ nhất là **bản đồ tương tác**: mỗi thuốc là một nút, mỗi cặp là một đường nối tô màu theo mức độ. Có thể xem theo đơn thuốc, và chọn mức độ để lọc.

Khi chạy từng đơn riêng, em thấy Đơn 1 có một cảnh báo trung bình, Đơn 2 không có cảnh báo nào. Nhưng khi gộp, **xuất hiện một đường màu nặng nối Aspirin với Ibuprofen**, nằm giữa hai đơn. Theo DDInter, Ibuprofen có thể làm mất tác dụng bảo vệ tim mạch của Aspirin liều thấp. Ibuprofen cũng làm giảm tác dụng hạ áp của Amlodipine ở mức trung bình.

Thứ hai là **ba tab chi tiết: Thuốc–Thuốc, Thuốc–Thực phẩm, Thuốc–Bệnh nền**. Tab thực phẩm nhắc Lovastatin với nước ép bưởi ở mức nặng, và rượu với Aspirin, Ibuprofen. Tab bệnh nền nhắc Ibuprofen với tăng huyết áp, kèm nhãn 'Đã cá nhân hóa theo bệnh nền'. Với cặp Lovastatin và Amlodipine, hệ thống ghi rõ chưa có đủ dữ liệu, không suy đoán.

Thứ ba là phần **tóm tắt tổng quan** và lời nhắc cố định rằng thông tin chỉ mang tính tham khảo, không tự ý đổi hay ngừng thuốc. Dưới cùng là khung **'Nhờ dược sĩ xác nhận'**: bác chọn một dược sĩ trong danh sách (hiện tên, nơi công tác, mô tả), tùy chọn chia sẻ hồ sơ cá nhân, bệnh nền và dị ứng, viết câu hỏi, rồi gửi. Dược sĩ chỉ xem hồ sơ khi bác chủ động chia sẻ."

### 4.6 Lịch sử (30 giây)

**[Màn hình]** [history/page.tsx](../../frontend/app/(patient)/history/page.tsx).

"Mỗi lần kiểm tra được lưu vào bảng `interaction_checks`. Trang Lịch sử liệt kê từ mới đến cũ, có dòng 'Có cảnh báo cần chú ý' hoặc 'Chưa phát hiện cảnh báo nghiêm trọng', và **bộ lọc theo trạng thái: Tất cả, Chờ xác nhận, Đã xác nhận, Không gửi**. Bấm vào một dòng sẽ mở lại đầy đủ kết quả, trong đó có phần 'Xác nhận từ dược sĩ' với câu hỏi của bác, câu trả lời và ghi chú của dược sĩ. Bác cũng xóa được từng lượt hoặc toàn bộ."

**Câu nối:** "Yêu cầu của bác đã được gửi. Bây giờ em xin chuyển sang đăng nhập bằng tài khoản dược sĩ."

## Phần 5 – Dược sĩ: giới thiệu từng trang (3 phút)

Thanh điều hướng của dược sĩ gồm: **Tổng quan, Tra cứu** (cùng lịch sử tra cứu và hồ sơ cá nhân).

### 5.1 Tổng quan (1 phút)

**[Màn hình]** [pharmacist-dashboard/page.tsx](../../frontend/app/(pharmacist)/pharmacist-dashboard/page.tsx).

"Dược sĩ vào trang Tổng quan. Đầu trang là các thẻ thống kê: **tổng yêu cầu, cần xử lý gấp, chờ xử lý, đã xử lý**. Bên dưới là danh sách **'Cần xử lý gấp'**: các yêu cầu được xếp theo mức độ khẩn, tức là ca có cảnh báo nặng nằm trên cùng. Ca của bác nằm đầu danh sách vì có cặp Aspirin–Ibuprofen mức nặng. Phía dưới là 'Yêu cầu đã xử lý và chờ xem xét', và 'Truy cập nhanh' sang công cụ tra cứu. Khi không có yêu cầu nào gấp, trang báo 'Không có cảnh báo nào cần xử lý'."

### 5.2 Trang xem xét chuyên môn (1 phút 30 giây)

**[Màn hình]** [review/page.tsx](../../frontend/app/(pharmacist)/review/page.tsx).

"Dược sĩ mở yêu cầu của bác, vào trang **Xem xét chuyên môn**. Trang gồm:

- **Thông tin người được kiểm tra**: họ tên, tuổi, giới tính, cân nặng, bệnh nền, dị ứng. Phần này chỉ hiện khi bệnh nhân chủ động chia sẻ.
- **Thuốc trong lần tra cứu**: bảy thuốc của hai đơn, cùng bản đồ tương tác gộp mọi đơn của bác.
- **Chi tiết cảnh báo ở bản chuyên môn**: ngôn ngữ khoa học hơn và kèm nguồn trích dẫn gốc. Ở đây có thêm **hướng xử trí và thuốc thay thế**, những thông tin **chỉ dược sĩ mới thấy** để bệnh nhân không tự ý đổi thuốc.
- **Câu hỏi của bệnh nhân**, ô **câu trả lời của dược sĩ** và ô **nhận xét chuyên môn**.

Với ca này, dược sĩ có thể ghi chú rằng bác nên trao đổi với bác sĩ tim mạch trước khi dùng Ibuprofen, hoặc cân nhắc thuốc hạ sốt giảm đau khác. Quyết định đó thuộc về dược sĩ và bác sĩ, không thuộc về hệ thống. Dược sĩ bấm xác nhận."

### 5.3 Tra cứu, lịch sử tra cứu, hồ sơ dược sĩ (30 giây)

**[Màn hình]** [pharmacist-lookup](../../frontend/app/(pharmacist)/pharmacist-lookup/page.tsx), pharmacist-history, pharmacist-profile.

"Ngoài xử lý yêu cầu, dược sĩ có **'Sổ tay dược sĩ'**, công cụ tra cứu tương tác nội bộ, dùng chính pipeline đó nhưng không gắn với bệnh nhân nào. Mỗi lượt tra được lưu ở trang **lịch sử tra cứu** và xem lại được. Trang **hồ sơ dược sĩ** cho sửa họ tên, nơi công tác và mô tả ngắn; đó chính là thông tin bệnh nhân thấy khi chọn dược sĩ để gửi yêu cầu."

**Câu nối:** "Dược sĩ đã xác nhận. Vòng cuối cùng là quay lại với bác bệnh nhân."

## Phần 6 – Quay lại bệnh nhân và tổng kết (1 phút 30 giây)

**[Màn hình]** Chuông thông báo và trang chủ bệnh nhân; trang Lịch sử với nhãn "Đã xác nhận".

"Bác nhận thông báo 'Cập nhật từ dược sĩ' trên chuông và trang chủ. Trong Lịch sử, lần kiểm tra chuyển từ 'Chờ xác nhận' sang **'Đã xác nhận'**, kèm câu trả lời và ghi chú của dược sĩ. Đó là vòng an toàn khép kín: **AI phát hiện, dữ liệu có nguồn làm chứng cứ, con người quyết định**.

Em xin quay lại câu hỏi ban đầu. Khi xét riêng, Đơn 1 có một cảnh báo trung bình và Đơn 2 không có cảnh báo nào. Khi xét gộp, hệ thống phát hiện thêm **một cặp mức nặng giữa hai đơn**: Aspirin và Ibuprofen. Hệ thống còn nhắc bưởi, rượu và tình trạng tăng huyết áp, những thông tin mà từng người kê đơn không có đủ để nói.

Em xin nhấn mạnh ba điểm. Một, **mọi cảnh báo đều có nguồn trong DDInter**, thiếu dữ liệu thì báo thiếu. Hai, **mô hình ngôn ngữ chỉ diễn giải và bị guardrail kiểm soát**. Ba, **dược sĩ luôn là người xác nhận cuối cùng**. MediCheck không thay thế dược sĩ, mà giúp phát hiện rủi ro mà không ai nhìn thấy khi thông tin nằm rải rác ở nhiều đơn.

Em xin cảm ơn quý thầy cô đã lắng nghe."

---

## Phụ lục A – Bảng thời lượng

| Phần | Nội dung | Thời lượng |
| --- | --- | --- |
| 0 | Tình huống 2 đơn thuốc | 1:00 |
| 1 | Nguyên tắc và kiến trúc tóm tắt | 1:00 |
| 2 | Khách: trang chủ, tra cứu nhanh | 1:30 |
| 3 | Đăng ký, đăng nhập | 1:30 |
| 4 | Bệnh nhân: 6 trang (4.1–4.6) | 5:00 |
| 5 | Dược sĩ: 3 nhóm trang (5.1–5.3) | 3:00 |
| 6 | Quay lại bệnh nhân, tổng kết | 1:30 |
| | **Tổng** | **14:30** |

Nếu chỉ có 10 phút: rút phần 3 xuống 40 giây, gộp 4.1 vào 4.2, bỏ 4.6 và 5.3, và đọc nhanh phần agent ở 4.4 theo bốn ý (chuẩn hóa, tra cứu, xếp hạng, guardrail).

## Phụ lục B – Câu hỏi hội đồng có thể hỏi riêng về luồng

| Câu hỏi | Ý trả lời |
| --- | --- |
| Vì sao khách chỉ tra được 3 thuốc và không lưu? | Giữ trải nghiệm thử nhanh mà không tốn tài nguyên; lưu kết quả và gửi dược sĩ cần danh tính để dược sĩ phản hồi đúng người. |
| Vì sao cặp Lovastatin–Aspirin không có mức độ? | DDInter ghi N/A cho cặp này nên agent giữ nguyên 'chưa phân loại'. Hệ thống không tự gán mức. |
| Vì sao Lovastatin–Amlodipine không có kết quả? | Không có dòng nào trong dữ liệu. Em trả cờ 'không đủ dữ liệu' thay vì suy đoán. Trong 2.073 hoạt chất, 1.939 có ít nhất một cặp tương tác. |
| Hai đơn khác nơi kê thì hệ thống biết cùng một người không? | Bệnh nhân tự nhập cả hai đơn vào cùng một hồ sơ. Hệ thống không tự liên kết đơn giữa các cơ sở y tế; đó là hướng tích hợp đơn thuốc điện tử trong phần hướng phát triển. |
| Aspirin 81mg có thực sự bị Ibuprofen 400mg ảnh hưởng? | DDInter ghi nhận cho aspirin liều thấp, và cảnh báo mang tính tham khảo. Hệ thống không đánh giá theo liều cụ thể, đó là giới hạn đã nêu; việc đổi thuốc thuộc về dược sĩ và bác sĩ. |
| Người dùng gõ sai tên thuốc thì sao? | Ô tìm kiếm chỉ cho chọn từ gợi ý. Nếu một tên không khớp ở node `normalize`, hệ thống gắn cờ `khong_du_du_lieu` cho đúng thuốc đó, các thuốc còn lại vẫn được tra. |
| Bệnh nhân tự chọn dược sĩ có vấn đề gì không? | Có: hiện chưa có phân công hay hàng đợi tự động, đây là giới hạn đã nêu và nằm trong hướng phát triển. |
| Hệ thống đã cảnh báo tự động rồi, và người dùng nhiều khi không đến nhà thuốc, vậy vì sao còn cần dược sĩ trả lời? | Em xin trả lời ba ý. **Một**, cảnh báo tự động chỉ cho biết có tương tác và mức độ gì. Hệ thống cố ý không đưa ra cách xử trí, vì guardrail chặn mọi lời khuyên tự ý đổi, ngừng hay chỉnh liều. Người nhận cảnh báo nặng nên được một người có chuyên môn chỉ hướng tiếp theo. **Hai**, với các cặp "chưa phân loại" hoặc "không có dữ liệu", hệ thống chỉ biết báo thiếu. Hệ thống cũng không xét liều, chức năng gan thận hay thuốc dùng ngoài danh sách; dược sĩ xét được những điều đó. **Ba**, em không coi đây là bước bắt buộc với mọi lượt kiểm tra. Nó là kênh leo thang, hợp nhất với ca có cảnh báo nặng hoặc thiếu dữ liệu, và có thể làm từ xa cho người không đến được nhà thuốc. |
| Nếu không có dược sĩ nào trả lời thì hệ thống còn an toàn không? | Có. Phần cảnh báo và nguồn trích dẫn không phụ thuộc vào dược sĩ, nên bệnh nhân vẫn nhận được thông tin ngay. Lời nhắc cố định luôn có: chỉ mang tính tham khảo, không tự ý đổi hay ngừng thuốc, và hỏi dược sĩ hoặc bác sĩ trực tiếp. Điều chưa có là cam kết thời gian phản hồi, và em xin thừa nhận đây là giới hạn: khóa luận chứng minh được luồng kỹ thuật, chưa chứng minh được năng lực vận hành thực tế. |
| Vậy vòng dược sĩ có thực sự vận hành được ngoài đời không? | Muốn vận hành thật cần ba thứ mà hiện chưa có: phân công hoặc hàng đợi theo dược sĩ, quy định thời gian phản hồi, và đơn vị chịu trách nhiệm chuyên môn, ví dụ phối hợp với một nhà thuốc hoặc đơn vị tư vấn. Em đã đưa các điểm này vào hướng phát triển. Trong khóa luận, vòng dược sĩ dùng để minh họa nguyên tắc con người quyết định cuối cùng, không phải để khẳng định mô hình dịch vụ đã sẵn sàng. |
| LLM bị lỗi thì sao? | Phần tra cứu không phụ thuộc LLM nên cảnh báo mức độ vẫn có. Chỉ phần diễn giải bị ảnh hưởng. |
| Sao gọi là AI Agent khi 5 node không gọi LLM? | Em dùng LangGraph để mô hình hóa quy trình thành đồ thị trạng thái, có dừng sớm khi lỗi hay thiếu dữ liệu. Em chủ động không giao quyết định y khoa cho LLM, nên gọi chính xác là quy trình tác tử (agentic workflow). |

## Phụ lục C – Checklist trước khi lên bảo vệ

- [ ] Chạy thử trên giao diện thật cả 7 thuốc, ghi lại tên gợi ý cần chọn (xem lưu ý 1 ở đầu file).
- [ ] Chuẩn bị sẵn: một tài khoản bệnh nhân đã khai "tăng huyết áp" và "rối loạn lipid máu", **chưa** tạo hai đơn nếu muốn demo tạo đơn trực tiếp; và một tài khoản dược sĩ đã được quản trị viên duyệt, có hồ sơ (nơi công tác, mô tả) để hiện trong danh sách chọn.
- [ ] Mở sẵn hai cửa sổ trình duyệt (hoặc một cửa sổ ẩn danh) cho bệnh nhân và dược sĩ để chuyển đổi nhanh, vì mỗi lần đăng nhập lại tốn thời gian.
- [ ] Chạy trước một lần để làm nóng backend, vì Render free tier có cold start 30–60 giây ở request đầu.
- [ ] Chụp ảnh màn hình dự phòng cho từng trang, phòng khi mạng hoặc API DeepSeek chậm.
- [ ] Kiểm tra và sửa dòng "Lovastatin × trà xanh" có mô tả về nước bưởi.
- [ ] Mức độ lấy từ DDInter nên không nói "bác sẽ bị..." mà nói "có nguy cơ...".
