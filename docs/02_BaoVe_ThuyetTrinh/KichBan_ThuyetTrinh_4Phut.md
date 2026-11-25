# Kịch bản thuyết trình MediCheck – 4 phút

Dùng cho file `docs/MediCheck (3).pdf` (10 trang). Tốc độ đọc khoảng 170 từ/phút, tổng khoảng 680 từ. Trang 6 (bìa "Kết quả nghiên cứu") chỉ lướt qua, không đọc riêng.

| Trang | Nội dung | Thời lượng |
| --- | --- | --- |
| 1 | Bìa, chào mở | 0:15 |
| 2 | Cơ sở xác định đề tài | 0:40 |
| 3 | Khảo sát nhu cầu | 0:30 |
| 4 | Mục tiêu nghiên cứu | 0:25 |
| 5 | Nội dung triển khai | 0:30 |
| 6–7 | Kết quả: kiến trúc hệ thống | 0:35 |
| 8 | Trợ lý an toàn dùng thuốc | 0:35 |
| 9 | Định hướng phát triển | 0:20 |
| 10 | Lời kết | 0:10 |

## Trang 1 – Chào mở (15 giây)

"Em xin kính chào quý thầy cô. Em là Lê Thị Linh, sinh viên Trường Công nghệ, Đại học Kinh tế Quốc dân. Em xin trình bày đề tài *Ứng dụng y tế tra cứu tương tác thuốc và cảnh báo an toàn sử dụng thuốc*, với sản phẩm là MediCheck, dưới sự hướng dẫn của TS. Tống Thị Hảo Tâm."

## Trang 2 – Cơ sở xác định đề tài (40 giây)

"Điều gì xảy ra khi hai loại thuốc dùng cùng lúc lại tương tác với nhau? Theo nghiên cứu trên 1.700 đơn thuốc ngoại trú tại Việt Nam, đăng trên Tạp chí Y học Việt Nam năm 2023, 32,1% đơn có tương tác mang ý nghĩa lâm sàng. Nguy cơ tăng rất nhanh theo số thuốc: 16,7% với 2 đến 4 thuốc, 52,1% với 5 đến 7 thuốc, và 89,2% khi từ 8 thuốc trở lên.

Một ca ở Lào Cai: Clarithromycin dùng cùng Lovastatin có nguy cơ độc tính trên cơ. Nhờ dược sĩ can thiệp, y lệnh được hủy trước khi gây hậu quả."

## Trang 3 – Khảo sát nhu cầu (30 giây)

"Nhưng người dùng có thật sự cần không? Em khảo sát 61 người trước khi xây sản phẩm. 73,7% lo ngại về tương tác thuốc ở mức từ 3 đến 5, và 78,7% sẵn sàng tra cứu trước khi uống thuốc, trong đó 27,9% chắc chắn dùng nếu đủ an toàn. Đây là khảo sát nhỏ, em dùng để kiểm chứng nhu cầu ban đầu, không phải mẫu đại diện."

## Trang 4 – Mục tiêu nghiên cứu (25 giây)

"Không phải lúc nào cũng có một dược sĩ đứng cạnh mỗi bệnh nhân. Một người có thể có nhiều bác sĩ, nhiều đơn thuốc, thêm thuốc tự mua và thực phẩm bổ sung, nhưng chỉ có một người uống tất cả. MediCheck không trao quyền tự kê thuốc. Em muốn đưa khả năng phát hiện rủi ro đến gần hơn với người thực sự uống những viên thuốc đó."

## Trang 5 – Nội dung triển khai (30 giây)

"Em triển khai theo bốn bước. Một, thu thập dữ liệu từ DDInter 2.0 gồm tương tác thuốc–thuốc, thuốc–thực phẩm, thuốc–bệnh nền, cùng danh mục thuốc đã đăng ký tại Việt Nam. Hai, làm sạch và chuẩn hóa tên thuốc, ánh xạ mức độ nghiêm trọng, loại bỏ trùng lặp. Ba, nạp vào PostgreSQL, hơn 160.000 cặp tương tác. Bốn, xây dựng hệ thống gồm LangGraph, FastAPI và giao diện Next.js cho bệnh nhân và dược sĩ."

## Trang 6–7 – Kiến trúc hệ thống (35 giây)

"Em xin chuyển sang kết quả, bắt đầu từ kiến trúc. Giao diện Next.js gửi yêu cầu qua REST API đến backend FastAPI chạy trong Docker. Backend khởi chạy quy trình phân tích bằng LangGraph, tra cứu tương tác trong PostgreSQL và lưu kết quả. Điểm quan trọng là chỉ có một nơi duy nhất gọi mô hình ngôn ngữ, là bước tổng hợp giải thích bằng DeepSeek, và bước này nằm sau khi việc tra cứu đã xong. Vì vậy mô hình chỉ diễn giải, không tự tạo ra bằng chứng."

## Trang 8 – Một trợ lý an toàn dùng thuốc (35 giây)

"Quy trình có năm bước: nhập thuốc, chuẩn hóa tên, tra cứu, xếp hạng và giải thích, cuối cùng là guardrail và dược sĩ xem xét. Giá trị khác biệt có ba điểm. Thứ nhất, tiếng Việt dễ hiểu, thu hẹp khoảng cách giữa dữ liệu chuyên môn và người dùng. Thứ hai, nguồn thật có trích dẫn, vì DDInter 2.0 là nền tảng tra cứu. Thứ ba, hai vai trò liên thông: bệnh nhân theo dõi lịch sử, dược sĩ xác nhận. Nguyên tắc an toàn là không chẩn đoán, không tự khuyên đổi hoặc ngừng thuốc, và cảnh báo chỉ mang tính tham khảo."

## Trang 9 – Định hướng phát triển (20 giây)

"Em có bốn hướng phát triển. Một, mở rộng dữ liệu thuốc Việt Nam. Hai, cá nhân hóa sâu theo tuổi, liều dùng và tiền sử dị ứng. Ba, quét đơn thuốc bằng OCR để người dùng chỉ cần chụp ảnh, giảm sai sót khi nhập tay. Bốn, tích hợp thực tế với nhà thuốc, phòng khám và đơn thuốc điện tử."

## Trang 10 – Lời kết (10 giây)

"MediCheck dùng AI để làm thông tin thuốc dễ hiểu hơn, nhưng vẫn giữ an toàn bằng dữ liệu có nguồn và con người trong vòng kiểm soát. Em xin trân trọng cảm ơn quý thầy cô đã lắng nghe."

## Ghi chú khi tập

- Nếu bị quá giờ, rút gọn trang 3 và trang 5; giữ nguyên trang 2, 7 và 8 vì đó là phần cốt lõi.
- Trang 9 nói OCR là hướng phát triển, nên không nói OCR đã làm xong. Trang 7 trong PDF vẫn còn ô "Dịch vụ OCR"; nếu hội đồng hỏi, trả lời là chưa triển khai.
- Chưa có số liệu đánh giá (gold set 135 ca) trong bộ slide này. Nếu thầy cô yêu cầu, thêm 30 giây từ kịch bản dài `KichBan_BaoVe_KhoaLuan.md`, mục Slide 7.
