# Kịch bản bảo vệ khóa luận MediCheck

## Tổng quan

Kịch bản dài khoảng 13 phút cho 8 slide nội dung, viết ở ngôi thứ nhất, giọng trang trọng của buổi bảo vệ trước hội đồng. Mỗi slide kết thúc bằng một **câu nối** để chuyển sang slide kế tiếp; đọc câu nối trước khi bấm sang slide mới.

| Phần | Slide trong file PDF | Thời lượng |
| --- | --- | --- |
| Chào mở | Bìa | 0:30 |
| Slide 1 – Bài toán | Trang 2 | 1:00 |
| Slide 2 – Khoảng trống an toàn | Trang 3 | 0:45 |
| Slide 3 – Khảo sát nhu cầu | Trang 4 | 1:00 |
| Slide 4 – Giải pháp | Trang 5 | 1:30 |
| Slide 5 – Người dùng | Trang 6 | 1:00 |
| Slide 6 – Kiến trúc | Trang 7 | 1:30 |
| Slide 7 – Đánh giá | Trang 8 | 4:00 |
| Slide 8 – Hướng phát triển và kết | Trang 9 | 1:30 |

Trước khi bảo vệ cần sửa các chỗ sau trên slide, vì kịch bản giả định đã sửa:

- Slide 3: đổi "30,1% chọn mức 5" thành 27,9% (17/61).
- Slide 6: xóa nhãn ẩn "DỊCH VỤ OCR", vì OCR chưa được xây dựng.
- Slide 7: thay số liệu bằng kết quả gold set 135 ca, hai giám khảo (DeepSeek-reasoner, gpt-4o).
- Đánh lại số trang 1–8 và xóa slide trắng cuối file.

## Chào mở (30 giây)

“Em xin kính chào quý thầy cô trong hội đồng. Em là Lê Thị Linh, sinh viên lớp Công nghệ thông tin 65B, Trường Công nghệ, Đại học Kinh tế Quốc dân. Hôm nay em xin trình bày khóa luận *Ứng dụng y tế tra cứu tương tác thuốc và cảnh báo an toàn sử dụng thuốc*, với sản phẩm là hệ thống MediCheck, dưới sự hướng dẫn của TS. Tống Thị Hảo Tâm.”

**Câu nối sang Slide 1:** “Bài trình bày của em gồm năm phần: bài toán, giải pháp, kiến trúc, đánh giá và hướng phát triển. Em xin bắt đầu từ một câu hỏi rất đơn giản.”

## Slide 1 – Bài toán (1 phút)

Theo một nghiên cứu trên 1.700 đơn thuốc ngoại trú tại Việt Nam, 32,1% đơn có tương tác mang ý nghĩa lâm sàng.

“Điều gì xảy ra nếu một viên thuốc chữa bệnh này, khi gặp một viên thuốc chữa bệnh khác, lại tạo ra một nguy cơ mới? Theo nghiên cứu đăng trên Tạp chí Y học Việt Nam năm 2023, 32,1% đơn thuốc có tương tác mang ý nghĩa lâm sàng. Tỷ lệ này tăng mạnh theo số thuốc: 16,7% với 2 đến 4 thuốc, 52,1% với 5 đến 7 thuốc, và 89,2% khi từ 8 thuốc trở lên.

Một ca thực tế tại Lào Cai: cặp Clarithromycin và Lovastatin có nguy cơ độc tính trên cơ, có thể dẫn đến bệnh cơ và tiêu cơ vân. Nhờ dược sĩ can thiệp, y lệnh được hủy trước khi gây hậu quả.”

**Câu nối sang Slide 2:** “Nhưng không phải bệnh nhân nào cũng có một dược sĩ đứng cạnh như ca ở Lào Cai. Đó là khoảng trống mà em muốn nói ở slide tiếp theo.”

## Slide 2 – Khoảng trống an toàn (45 giây)

MediCheck không trao quyền tự kê thuốc; hệ thống đưa khả năng phát hiện rủi ro đến gần hơn với người thực sự uống thuốc.

“Một người bệnh có thể điều trị nhiều bệnh, có nhiều bác sĩ, nhiều đơn thuốc, thêm thuốc tự mua và thực phẩm bổ sung, nhưng chỉ có một người uống tất cả. Trong khi đó, hệ thống y tế phải xử lý hàng nghìn công việc mỗi ngày nên không thể có dược sĩ đứng cạnh từng người. MediCheck không trao quyền tự kê thuốc. Em muốn đưa khả năng phát hiện rủi ro đến gần hơn với người thực sự uống những viên thuốc đó.”

**Câu nối sang Slide 3:** “Vậy nhu cầu này có thực sự tồn tại, hay chỉ là giả định của em? Trước khi xây sản phẩm, em đã khảo sát để kiểm chứng.”

## Slide 3 – Khảo sát nhu cầu (1 phút)

Trong 61 người được khảo sát, 73,7% lo ngại ở mức 3–5 và 78,7% sẵn sàng tra cứu trước khi uống thuốc.

“Em khảo sát trực tuyến 61 người trên thang điểm 1 đến 5. Về mức độ lo ngại khi dùng nhiều thuốc, 73,7% chọn từ mức 3 trở lên. Về sự sẵn sàng dùng nền tảng tra cứu, 78,7% chọn từ mức 3 trở lên, trong đó 27,9% chọn mức 5. Em xin nói rõ đây là khảo sát quy mô nhỏ, dùng để kiểm chứng nhu cầu ban đầu chứ không phải mẫu đại diện. Kết quả cho thấy người dùng đã lo sẵn; thứ họ thiếu là một chỗ tra cứu đủ tin cậy và dễ hiểu.”

**Câu nối sang Slide 4:** “Từ nhu cầu đó, em đề xuất giải pháp MediCheck. Em xin trình bày nguyên tắc thiết kế của nó.”

## Slide 4 – Giải pháp (1 phút 30 giây)

Nguyên tắc cốt lõi là tách tra cứu khỏi diễn giải: mọi cặp tương tác đều đến từ cơ sở dữ liệu DDInter 2.0, còn mô hình ngôn ngữ chỉ diễn giải.

“Hệ thống có năm bước: nhập thuốc, chuẩn hóa tên, tra cứu, xếp hạng và giải thích, cuối cùng là guardrail và dược sĩ xác nhận. Nguyên tắc cốt lõi là *tách tra cứu khỏi diễn giải*. Mọi cặp tương tác đều đến từ DDInter 2.0, gồm 160.227 cặp thuốc–thuốc, 803 tương tác thuốc–thực phẩm và 7.672 tương tác thuốc–bệnh nền. Mô hình ngôn ngữ chỉ diễn giải kết quả đã tra, không được tạo ra hay thay đổi mức độ tương tác. Bên cạnh đó, hệ thống đặt ba nguyên tắc an toàn: không chẩn đoán, không tự khuyên đổi hay ngừng thuốc, và cảnh báo chỉ mang tính tham khảo.”

**Câu nối sang Slide 5:** “Giải pháp này phục vụ hai nhóm người dùng với hai nhu cầu khác nhau. Em xin nói về từng nhóm.”

## Slide 5 – Người dùng (1 phút)

Bệnh nhân và dược sĩ dùng chung một hệ thống nhưng thấy thông tin ở hai mức khác nhau, tạo thành một vòng an toàn khép kín.

“Mỗi nhóm có một nhu cầu riêng. Bệnh nhân cần biết khi nào nên lo lắng: họ nhập nhiều đơn thuốc hoặc biệt dược, xem đồ thị tương tác và mức độ ưu tiên, lưu lịch sử và nhận trạng thái ‘đã xác nhận’ khi dược sĩ xem xét. Dược sĩ cần ưu tiên đúng ca cần xử lý: dashboard xếp yêu cầu theo mức độ khẩn, dược sĩ xem chi tiết chuyên môn kèm nguồn dữ liệu, rồi xác nhận và phản hồi về cho bệnh nhân. Thông tin chuyên môn như hướng xử trí và thuốc thay thế chỉ dược sĩ mới thấy, để bệnh nhân không tự ý đổi thuốc.”

**Câu nối sang Slide 6:** “Để thấy hệ thống đảm bảo các nguyên tắc vừa nêu như thế nào, em xin chuyển sang phần kiến trúc.”

## Slide 6 – Kiến trúc hệ thống (1 phút 30 giây)

Chỉ một lớp duy nhất gọi mô hình ngôn ngữ, và lớp đó nằm sau khi quy trình tra cứu đã chạy xong.

“Giao diện Next.js 14 gọi API FastAPI qua REST. Backend chạy quy trình LangGraph gồm năm bước, và cả năm bước đều tất định: chuẩn hóa, tra cứu, xếp hạng, gắn trường giải thích và guardrail. Chỉ ở tầng dịch vụ, sau khi đã có kết quả tra cứu, DeepSeek mới được gọi để dịch và tổng hợp giải thích. Dữ liệu lưu trên PostgreSQL; hệ thống triển khai trên Vercel, Render và Supabase. Guardrail chặn toàn bộ kết quả nếu một đoạn giải thích thiếu nguồn trích dẫn, và lọc từng câu có ngôn ngữ chỉ định điều trị.”

**Câu nối sang Slide 7:** “Thiết kế đó trông hợp lý trên giấy, nhưng em cần đo xem nó hoạt động thực tế ra sao. Đây là phần em muốn dành nhiều thời gian nhất.”

## Slide 7 – Đánh giá (4 phút, phần trọng tâm)

Tầng tra cứu đạt yêu cầu, còn tầng diễn giải bằng LLM chưa đạt chỉ số bám sát nguồn; em xin trình bày cả hai một cách thẳng thắn.

**Phần 1 – Tra cứu (khoảng 40 giây).** “Phần tra cứu là truy vấn tất định. Với 60 cặp thuốc trong bộ chuẩn, 60 trên 60 cặp được tìm thấy và đúng mức độ so với nguồn; cả quy trình năm bước chạy trong khoảng 25 mili giây ở phân vị 95. Em xin lưu ý đây là kiểm tra tính toàn vẹn dữ liệu, chưa phải kiểm chứng lâm sàng.”

**Câu nối sang phần 2:** “Phần quan trọng hơn là chất lượng đoạn giải thích do mô hình ngôn ngữ sinh ra, vì đó là nơi lỗi có thể xảy ra.”

**Phần 2 – Phương pháp (khoảng 40 giây).** “Em dùng bộ chuẩn 135 ca, sinh tự động từ cơ sở dữ liệu. Để tránh thiên lệch của một giám khảo, em chấm bằng hai mô hình độc lập là DeepSeek-reasoner và gpt-4o, đối chiếu từng đoạn giải thích với nguồn DDInter.”

**Phần 3 – Kết quả (khoảng 1 phút 30 giây).** “Về mức liên quan, hai giám khảo cho 4,82 và 4,69 trên thang 5, đạt ngưỡng 4,3. Về mức đầy đủ, 1,00 và 0,91, đạt ngưỡng 0,90. Về guardrail, trong 131 đoạn do mô hình sinh ra có vi phạm, không đoạn nào lọt qua bộ lọc ở đợt đo cuối. Chỉ số em chưa đạt là mức bám sát nguồn: 0,92 và 0,89, thấp hơn ngưỡng 0,95. Ngoài ra còn 10 đến 12 ca mô hình nhắc tên thuốc nằm ngoài cặp đang xét.”

**Câu nối sang ví dụ:** “Em xin lấy hai ví dụ thật để thấy rõ chuyện này diễn ra thế nào.”

**Phần 4 – Hai ví dụ (khoảng 40 giây).** “Ví dụ đầu: Penicillamine với thức ăn. Nguồn có chỉ dẫn giờ giấc cụ thể, nhưng hệ thống chỉ giữ phần cơ chế, bỏ chỉ dẫn xử trí, vì đó là thẩm quyền của dược sĩ. Ví dụ thứ hai là một lỗi còn tồn tại: với Vitamin C và Ephedrin, nguồn nói Ephedrin bị thải nhanh hơn và mất tác dụng, nhưng mô hình viết nhầm là hiệu quả của Vitamin C bị giảm. Đây là loại lỗi nguy hiểm vì người đọc sẽ lo cho nhầm thuốc.”

**Phần 5 – Hạn chế của phương pháp và kết luận (khoảng 40 giây).** “Em cũng xin nêu hạn chế của chính phép đánh giá: hai giám khảo bất đồng ở chỉ số bám sát nguồn, hệ số κ chỉ khoảng 0,34, thấp hơn ngưỡng 0,6 em đặt ra, nên kết quả này nên hiểu là một khoảng ước lượng; và hiện chưa có dược sĩ chấm độc lập. Chính vì chưa chỉ số nào đạt tuyệt đối, em giữ dược sĩ ở bước xác nhận cuối cùng, và thiết kế để AI chỉ diễn giải chứ không quyết định.”

**Câu nối sang Slide 8:** “Từ những hạn chế vừa nêu, em xin trình bày các hướng phát triển tiếp theo của MediCheck.”

## Slide 8 – Hướng phát triển và lời kết (1 phút 30 giây)

Bốn hướng phát triển đều xuất phát từ hạn chế đã đo được.

“Em đề xuất bốn hướng. Một là mở rộng dữ liệu thuốc Việt Nam, vì hiện mới 57,6% thành phần biệt dược khớp được hoạt chất DDInter, kèm cơ chế cập nhật dữ liệu định kỳ. Hai là cá nhân hóa sâu hơn theo tuổi, liều dùng và tiền sử dị ứng. Ba là đưa phản hồi chuyên môn của dược sĩ vào cải thiện kết quả. Bốn là tích hợp thực tế với nhà thuốc, phòng khám và đơn thuốc điện tử. Ngoài ra, em dự kiến bổ sung nhận dạng đơn thuốc từ ảnh và một lớp kiểm tra bằng mô hình cho guardrail, vì bộ lọc biểu thức chính quy hiện tại còn lọt vài cách diễn đạt.”

**Câu nối sang lời kết:** “Để kết thúc, em xin tóm lại điều em muốn gửi gắm qua đề tài này.”

**Lời kết.** “MediCheck cho thấy có thể dùng AI để làm thông tin thuốc dễ hiểu hơn, nhưng vẫn giữ an toàn bằng dữ liệu có nguồn, guardrail và con người trong vòng kiểm soát. Em xin cảm ơn quý thầy cô đã lắng nghe, và rất mong nhận được góp ý của hội đồng.”

## Câu hỏi hội đồng thường gặp

Bảy câu hỏi dưới đây là những chỗ hội đồng dễ hỏi nhất, vì chúng chạm vào hạn chế đã nêu ở Slide 7.

| Câu hỏi | Ý trả lời |
| --- | --- |
| Faithfulness chưa đạt 0,95, sao vẫn cho dùng? | Tra cứu tương tác không phụ thuộc LLM; LLM chỉ diễn giải. Kết quả hiển thị trạng thái “chưa xác nhận” cho đến khi dược sĩ duyệt. Em xem đây là hạn chế đã đo được và đã nêu ở mục 4.6. |
| “AI Agent” ở đâu khi 5 node đều không gọi LLM? | Em dùng LangGraph để mô hình hóa quy trình thành đồ thị trạng thái, có dừng sớm khi lỗi hoặc thiếu dữ liệu. Em chủ động không giao quyết định y khoa cho LLM, nên gọi chính xác là quy trình tác tử (agentic workflow). |
| Chấm bằng LLM có tin được không? | Em dùng hai giám khảo khác nhà cung cấp. Mức liên quan đồng thuận tốt (κ = 0,72); bám sát nguồn và đầy đủ thì thấp, nên em nêu rõ là ước lượng và hướng tới người chấm độc lập. |
| Vì sao chỉ dùng 160.227 trong 302.516 cặp của DDInter 2.0? | Cần tự xác nhận tiêu chí lọc trước buổi bảo vệ; báo cáo hiện chưa giải thích rõ. |
| Guardrail dùng biểu thức chính quy có đủ không? | Chưa. Có 3 câu mẫu vẫn lọt (mục 4.3.4). Hướng khắc phục là thêm một lớp kiểm tra bằng mô hình. |
| Dữ liệu cá nhân được bảo vệ ra sao? | Mật khẩu băm Argon2, cookie HttpOnly, CSRF token, refresh token xoay vòng; dược sĩ chỉ xem hồ sơ khi bệnh nhân chủ động gửi yêu cầu. |
| Hệ thống có thay thế dược sĩ không? | Không. Hệ thống chỉ hỗ trợ thông tin và cảnh báo; phạm vi và giới hạn nêu ở mục 1.5 của khóa luận. |
