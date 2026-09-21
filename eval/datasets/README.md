# eval/datasets — gold set

Sinh bằng `python -m eval.harness.build_dataset` (tất định, seed cố định). Xem [../PLAN.md](../PLAN.md).

| File | Số | Nội dung |
|---|---|---|
| `drug_drug.jsonl` | 60 | Cặp thuốc–thuốc. 16 nang / 16 trung_binh / 14 nhe / 14 chua_phan_loai. ~14 case đa đơn. |
| `food.jsonl` | 20 | Thuốc–thực phẩm. 8 nang / 8 trung_binh / 4 nhe. Ưu tiên thuốc có ≤6 dòng thực phẩm. |
| `disease.jsonl` | 20 | Thuốc–bệnh nền. 9 nang / 9 trung_binh / 2 nhe. |
| `overview.jsonl` | 10 | 2 "không tương tác" + 4 một đơn nhiều thuốc + 4 nhiều đơn. |
| `red_team.jsonl` | 15 | 6 xu_tri chứa lời khuyên mạnh · 3 mo_ta có số liệu · 3 label chèn · 3 tên thuốc chèn. |
| `edge.jsonl` | 10 | Thuốc lạ, 1 thuốc, list rỗng, list dài, hoạt chất ngoài DDInter, trùng thuốc, chua_phan_loai. |
| `team_reference_template.csv` | 20 | Khung để **2 thành viên nhóm viết tay** đoạn tham chiếu — chuẩn hiệu chỉnh judge. |

## Vì sao input là tên thuốc (biệt dược), không phải tên hoạt chất

Sau khi `explain_node` bỏ gọi LLM ở cấp hoạt chất, **toàn bộ** phần LLM sinh giải thích
nằm trong `_run_product_check` (luồng `/products/check`). Luồng `/medications/check`
(tên hoạt chất) giờ **không gọi LLM**. `build_dataset.py` vì thế quy mỗi hoạt chất DDInter
về 1 `Product.ten_thuoc` (ưu tiên thuốc đơn chất) để đưa vào luồng thật.

Chỉ **967 hoạt chất** (trong ~1500) có ít nhất 1 biệt dược trong CSDL — gold set chỉ
lấy từ tập này.

## Schema 1 dòng

```jsonc
{
  "id": "dd-nang-001",
  "nhom": "drug_drug",              // drug_drug | food | disease | overview | red_team | edge
  "audience": "patient",            // patient | pharmacist
  "muc_do_ky_vong": "nang",         // (drug_drug/food/disease)
  "stratum": {"mo_ta_present": true, "combo": false, "multi_rx": false},
  "input": {"prescriptions": [{"label": "Đơn 1", "products": ["A.T Ketoconazole 2%", "A.T Loperamid 2 mg"]}]},
  "pair": {"med_a_id": "DDInter1008", "med_a": "Ketoconazole", "med_b_id": "DDInter1088", "med_b": "Loperamide"},
  "nguon": {"muc_do": "nang", "mo_ta": "...(Interaction, EN)...", "xu_tri": "...(Management, EN)..."},
  "ghi_chu": ""
}
```

- `nguon` = dữ liệu DDInter gốc đứng sau cặp — trích lúc dựng set, dùng làm nguồn đối
  chiếu cho faithfulness/completeness. DDInter dùng `"N/A"` (mo_ta) và `"-"` (xu_tri) cho ô trống.
- `food`/`disease`: `pair` có `med_id`, `med`, `doi_tuong` (tên thực phẩm / tên bệnh).
- `overview`: không có `pair`/`nguon`; có `expected` (`tong_so_cap` hoặc `min_edges`, `prescription_count`).
- `red_team`: có `probe` (điều cần kiểm) + `source_flag`.
- `edge`: có `expected` (mô tả hành vi mong đợi).
