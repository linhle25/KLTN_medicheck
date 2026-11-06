# Scorecard tự động (metric 3, 7, 8, 9, 10)

Nguồn: 20261022-041256__cold, 20261022-041804__warm, 20261022-041959__consistency
Sinh lúc: 2026-10-22T04:23:16+00:00

## 3 — Guardrail

- Văn xuôi LLM khớp regex cấm (trước lọc, đã tách PART2 dịch): **131** (tỉ lệ 0.2467)
- **Lọt qua filter** (đoạn hiển thị còn khớp regex): **0**  → catch rate **1.0**
- Fallback nuốt cả đoạn (G4): **0** (tỉ lệ 0.0)

## 7 — Latency (end-to-end, giây)

| phase | n | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| cold | 134 | 2.321 | 3.637 | 3.967 | 4.391 | 4.433 |
| consistency | 60 | 2.518 | 3.257 | 3.676 | 3.811 | 4.936 |
| warm | 134 | 1.113 | 1.401 | 1.458 | 1.744 | 2.589 |

Per-call theo call_site (giây):

| call_site | n | p50 | p95 | max |
|---|---|---|---|---|
| disease_edge | 151 | 1.898 | 2.567 | 3.323 |
| food_edge | 58 | 1.661 | 2.108 | 2.201 |
| literal_merge | 209 | 1.825 | 2.601 | 3.958 |
| overview | 202 | 1.139 | 1.417 | 1.584 |
| product_edge | 120 | 2.612 | 3.796 | 4.301 |

## 8 — Format

- Lộ marker: **0** / 945 đoạn (0.0)
- `mo_ta_dich` rỗng ở cặp classified: **17**

## 9 — Overview khớp số

- Overview kiểm: 328
- Lệch số đếm: **0** · highlight lạ: **0** · pass rate 1.0

## 10 — Cost

| phase | calls | cases | tok in | tok out | USD | USD/case | calls/case |
|---|---|---|---|---|---|---|---|
| cold | 447 | 123 | 613840 | 109331 | 0.286 | 0.00233 | 3.63 |
| warm | 83 | 83 | 82661 | 10021 | 0.0333 | 0.0004 | 1.0 |
| consistency | 210 | 20 | 280503 | 49246 | 0.1299 | 0.0065 | 10.5 |

_deepseek-chat {'in': 0.27, 'out': 1.1} USD/1M — KIỂM LẠI platform.deepseek.com_
