-- ════════════════════════════════════════════════════════════════════════════
-- Seed 004: CMP period reference data
-- Reference: migration 047 (cmp_periods)
-- Depends on: migration 047 (cmp_periods table)
-- ════════════════════════════════════════════════════════════════════════════

-- Pure reference/lookup data, safe to seed immediately. Idempotent.
INSERT INTO cmp_periods (code, label, year_number, quarter_number, sort_order) VALUES
    ('BASELINE', 'Baseline', NULL, NULL, 1),
    ('Y1Q1', 'Y1 Q1', 1, 1, 2),
    ('Y1Q2', 'Y1 Q2', 1, 2, 3),
    ('Y1Q3', 'Y1 Q3', 1, 3, 4),
    ('Y1Q4', 'Y1 Q4', 1, 4, 5),
    ('Y2Q1', 'Y2 Q1', 2, 1, 6),
    ('Y2Q2', 'Y2 Q2', 2, 2, 7),
    ('Y2Q3', 'Y2 Q3', 2, 3, 8),
    ('Y2Q4', 'Y2 Q4', 2, 4, 9),
    ('Y3Q1', 'Y3 Q1', 3, 1, 10),
    ('Y3Q2', 'Y3 Q2', 3, 2, 11),
    ('Y3Q3', 'Y3 Q3', 3, 3, 12),
    ('Y3Q4', 'Y3 Q4', 3, 4, 13),
    ('Y4Q1', 'Y4 Q1', 4, 1, 14),
    ('Y4Q2', 'Y4 Q2', 4, 2, 15),
    ('Y4Q3', 'Y4 Q3', 4, 3, 16),
    ('Y4Q4', 'Y4 Q4', 4, 4, 17),
    ('Y5Q1', 'Y5 Q1', 5, 1, 18),
    ('Y5Q2', 'Y5 Q2', 5, 2, 19),
    ('Y5Q3', 'Y5 Q3', 5, 3, 20),
    ('Y5Q4', 'Y5 Q4', 5, 4, 21)
ON CONFLICT (code) DO NOTHING;
