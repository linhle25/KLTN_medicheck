# Judge summary (metric 1, 4, 5, 6)

## faithfulness  ·  n=104 (parse OK 104)
- **mean_faithfulness: 0.8891**
- fail: 14 — ['dd-nang-007', 'dd-nang-009', 'dd-nang-015', 'dd-nhe-035', 'dd-trung_binh-020', 'dis-nang-001', 'dis-nang-007', 'dis-nhe-019', 'dis-trung_binh-014', 'food-nang-007', 'food-trung_binh-011', 'rt-sokieu-007', 'rt-sokieu-008', 'rt-xutri-003']
- with_hallucination: 20 — ['dd-nang-007', 'dd-nang-009', 'dd-nang-013', 'dd-nang-015', 'dd-nhe-035', 'dd-nhe-041', 'dd-nhe-044', 'dd-trung_binh-020', 'dd-trung_binh-031', 'dis-nang-001', 'dis-nang-007', 'dis-nhe-019', 'food-nang-007', 'food-nhe-017', 'food-trung_binh-011']
- with_fabricated_numbers: 0 — []
- with_management_leak: 1 — ['dis-trung_binh-014']

## relevance  ·  n=96 (parse OK 96)
- **mean_score: 3.292**
- entity_leak: 38 — ['dd-nang-002', 'dd-nang-004', 'dd-nang-009', 'dd-nang-010', 'dd-nhe-033', 'dd-nhe-034', 'dd-nhe-035', 'dd-nhe-040', 'dd-nhe-045', 'dd-nhe-046', 'dd-trung_binh-017', 'dd-trung_binh-019', 'dd-trung_binh-020', 'dd-trung_binh-022', 'dd-trung_binh-023']
- below_4: 44 — ['dd-nang-002', 'dd-nang-004', 'dd-nang-006', 'dd-nang-010', 'dd-nang-013', 'dd-nang-014', 'dd-nhe-033', 'dd-nhe-034', 'dd-nhe-035', 'dd-nhe-038', 'dd-nhe-040', 'dd-nhe-045', 'dd-nhe-046', 'dd-trung_binh-017', 'dd-trung_binh-018']

## completeness  ·  n=85 (parse OK 85)
- **mean_score: 0.912**
- missing_mechanism: 10 — ['dd-nang-014', 'dd-nhe-035', 'dd-nhe-039', 'dd-nhe-044', 'dd-trung_binh-019', 'dd-trung_binh-029', 'dis-nang-001', 'dis-nang-002', 'dis-trung_binh-016', 'food-nang-003']
- missing_consequence: 3 — ['dd-nhe-035', 'dis-nhe-019', 'food-nhe-018']

## consistency  ·  n=20 (parse OK 20)
- **clinically_equivalent_rate: 0.85**
- with_claim_flips: 3 — ['dd-nang-013', 'dis-nang-007', 'food-trung_binh-011']
- safety_property_changed: 5 — ['dd-nang-001', 'dd-nang-005', 'dd-nhe-041', 'dd-trung_binh-029', 'food-trung_binh-011']
