# Scorecard tự động (metric 3, 7, 8, 9, 10)

Nguồn: 20260901-042520__cold, 20260901-043615__warm, 20260901-044255__consistency
Sinh lúc: 2026-09-01T05:56:39+00:00

## 3 — Guardrail

- Văn xuôi LLM khớp regex cấm (trước lọc, đã tách PART2 dịch): **137** (tỉ lệ 0.2514)
- **Lọt qua filter** (đoạn hiển thị còn khớp regex): **6**  → catch rate **0.9562**
- Fallback nuốt cả đoạn (G4): **0** (tỉ lệ 0.0)

## 7 — Latency (end-to-end, giây)

| phase | n | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| cold | 134 | 4.468 | 7.006 | 8.059 | 14.925 | 19.776 |
| consistency | 58 | 4.915 | 6.168 | 7.498 | 8.376 | 8.909 |
| warm | 134 | 2.671 | 3.905 | 5.962 | 11.187 | 17.424 |

Per-call theo call_site (giây):

| call_site | n | p50 | p95 | max |
|---|---|---|---|---|
| disease_edge | 162 | 2.667 | 6.264 | 7.513 |
| food_edge | 58 | 2.075 | 2.788 | 2.867 |
| literal_merge | 217 | 2.471 | 4.908 | 8.354 |
| overview | 204 | 1.488 | 2.18 | 3.64 |
| product_edge | 121 | 3.697 | 5.815 | 7.329 |

## 8 — Format

- Lộ marker: **0** / 953 đoạn (0.0)
- `mo_ta_dich` rỗng ở cặp classified: **0**

## 9 — Overview khớp số

- Overview kiểm: 326
- Lệch số đếm: **0** · highlight lạ: **0** · pass rate 1.0

## 10 — Cost

| phase | calls | cases | tok in | tok out | USD | USD/case | calls/case |
|---|---|---|---|---|---|---|---|
| cold | 471 | 124 | 544306 | 113483 | 0.2718 | 0.00219 | 3.8 |
| warm | 84 | 84 | 83561 | 12101 | 0.0359 | 0.00043 | 1.0 |
| consistency | 207 | 20 | 235565 | 49490 | 0.118 | 0.0059 | 10.35 |

_deepseek-chat {'in': 0.27, 'out': 1.1} USD/1M — KIỂM LẠI platform.deepseek.com_
