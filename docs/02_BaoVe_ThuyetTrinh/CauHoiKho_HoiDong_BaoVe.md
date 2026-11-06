# Câu hỏi khó của hội đồng và hướng trả lời (MediCheck)

Tài liệu này bổ sung cho bảy câu hỏi ngắn ở cuối [KichBan_BaoVe_KhoaLuan.md](KichBan_BaoVe_KhoaLuan.md) và Phụ lục B của [KichBan_ThuyetTrinh_LuongHeThong.md](KichBan_ThuyetTrinh_LuongHeThong.md). Các câu dưới đây được chọn theo cách một hội đồng đọc kỹ khóa luận sẽ hỏi: đi từ chỗ hệ thống **chạm vào dữ liệu, chạm vào mô hình ngôn ngữ, chạm vào người dùng thật, và chạm vào phép đo của chính em**.

**Cách dùng.** Mỗi câu có bốn phần: *Vì sao hội đồng hỏi* (để hiểu ý đồ), *Trả lời mẫu* (ngôi thứ nhất, đọc được ngay), *Số liệu hỗ trợ*, và *Đừng nói* (câu dễ làm hỏng cả phần trả lời). Độ khó: ★ dễ, ★★ khó, ★★★ rất khó, thường là câu quyết định điểm.

**Nguyên tắc chung khi trả lời.**
1. Nhận hạn chế trước, rồi mới nói vì sao vẫn chấp nhận được. Hội đồng đã thấy hạn chế trong báo cáo; che đi sẽ mất điểm hơn nhận.
2. Luôn quay về ba trụ: **dữ liệu có nguồn, LLM chỉ diễn giải, người quyết định cuối cùng**.
3. Không nói "hệ thống đảm bảo an toàn". Nói "hệ thống giảm rủi ro ở những điểm đã đo, và còn những điểm chưa đo".
4. Chưa kiểm chứng được thì nói "em chưa kiểm chứng", đừng đoán.

**Mục lục**

| Nhóm | Điểm chạm | Câu |
| --- | --- | --- |
| A | Dữ liệu và nguồn tri thức | A1–A6 |
| B | Phép đo và đánh giá | B1–B6 |
| C | Mô hình ngôn ngữ và guardrail | C1–C5 |
| D | An toàn, pháp lý, dữ liệu cá nhân | D1–D5 |
| E | Người dùng thật và giá trị sản phẩm | E1–E5 |
| F | Kiến trúc, vận hành, mở rộng | F1–F3 |
| G | Câu hỏi bẫy ngắn | G1–G6 |

Cuối file có [bảng các điểm em cần tự kiểm tra trước ngày bảo vệ](#điểm-cần-tự-kiểm-tra-trước-ngày-bảo-vệ).

---

## A. Dữ liệu và nguồn tri thức

### A1. Toàn bộ cảnh báo đến từ một nguồn là DDInter. Nếu DDInter sai hoặc lỗi thời thì sao? ★★★

**Vì sao hỏi.** Đây là điểm yếu cấu trúc: hệ thống "có nguồn" nhưng chỉ có một nguồn, và nguồn đó do nước ngoài biên soạn.

**Trả lời mẫu.** "Đúng, đó là một điểm phụ thuộc và em xin nêu thẳng. Em chọn DDInter vì ba lý do: dữ liệu có cấu trúc, có mức độ phân loại và có mô tả cơ chế kèm trích dẫn, nên em truy vết được từng cảnh báo về nguồn. Nếu DDInter sai thì hệ thống sai *một cách có thể truy vết*, tức là dược sĩ nhìn vào nguồn trích dẫn và phát hiện được; còn nếu dùng một mô hình tự sinh thì sai mà không có chỗ để kiểm tra. Về lỗi thời, em dùng bản DDInter 2.0 và hiện chưa có cơ chế cập nhật định kỳ; đó nằm trong hướng phát triển thứ nhất. Em cũng không đối chiếu chéo với nguồn thứ hai như Drugs.com hay hướng dẫn của Bộ Y tế, vì phạm vi khóa luận."

**Số liệu hỗ trợ.** 160.227 cặp thuốc–thuốc, 803 thuốc–thực phẩm, 7.672 thuốc–bệnh nền. Mọi mô tả đều kèm `nguon_trich_dan`; guardrail chặn đoạn thiếu nguồn.

**Đừng nói.** "DDInter là chuẩn vàng nên không sai." Không có chuẩn vàng tuyệt đối trong dữ liệu tương tác thuốc.

### A2. DDInter là dữ liệu của Mỹ/Trung Quốc. Nó có phù hợp với thuốc và thực hành tại Việt Nam không? ★★★

**Vì sao hỏi.** Khóa luận đặt bài toán ở Việt Nam (dẫn số liệu 1.700 đơn thuốc ngoại trú, ca Lào Cai), nhưng dữ liệu lõi là quốc tế.

**Trả lời mẫu.** "Tương tác thuốc dựa trên dược lý của hoạt chất, nên phần lớn không phụ thuộc quốc gia: ức chế CYP3A4 hay đối kháng COX là như nhau ở mọi nơi. Chỗ khác biệt nằm ở **tên thương mại và hàm lượng**, và em xử lý bằng bảng biệt dược Việt Nam ánh xạ về hoạt chất. Còn những khác biệt thật như thuốc đông y, thuốc chỉ có ở Việt Nam, hay phác đồ riêng, thì hệ thống **chưa phủ được** và sẽ báo 'không đủ dữ liệu' thay vì suy đoán."

**Số liệu hỗ trợ.** Ánh xạ biệt dược → hoạt chất khớp 41.302 trên 68.562 sản phẩm (khoảng 60%); slide hiện ghi 57,6% thành phần khớp, hai số này tính theo hai đơn vị khác nhau, cần thống nhất trước khi bảo vệ (xem bảng cuối file).

**Đừng nói.** "Thuốc nào cũng giống nhau trên thế giới." Thuốc đông y và chế phẩm bổ sung là khoảng trống thật.

### A3. Vì sao chỉ dùng 160.227 trong 302.516 cặp của DDInter 2.0? ★★★

**Vì sao hỏi.** Con số này nằm ngay trong báo cáo, và việc bỏ gần một nửa dữ liệu nguồn cần có lý do.

**Trả lời mẫu.** *(Chỉ trả lời được sau khi em tự kiểm tra tiêu chí lọc; xem bảng cuối file.)* Nếu tiêu chí là "chỉ giữ các cặp mà cả hai hoạt chất đều ánh xạ được sang danh mục thuốc của hệ thống", em nói rõ như vậy và nêu số cặp bị loại. Nếu em chưa xác nhận được, câu trung thực là: "Em chưa ghi rõ tiêu chí lọc trong báo cáo, và em xin bổ sung. Điều em khẳng định được là phần dữ liệu đã nạp có nguồn gốc nguyên vẹn từ DDInter, không bị sửa mức độ."

**Đừng nói.** Bịa một lý do nghe hợp lý. Đây là câu duy nhất mà đoán sai sẽ bị truy ngược.

### A4. "Không có dữ liệu" khác "không có tương tác" như thế nào? Người dùng có hiểu nhầm là an toàn không? ★★★

**Vì sao hỏi.** Đây là rủi ro an toàn lớn nhất của một công cụ tra cứu: im lặng bị hiểu là an toàn. Trong ví dụ Lovastatin × Amlodipine, hệ thống không có dòng nào.

**Trả lời mẫu.** "Đây là điều em lo nhất, nên em tách thành ba trạng thái hiển thị khác nhau: có tương tác kèm mức độ; **chưa phân loại** (DDInter có ghi nhận nhưng ghi N/A); và **không đủ dữ liệu** (không có dòng nào). Hai trạng thái sau không bao giờ được hiển thị như 'an toàn'. Hệ thống cũng giữ lời nhắc cố định rằng thông tin chỉ mang tính tham khảo. Em thừa nhận rằng một người đọc vội vẫn có thể hiểu nhầm; để giảm rủi ro, hướng cải tiến của em là cảnh báo nổi bật hơn khi có cặp không đủ dữ liệu."

**Số liệu hỗ trợ.** Với 7 thuốc của hai đơn mẫu có 21 cặp, chỉ 3 cặp có mức độ rõ ràng; phần còn lại là chưa phân loại hoặc không có dữ liệu. Trong 2.073 hoạt chất, 1.939 có ít nhất một cặp tương tác.

**Đừng nói.** "Không có cảnh báo nghĩa là uống được." Câu này là điều hệ thống phải tránh.

### A5. Hệ thống không xét liều. Aspirin 81mg và 500mg khác nhau hoàn toàn, vậy cảnh báo có đáng tin không? ★★★

**Vì sao hỏi.** Tương tác lâm sàng phụ thuộc liều, và ví dụ chính của em (Aspirin liều thấp × Ibuprofen) nhạy với liều.

**Trả lời mẫu.** "Hệ thống không đánh giá theo liều, và em đã nêu đó là giới hạn. Mức độ trong DDInter là mức độ cho tương tác nói chung. Vì vậy em định vị cảnh báo là **'có nguy cơ, cần dược sĩ xem xét'** chứ không phải 'chắc chắn xảy ra'. Với ví dụ Aspirin liều thấp, chính nguồn DDInter nêu cơ chế cạnh tranh gắn COX tiểu cầu của ibuprofen đối với aspirin liều thấp, nên cảnh báo đúng hướng; việc có đổi thuốc hay không là quyết định của dược sĩ và bác sĩ dựa trên liều và tình trạng người bệnh."

**Đừng nói.** "Bác sẽ bị mất tác dụng bảo vệ tim." Dùng "có nguy cơ".

### A6. Một thuốc có nhiều hoạt chất, hoặc hai thuốc cùng hoạt chất (trùng thuốc) thì hệ thống xử lý ra sao? ★★

**Vì sao hỏi.** Thuốc cảm cúm thường là thuốc phối hợp; uống hai biệt dược cùng chứa paracetamol là lỗi rất phổ biến, và đó không phải là "tương tác thuốc–thuốc" theo nghĩa DDInter.

**Trả lời mẫu.** "Với thuốc nhiều hoạt chất, hệ thống ánh xạ biệt dược về từng hoạt chất rồi tra từng cặp. Về trùng hoạt chất, đó là một loại rủi ro khác, *cảnh báo trùng thuốc*, và nó nằm ngoài phạm vi DDInter. **Em chưa xây tính năng này** và đưa vào hướng phát triển; em không muốn nói là đã có."

**Đừng nói.** "Hệ thống phát hiện được trùng thuốc" nếu chưa chạy thử. *(Cần tự kiểm tra: nhập hai biệt dược cùng chứa paracetamol xem kết quả ra sao, rồi sửa câu này cho đúng thực tế.)*

---

## B. Phép đo và đánh giá

### B1. Bộ chuẩn 135 ca do chính em sinh ra từ cơ sở dữ liệu, rồi đo trên cơ sở dữ liệu đó. Đó có phải đánh giá vòng tròn không? ★★★

**Vì sao hỏi.** Đây là câu hỏi phương pháp sắc nhất. Nếu nguồn sự thật và đề thi cùng một nơi, điểm cao chưa nói lên gì về y khoa.

**Trả lời mẫu.** "Em xin trả lời hai phần. Thứ nhất, đúng, vì 60/60 cặp tra cứu đúng chỉ chứng minh **tính toàn vẹn dữ liệu và logic truy vấn**, không chứng minh DDInter đúng về lâm sàng; em đã ghi rõ điều này. Thứ hai, phần đánh giá chính của em không nằm ở tra cứu mà ở **đoạn giải thích do LLM sinh ra**: ở đó đề thi là đoạn mô hình viết, còn đáp án là nguồn DDInter, nên không hoàn toàn vòng tròn vì mô hình có thể sai so với nguồn, và thực tế đã sai, như ví dụ Vitamin C và Ephedrin. Để giảm thiên lệch hơn nữa em còn đo thêm một **bộ giữ lại (held-out) 36 ca** không dùng khi chỉnh prompt."

**Số liệu hỗ trợ.** Gold set 135 ca; held-out 36 ca với faithfulness 0,948, relevance 4,64, completeness 1,0 (giám khảo DeepSeek).

**Đừng nói.** "Bộ chuẩn đã được chuyên gia duyệt." Chưa có dược sĩ chấm độc lập.

### B2. Giám khảo là LLM, hệ số đồng thuận κ chỉ 0,34 ở faithfulness. Vậy kết quả có ý nghĩa gì? ★★★

**Vì sao hỏi.** κ thấp tức là hai giám khảo bất đồng, nên con số 0,92 hay 0,89 không đáng tin ở độ chính xác hai chữ số.

**Trả lời mẫu.** "Em đồng ý, và vì vậy em **không báo một con số mà báo một khoảng**: 0,89 đến 0,92 theo hai giám khảo, đều dưới ngưỡng 0,95 em tự đặt. Kết luận em rút ra là hướng chứ không phải điểm: tầng diễn giải chưa đạt về bám sát nguồn. Ở chỉ số liên quan, hai giám khảo đồng thuận tốt (κ = 0,72), nên kết luận ở đó vững hơn. Điều em chưa làm được là có dược sĩ chấm độc lập; đó là bước tiếp theo để xác định giám khảo nào gần chuyên gia hơn."

**Đừng nói.** Chọn số cao hơn trong hai số rồi báo như kết quả chính.

### B3. Em tự đặt ngưỡng 0,95 và 4,3. Ai bảo ngưỡng đó là đúng? ★★

**Vì sao hỏi.** Ngưỡng tự đặt có thể bị nghi là đặt để kết quả đẹp.

**Trả lời mẫu.** "Em đặt ngưỡng **trước khi chạy đánh giá** trong kế hoạch đánh giá, không chỉnh sau. Bằng chứng là có chỉ số em không đạt: faithfulness 0,92 và 0,89 so với 0,95. Nếu em điều chỉnh ngưỡng theo kết quả thì chỉ số đó đã đạt. Với nội dung y tế, em muốn ngưỡng cao vì lỗi bám sát nguồn có thể làm người đọc lo nhầm thuốc."

*(Cần xác nhận: ngưỡng có được ghi trong [eval/PLAN.md](../../eval/PLAN.md) trước khi chạy hay không, và đối chiếu ngày ghi để chắc chắn câu này.)*

### B4. Em báo cáo độ trễ 25 mili giây, nhưng người dùng chờ vài giây. Con số nào đúng? ★★

**Vì sao hỏi.** Hai con số ở hai phạm vi khác nhau dễ bị hiểu là mâu thuẫn.

**Trả lời mẫu.** "Cả hai đúng, ở hai phạm vi. 25 ms ở phân vị 95 là cho **năm node tra cứu tất định**, không gọi LLM. Người dùng thấy thêm thời gian của các lời gọi mô hình để diễn giải: trọn vẹn một lượt kiểm tra đo được p50 khoảng 2,3 giây và p95 khoảng 4 giây khi chưa có bản dịch lưu sẵn, và p50 khoảng 1,1 giây khi đã có cache. Vì thế cảnh báo mức độ vẫn có ngay cả khi mô hình chậm hay lỗi."

**Số liệu hỗ trợ.** [scorecard_auto.md](../../eval/results/scorecard_auto.md): end-to-end cold p50 2,32 s, p95 3,97 s; warm p50 1,11 s, p95 1,46 s; chi phí khoảng 0,0004 đến 0,0023 USD mỗi ca.

### B5. 60 cặp thuốc có đại diện cho thực tế không? Tỷ lệ phát hiện so với đơn thật là bao nhiêu? ★★★

**Vì sao hỏi.** Chưa có phép đo độ nhạy và độ đặc hiệu trên đơn thuốc thật; 60/60 là phép kiểm tra tính toàn vẹn dữ liệu.

**Trả lời mẫu.** "Em chưa đo độ nhạy và độ đặc hiệu trên đơn thuốc thật, và em không muốn trình bày 60/60 như thể đó là độ chính xác lâm sàng. Để đo được cần một bộ đơn thuốc đã được dược sĩ gán nhãn các tương tác đúng, rồi so với kết quả của hệ thống. Đó là hướng phát triển tiếp theo và cần hợp tác với cơ sở y tế."

**Đừng nói.** "Độ chính xác của hệ thống là 100%."

### B6. Khảo sát chỉ 61 người. Có thể kết luận gì về nhu cầu? ★

**Trả lời mẫu.** "Chỉ đủ để kiểm chứng nhu cầu ban đầu, không phải mẫu đại diện; em đã nói rõ ở Slide 3. 73,7% lo ngại ở mức 3 đến 5 và 78,7% sẵn sàng tra cứu. Điều em dùng khảo sát để quyết định là *có đáng xây hay không*, không phải để ước lượng tỷ lệ trong dân số. Hạn chế: mẫu thuận tiện, khảo sát trực tuyến nên lệch về người quen công nghệ."

*(Sửa slide: 27,9% chọn mức 5, không phải 30,1%, như đã ghi ở đầu KichBan_BaoVe_KhoaLuan.md.)*

---

## C. Mô hình ngôn ngữ và guardrail

### C1. Nếu 5 node đều không gọi LLM, vậy giá trị của "AI" trong hệ thống nằm ở đâu? ★★

**Trả lời mẫu.** "Em chủ động đặt LLM ở chỗ nó tạo giá trị mà ít gây hại nhất: **diễn giải sang tiếng Việt dễ hiểu**, tóm tắt tổng quan, và giải thích thực phẩm và bệnh nền theo từng người. Phần quyết định, tức là cặp nào có tương tác và mức độ nào, em để cho cơ sở dữ liệu vì ở đó sai là nguy hiểm và cần truy vết. Đó là một lựa chọn thiết kế có chủ đích, không phải thiếu AI. Gọi chính xác đó là quy trình tác tử (agentic workflow) có kiểm soát."

### C2. Mô hình vẫn viết sai (ví dụ Vitamin C và Ephedrin). Sao biết còn bao nhiêu lỗi như vậy chưa phát hiện? ★★★

**Vì sao hỏi.** Hội đồng đã thấy ví dụ lỗi trong slide; họ sẽ hỏi lỗi đó nằm ở đâu trong số liệu.

**Trả lời mẫu.** "Em không biết chắc, và đó chính là lý do tồn tại của bước dược sĩ xác nhận. Số em đo được là: bám sát nguồn 0,89 đến 0,92, nghĩa là khoảng 8% đến 11% đoạn có ít nhất một điểm lệch so với nguồn, và 10 đến 12 ca mô hình nhắc tên thuốc ngoài cặp đang xét. Loại lỗi như trong ví dụ, tức là đảo chủ thể (thuốc nào bị ảnh hưởng), được bộ chấm bắt ra vì giám khảo đối chiếu với nguồn; nhưng guardrail hiện tại **không chặn được** loại lỗi này vì nó kiểm cú pháp và nguồn trích dẫn, chưa kiểm ngữ nghĩa. Hướng khắc phục là thêm bước đối chiếu tên thuốc trong đoạn giải thích với cặp đang xét."

**Số liệu hỗ trợ.** `entity_leak` 3/36 ở held-out; 10–12 ca ở gold set.

**Đừng nói.** "Lỗi này hiếm." Nói rõ con số.

### C3. Guardrail dùng biểu thức chính quy. Một câu như "bạn nên cân nhắc ngưng thuốc" có lọt không? ★★★

**Trả lời mẫu.** "Có thể lọt. Trong đợt đo cuối, 131 đoạn có vi phạm trước lọc và 0 đoạn còn lọt sau lọc theo cùng bộ biểu thức, nhưng em biết con số 0 này đo **bằng chính bộ luật em viết**, nên nó không chứng minh không có cách diễn đạt khác. Quả thực còn 3 câu mẫu vẫn lọt ở mục 4.3.4. Vì thế em coi guardrail là lớp phòng thủ thứ nhất. Lớp thứ hai là dược sĩ, và lớp em dự kiến thêm là một mô hình kiểm tra thứ hai."

**Đừng nói.** "Guardrail chặn 100%."

### C4. Dữ liệu y tế có đi qua DeepSeek không? Điều đó có ổn không? ★★★

**Vì sao hỏi.** Đây là chỗ dữ liệu có thể rời khỏi hệ thống tới bên thứ ba ở nước ngoài.

**Trả lời mẫu.** "Phần gửi cho DeepSeek là **nội dung tương tác lấy từ DDInter** (tên hoạt chất, mô tả tương tác) để dịch và diễn giải, không phải hồ sơ cá nhân như tên, ngày sinh. Với phần cá nhân hóa theo bệnh nền, lời gọi chứa tên bệnh nền chứ không chứa danh tính. *(Cần tự kiểm tra trong mã: [src/services/llm.py](../../src/services/llm.py) thực sự gửi trường nào; nếu có gửi danh sách bệnh nền, nói đúng như vậy.)* Em cũng lưu bản dịch đã sinh để lần sau không phải gọi lại, nên giảm cả chi phí lẫn lượng dữ liệu đi ra. Về lâu dài, nếu triển khai thật thì nên dùng mô hình đặt trong nước hoặc tự lưu trữ."

### C5. Vì sao chọn DeepSeek mà không phải GPT hoặc Claude? Và dùng chính GPT để chấm có thiên vị không? ★★

**Trả lời mẫu.** "DeepSeek cho chi phí rất thấp (khoảng 0,0004 đến 0,0023 USD mỗi ca) nên phù hợp với một công cụ hướng tới người dùng cá nhân. Về giám khảo, em dùng hai mô hình **khác nhà cung cấp** với mô hình sinh (DeepSeek-reasoner và gpt-4o) để giảm hiện tượng mô hình tự chấm thiên vị phong cách của nó, nhưng em thừa nhận DeepSeek-reasoner cùng hãng với mô hình sinh nên vẫn có nguy cơ; vì vậy em đối chiếu với giám khảo thứ hai."

---

## D. An toàn, pháp lý, dữ liệu cá nhân

### D1. Hệ thống này có bị coi là phần mềm thiết bị y tế không? Ai chịu trách nhiệm nếu bệnh nhân làm theo và có hại? ★★★

**Vì sao hỏi.** Hội đồng muốn biết em có ý thức về ranh giới pháp lý giữa "thông tin tham khảo" và "hỗ trợ ra quyết định lâm sàng".

**Trả lời mẫu.** "Em thiết kế hệ thống ở phía **thông tin tham khảo**: không chẩn đoán, không kê đơn, không khuyên đổi hay ngừng thuốc, và có lời nhắc cố định ở mọi kết quả. Em chưa nghiên cứu sâu việc phân loại pháp lý của phần mềm theo quy định về trang thiết bị y tế tại Việt Nam, và nếu đưa vào vận hành thương mại thì đó là việc phải làm trước, cùng với việc xác định đơn vị chịu trách nhiệm chuyên môn. Trong phạm vi khóa luận, trách nhiệm quyết định luôn thuộc về dược sĩ và bác sĩ; hệ thống chỉ giúp nhìn thấy rủi ro."

**Đừng nói.** Trích dẫn điều luật cụ thể nếu em chưa tra cứu chắc.

### D2. Hồ sơ bệnh nhân là dữ liệu sức khỏe, thuộc nhóm dữ liệu nhạy cảm. Em xử lý theo quy định nào? ★★★

**Trả lời mẫu.** "Dữ liệu sức khỏe là dữ liệu cá nhân nhạy cảm theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Ở mức kỹ thuật em đã làm: mật khẩu băm Argon2, phiên bằng JWT trong cookie HttpOnly có refresh token xoay vòng, CSRF token cho thao tác ghi, phân quyền ba vai trò, và **chia sẻ theo nguyên tắc bệnh nhân chủ động**: dược sĩ chỉ xem hồ sơ khi bệnh nhân bấm chia sẻ. Em chưa làm phần thủ tục như đánh giá tác động xử lý dữ liệu, điều khoản đồng ý chi tiết hay chính sách lưu trữ và xóa dữ liệu; đó là việc cần có nếu triển khai thật."

*(Cần xác nhận: hệ thống có chức năng xóa tài khoản và toàn bộ dữ liệu không. Trang Lịch sử cho xóa từng lượt hoặc toàn bộ lượt kiểm tra; chưa rõ xóa tài khoản.)*

### D3. Chức năng "tra cứu hộ người khác" lưu ngày sinh và tình trạng bệnh của người thứ ba. Người đó có đồng ý không? ★★★

**Vì sao hỏi.** Đây là điểm mới em thêm ở khung "Nhờ dược sĩ xác nhận", và nó tạo ra dữ liệu về một người không phải người dùng.

**Trả lời mẫu.** "Em nhận đây là vấn đề thật. Chức năng này phục vụ trường hợp con cái tra cứu cho bố mẹ cao tuổi, vốn rất phổ biến. Em giảm rủi ro bằng cách để các trường **tự nguyện và chỉ ở mức tối thiểu** (họ tên, ngày sinh, ghi chú), và chỉ gửi cho dược sĩ khi người dùng chủ động. Em chưa có cơ chế xác nhận sự đồng ý của người được tra cứu; nếu vận hành thật thì cần thêm cam kết người dùng đã được sự đồng ý, kèm điều khoản."

### D4. Hệ thống chỉ hiện "Chưa phát hiện cảnh báo nghiêm trọng". Câu đó có nguy hiểm không? ★★★

**Vì sao hỏi.** Nhãn "Chưa phát hiện cảnh báo nghiêm trọng" ở trang Lịch sử có thể bị đọc thành "an toàn". Đây là cùng một vấn đề với A4 nhưng ở lớp giao diện.

**Trả lời mẫu.** "Em dùng cụm 'chưa phát hiện' thay vì 'an toàn' có chủ đích, và nó luôn đi kèm lời nhắc cố định. Tuy vậy em đồng ý chữ 'chưa phát hiện' vẫn có thể bị hiểu là 'không có'. Em coi đây là điểm cần kiểm tra thêm bằng thử nghiệm người dùng: xem một người đọc bình thường đọc nhãn đó thành gì."

### D5. Bệnh nhân tự khai bệnh nền. Khai sai hoặc thiếu thì cá nhân hóa có làm hại không? ★★

**Trả lời mẫu.** "Cá nhân hóa chỉ **lọc bớt** cảnh báo thuốc–bệnh nền cho phù hợp với bệnh người đó khai, nên khai thiếu có nghĩa là bệnh nhân không thấy cảnh báo liên quan đến bệnh chưa khai. Vì vậy em có hai biện pháp: khi chưa khai gì, hệ thống quay về chế độ tổng quát và hiện danh sách rộng, kèm lời nhắc cập nhật hồ sơ; và bản của dược sĩ hiện đầy đủ chi tiết để họ phát hiện điều bệnh nhân bỏ sót."

---

## E. Người dùng thật và giá trị sản phẩm

### E1. Đã có Drugs.com, Medscape, thậm chí hỏi ChatGPT. MediCheck khác gì? ★★★

**Vì sao hỏi.** Câu hỏi về tính mới và lý do tồn tại của đề tài.

**Trả lời mẫu.** "Em khác ở bốn điểm cụ thể. Một, **ngôn ngữ và ngữ cảnh Việt Nam**: tiếng Việt, tra bằng biệt dược Việt Nam. Hai, **gộp nhiều đơn của cùng một người** thành một danh sách thuốc đang dùng để thấy rủi ro nằm giữa các đơn; đó là điểm nhấn của ví dụ Aspirin và Ibuprofen. Ba, **cá nhân hóa theo bệnh nền** để lọc bớt cảnh báo chung chung. Bốn, so với hỏi ChatGPT thì mọi cảnh báo của em có **nguồn truy vết được** và mức độ không do mô hình tự quyết, còn chatbot có thể trả lời trôi chảy nhưng sai. Em không nói MediCheck tốt hơn các công cụ đó về độ phủ dữ liệu; em nói nó phù hợp hơn với bài toán người Việt tự quản lý nhiều đơn."

**Đừng nói.** So sánh số liệu với Drugs.com nếu em chưa thật sự đo.

### E2. Người cao tuổi, nhóm cần nhất, có tự dùng được không? Em đã thử nghiệm với ai? ★★★

**Trả lời mẫu.** "Khảo sát của em là về nhu cầu, chưa phải thử nghiệm khả dụng. Em chưa có thử nghiệm khả dụng với người cao tuổi, và đó là hạn chế thật. Giao diện hiện có thiết kế đơn giản hóa như chọn thuốc từ danh sách gợi ý, đồ thị màu theo mức độ và linh vật nhắc lưu ý, nhưng người cao tuổi nhiều khi nhờ con cháu tra cứu, nên em cũng cho phép 'tra cứu hộ người khác'. Thử nghiệm với nhóm này là bước tiếp theo."

### E3. Ca "cảnh báo nặng" khiến người dùng hoảng và tự bỏ thuốc thì sao? ★★★

**Vì sao hỏi.** Cảnh báo không kèm hướng xử trí có thể gây hại theo chiều ngược lại: bỏ thuốc huyết áp hoặc thuốc tim vì sợ.

**Trả lời mẫu.** "Đó là lý do em tách hai tầng thông tin. Bệnh nhân thấy mức độ, cơ chế và lời nhắc **không tự ý ngừng thuốc**; còn hướng xử trí và thuốc thay thế chỉ dược sĩ thấy. Em cũng dùng ngôn ngữ 'có nguy cơ' thay vì 'sẽ bị'. Đây vẫn là sự đánh đổi: giữ lại hướng xử trí giúp an toàn hơn về hành vi nhưng khiến bệnh nhân thiếu hướng đi, và đó chính là chỗ nút nhờ dược sĩ có giá trị."

### E4. Vòng dược sĩ có thực sự vận hành được ngoài đời không? ★★★

Đã trả lời trong Phụ lục B của [KichBan_ThuyetTrinh_LuongHeThong.md](KichBan_ThuyetTrinh_LuongHeThong.md). Tóm ý: kênh leo thang cho ca nặng hoặc thiếu dữ liệu; vẫn an toàn khi không ai trả lời; muốn vận hành thật cần hàng đợi, thời gian phản hồi và đơn vị chịu trách nhiệm.

### E5. Ai sẽ trả tiền hoặc vận hành hệ thống này? ★★

**Trả lời mẫu.** "Trong phạm vi khóa luận em chưa xây mô hình kinh doanh, nên em chỉ nêu hướng: phối hợp với nhà thuốc hoặc đơn vị tư vấn dược để có dược sĩ trực, hoặc triển khai nội bộ trong một hệ thống nhà thuốc nơi dược sĩ dùng bản chuyên môn để rà soát đơn nhanh hơn. Chi phí kỹ thuật thấp: khoảng vài phần nghìn USD mỗi lượt kiểm tra có gọi mô hình."

---

## F. Kiến trúc, vận hành, mở rộng

### F1. Em triển khai trên Render free tier và có cold start 30–60 giây. Vậy "sản phẩm" ở mức nào? ★★

**Trả lời mẫu.** "Em triển khai trên các gói miễn phí để chứng minh được toàn bộ luồng chạy từ giao diện đến cơ sở dữ liệu, chứ không coi đây là cấu hình vận hành thật. Cold start là hệ quả trực tiếp của gói miễn phí và sẽ mất đi khi nâng gói. Khi lên môi trường thật, phần cần cân nhắc là dữ liệu cá nhân phải đặt trên hạ tầng có cam kết bảo mật."

### F2. 160.227 dòng tương tác có tra nhanh vì có chỉ mục, hay vì ít? Hệ thống chịu được bao nhiêu người dùng? ★★

**Trả lời mẫu.** "Phần tra cứu là truy vấn SQL theo cặp trên PostgreSQL *(cần xác nhận có chỉ mục trên cặp hoạt chất)*, nên với 7 thuốc (21 cặp) mỗi lượt vẫn ở mức vài chục mili giây. Phần chậm và tốn kém là lời gọi mô hình, và em giảm bằng cách lưu bản dịch đã sinh để lần sau không gọi lại, chạy song song bốn nhánh diễn giải. Em **chưa thử tải** với nhiều người dùng đồng thời nên chưa khẳng định được giới hạn."

### F3. Điều gì xảy ra khi DeepSeek lỗi hoặc hết hạn mức? ★

**Trả lời mẫu.** "Phần tra cứu và xếp hạng mức độ không phụ thuộc mô hình, nên người dùng vẫn nhận được cảnh báo có nguồn; chỉ phần diễn giải bị suy giảm. Đây là hệ quả của nguyên tắc tách tra cứu khỏi diễn giải."

---

## G. Câu hỏi bẫy ngắn

| # | Câu hỏi | Trả lời ngắn |
| --- | --- | --- |
| G1 | Hệ thống có phát hiện tương tác ba thuốc trở lên không? | Chỉ tương tác theo **cặp**; DDInter không có dữ liệu tương tác bộ ba. Với 7 thuốc hệ thống tra 21 cặp. Tác động cộng gộp nhiều thuốc cùng lúc là giới hạn đã nêu. |
| G2 | Thuốc đông y, thực phẩm chức năng có được tra không? | Thực phẩm chức năng chỉ tra được khi hoạt chất có trong danh mục DDInter (một số vitamin và khoáng chất không có nên báo "không đủ dữ liệu"); thuốc đông y thì chưa. Không có dữ liệu thì báo "không đủ dữ liệu". |
| G3 | Vì sao Aspirin hiện thành "Acetylsalicylic acid"? | Do bước `normalize` đổi về tên hoạt chất chuẩn của DDInter để tra đúng. *(Cần kiểm tra giao diện hiển thị tên nào cho người dùng trước khi nói thêm.)* |
| G4 | Hai dược sĩ cho hai câu trả lời khác nhau thì sao? | Mỗi yêu cầu chỉ gửi một dược sĩ do bệnh nhân chọn, nên chưa có cơ chế đối chiếu. Đây là giới hạn đã nêu. |
| G5 | Em tự đánh giá hệ thống đạt mức nào? | Tra cứu: đạt ở mức tính toàn vẹn dữ liệu. Diễn giải: 4/5 chỉ số đạt ngưỡng, **bám sát nguồn chưa đạt**. Chưa có đánh giá bởi chuyên gia và chưa thử nghiệm khả dụng. |
| G6 | Nếu làm lại, em sẽ đổi điều gì đầu tiên? | Mời dược sĩ chấm độc lập bộ chuẩn ngay từ đầu, vì đó là điều làm các con số mạnh hơn nhiều nhất. |

---

## Điểm cần tự kiểm tra trước ngày bảo vệ

Các điểm dưới đây em **chưa xác nhận được từ mã nguồn hay tài liệu**, nên các câu trả lời tương ứng đang để dạng có điều kiện. Kiểm tra xong thì sửa lại câu trả lời cho đúng thực tế.

| Điểm | Liên quan câu | Cách kiểm tra |
| --- | --- | --- |
| Tiêu chí lọc 160.227 trên 302.516 cặp | A3 | Xem script nạp DDInter trong `scripts/` và báo cáo mục dữ liệu; ghi rõ tiêu chí vào báo cáo |
| Số 57,6% (thành phần) và 41.302/68.562 (sản phẩm, khoảng 60,2%) khác nhau | A2 | Chọn một cách tính và dùng thống nhất trên slide, báo cáo, README |
| Hai biệt dược cùng hoạt chất có cảnh báo "trùng thuốc" không | A6 | Chạy thử trên giao diện thật |
| Ngưỡng 0,95 và 4,3 được ghi trước khi chạy đánh giá | B3 | Đối chiếu ngày trong [eval/PLAN.md](../../eval/PLAN.md) và lịch sử git |
| Lời gọi DeepSeek có gửi bệnh nền hoặc thông tin cá nhân không | C4 | Đọc [src/services/llm.py](../../src/services/llm.py) và nơi dựng prompt |
| Có chức năng xóa tài khoản và toàn bộ dữ liệu không | D2 | Kiểm tra API và trang hồ sơ |
| Nhãn "Chưa phát hiện cảnh báo nghiêm trọng" nên đổi thành gì | D4 | Cân nhắc đổi thành "Chưa tìm thấy cảnh báo trong dữ liệu hiện có" |
| Số liệu κ (0,34 và 0,72) và hai chỉ số faithfulness (0,92 và 0,89) | B2 | Đối chiếu lại với file kết quả `eval/results/judge_summary*.md` hiện hành; các file này đang có thay đổi chưa commit |
| Slide 3: 27,9% chọn mức 5; slide 6: nhãn OCR | B6 | Đã liệt kê ở đầu KichBan_BaoVe_KhoaLuan.md |

Nếu chỉ có thời gian luyện một số câu, ưu tiên theo thứ tự: **A4, B1, B2, C2, C3, D3, E1, E3**. Đây là các câu chạm thẳng vào hạn chế đã lộ ra trong chính số liệu của em.
