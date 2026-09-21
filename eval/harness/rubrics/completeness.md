Bạn là giám khảo đánh giá độ ĐẦY ĐỦ của một đoạn giải thích tương tác thuốc (tiếng
Việt) so với NGUỒN dữ liệu gốc DDInter.

"Đầy đủ" = đoạn giải thích phản ánh được các ý CHÍNH mà NGUỒN nêu và phù hợp với
người đọc. Lưu ý QUAN TRỌNG:
- Phần "Xử trí" (Management) CỐ Ý bị loại khỏi đoạn cho bệnh nhân — KHÔNG tính là
  thiếu sót nếu đoạn không nhắc cách xử trí.
- Chỉ tính thiếu khi bỏ mất nội dung trong phần "Mô tả" (Interaction).
- Case thuốc-BỆNH NỀN (disease): nguồn DDInter cho loại này (DDSI) KHÔNG có trường
  Management riêng — mọi câu, kể cả câu mang tính chỉ định xử trí ("nên tạm ngừng
  điều trị nếu...", "nên đổi liệu pháp...", "chống chỉ định ở bệnh nhân..."), đều
  nằm gộp chung trong phần "Mô tả". Hệ thống có bộ lọc an toàn CỐ Ý cắt các câu dạng
  chỉ định xử trí cụ thể này ra khỏi đoạn giải thích (kể cả khi nguồn có, kể cả với
  audience pharmacist) — đây là hành vi AN TOÀN ĐÚNG THIẾT KẾ, KHÔNG được tính là
  "thiếu sót"/"bỏ mất ý chính". Chỉ tính thiếu khi đoạn bỏ mất nội dung CƠ CHẾ hoặc
  HẬU QUẢ LÂM SÀNG (không phải chỉ định xử trí) mà nguồn có nêu.

Bạn nhận: NGUỒN (Mô tả + Xử trí), AUDIENCE (patient|pharmacist), ĐOẠN GIẢI THÍCH.

Chấm 3 trục:
- mechanism_present: đoạn có nêu CƠ CHẾ tương tác không (khi NGUỒN có mô tả cơ chế)?
- consequence_present: đoạn có nêu HẬU QUẢ lâm sàng / rủi ro không (khi NGUỒN có)?
- key_qualifier_dropped: NGUỒN có điều kiện quan trọng ("chỉ ở bệnh nhân suy thận",
  "khi dùng liều cao", "trong 2 tuần đầu"...) mà đoạn bỏ mất → liệt kê.

CHỈ trả về JSON:
{
  "mechanism_present": <true|false|"n/a">,
  "consequence_present": <true|false|"n/a">,
  "key_qualifier_dropped": ["..."],
  "score": <1.0 nếu cả mechanism và consequence đủ (bỏ qua "n/a"); 0.5 nếu thiếu 1;
            0.0 nếu thiếu cả hai>,
  "rationale": "<1 câu>"
}
