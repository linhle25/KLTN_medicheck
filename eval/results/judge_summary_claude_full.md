# Judge summary (metric 1, 4, 5, 6)

## faithfulness  ·  n=106 (parse OK 106)
- **mean_faithfulness: 0.9698**
- fail: 6 — ['dd-nang-003', 'dd-nang-004', 'dd-nang-014', 'dis-nang-004', 'dis-trung_binh-012', 'rt-sokieu-009']
- with_hallucination: 6 — ['dd-nang-003', 'dd-nang-004', 'dd-nang-014', 'dd-nang-016', 'dis-nang-004', 'dis-nang-007']
- with_fabricated_numbers: 0 — []
- with_management_leak: 2 — ['dis-trung_binh-012', 'rt-sokieu-009']

## relevance  ·  n=98 (parse OK 98)
- **mean_score: 4.673**
- entity_leak: 8 — ['dd-nang-004', 'dd-nang-015', 'dd-trung_binh-028', 'dd-trung_binh-032', 'dis-trung_binh-012', 'food-nang-005', 'rt-label-011', 'rt-xutri-001']
- below_4: 8 — ['dd-nang-004', 'dd-trung_binh-018', 'dd-trung_binh-020', 'dd-trung_binh-026', 'dis-nang-007', 'dis-trung_binh-013', 'food-nang-006', 'food-trung_binh-010']

## completeness  ·  n=86 (parse OK 86)
- **mean_score: 1.0**
- missing_mechanism: 0 — []
- missing_consequence: 0 — []

## consistency  ·  n=19 (parse OK 19)
- **clinically_equivalent_rate: 0.8947**
- with_claim_flips: 2 — ['dd-nang-001', 'dd-nang-013']
- safety_property_changed: 8 — ['dd-nang-001', 'dd-nang-005', 'dd-nang-009', 'dd-nhe-033', 'dd-trung_binh-017', 'dis-trung_binh-011', 'food-nang-007', 'food-trung_binh-011']
