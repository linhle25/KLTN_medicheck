# Judge summary (metric 1, 4, 5, 6)

## faithfulness  ·  n=104 (parse OK 104)
- **mean_faithfulness: 0.9212**
- fail: 8 — ['dd-nang-001', 'dd-nang-009', 'dd-trung_binh-020', 'dis-nang-004', 'dis-nang-007', 'food-nang-007', 'ov-multirx-004', 'rt-label-010']
- with_hallucination: 11 — ['dd-nang-001', 'dd-nang-009', 'dd-nang-015', 'dd-nhe-034', 'dd-nhe-037', 'dd-nhe-041', 'dd-trung_binh-020', 'dis-nang-004', 'dis-nang-007', 'food-nang-007', 'rt-label-010']
- with_fabricated_numbers: 1 — ['ov-multirx-004']
- with_management_leak: 0 — []

## relevance  ·  n=96 (parse OK 96)
- **mean_score: 4.531**
- entity_leak: 10 — ['dd-nang-004', 'dd-nang-009', 'dd-trung_binh-017', 'dd-trung_binh-019', 'dd-trung_binh-031', 'dis-trung_binh-012', 'food-nang-005', 'rt-label-010', 'rt-sokieu-008', 'rt-xutri-001']
- below_4: 13 — ['dd-nhe-035', 'dd-nhe-045', 'dd-trung_binh-018', 'dd-trung_binh-019', 'dd-trung_binh-026', 'dis-trung_binh-012', 'dis-trung_binh-017', 'food-nang-002', 'food-nhe-019', 'food-trung_binh-014', 'food-trung_binh-015', 'rt-sokieu-007', 'rt-xutri-003']

## completeness  ·  n=85 (parse OK 85)
- **mean_score: 1.0**
- missing_mechanism: 0 — []
- missing_consequence: 0 — []

## consistency  ·  n=20 (parse OK 20)
- **clinically_equivalent_rate: 1.0**
- with_claim_flips: 0 — []
- safety_property_changed: 6 — ['dd-nang-001', 'dd-nang-005', 'dd-trung_binh-029', 'dis-nang-007', 'food-trung_binh-011', 'food-trung_binh-015']
