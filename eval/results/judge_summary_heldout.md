# Judge summary (metric 1, 4, 5, 6)

## faithfulness  ·  n=36 (parse OK 36)
- **mean_faithfulness: 0.9481**
- fail: 4 — ['ho-dd-nang-003', 'ho-dd-nhe-013', 'ho-dd-nhe-015', 'ho-dd-trung_binh-010']
- with_hallucination: 6 — ['ho-dd-nang-004', 'ho-dd-nhe-013', 'ho-dd-nhe-015', 'ho-dd-trung_binh-010', 'ho-dis-nang-004', 'ho-food-nhe-009']
- with_fabricated_numbers: 0 — []
- with_management_leak: 1 — ['ho-dd-nang-003']

## relevance  ·  n=36 (parse OK 36)
- **mean_score: 4.639**
- entity_leak: 3 — ['ho-dd-nang-006', 'ho-dd-nhe-015', 'ho-dis-trung_binh-007']
- below_4: 3 — ['ho-dd-nhe-015', 'ho-food-trung_binh-007', 'ho-food-trung_binh-008']

## completeness  ·  n=36 (parse OK 36)
- **mean_score: 1.0**
- missing_mechanism: 0 — []
- missing_consequence: 0 — []
