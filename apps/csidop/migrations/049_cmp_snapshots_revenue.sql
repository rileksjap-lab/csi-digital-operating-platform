-- ════════════════════════════════════════════════════════════════════════════
-- Migration 049: CMP Hierarchy Engine — Snapshots, Revenue/Commercial Model
-- Reference: TECH_01_DATA_DICTIONARY, 04_DASHBOARD_SCURVE, 08_REVENUE_MODEL
-- Tables: cmp_snapshots, cmp_revenue
-- Depends on: staff, cmp_plans, cmp_workstreams (047)
-- ════════════════════════════════════════════════════════════════════════════

-- Historical S-Curve data points, monthly/quarterly, supporting all three
-- required curves (Baseline, Actual, Forecast) at both plan level
-- (workstream_id NULL) and per-workstream level ("Support S-Curves for
-- Overall CMP and every workstream, including Healthcare").
CREATE TABLE cmp_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES cmp_plans(id) ON DELETE CASCADE,
    workstream_id   UUID REFERENCES cmp_workstreams(id) ON DELETE CASCADE,
    period_code     VARCHAR(10) NOT NULL REFERENCES cmp_periods(code) ON DELETE RESTRICT,
    snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    baseline_pct    NUMERIC(6,4) NOT NULL,
    actual_progress NUMERIC(6,4),
    forecast_pct    NUMERIC(6,4),
    captured_by     UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cmpsnapshots_period UNIQUE (plan_id, workstream_id, period_code)
);
COMMENT ON TABLE cmp_snapshots IS 'Historical S-Curve points (source: 04_DASHBOARD_SCURVE). workstream_id NULL = overall-plan snapshot. Once captured for a period, a snapshot''s baseline_pct and actual_progress are historical record and should not be silently overwritten by later recalculation (TC08: "Snapshot saved for Q1 -> historical S-Curve preserves prior actual progress") — only forecast_pct is expected to keep moving for still-open periods.';

-- Commercial/revenue model (source: 08_REVENUE_MODEL). Deliberately separate
-- from the readiness/progress hierarchy — "Keep transformation readiness
-- separate from commercial performance" (master prompt).
CREATE TABLE cmp_revenue (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id               UUID NOT NULL REFERENCES cmp_plans(id) ON DELETE CASCADE,
    service_code          VARCHAR(20) NOT NULL,
    business_unit_entity  VARCHAR(200) NOT NULL,
    service_name          VARCHAR(200) NOT NULL,
    customer_segment      VARCHAR(200),
    revenue_model         VARCHAR(100),
    billing_unit          VARCHAR(50),
    contract_term         VARCHAR(50),
    selling_price         NUMERIC(15,2),
    delivery_cost         NUMERIC(15,2),
    gross_margin          NUMERIC(6,4) GENERATED ALWAYS AS (
                              CASE WHEN selling_price IS NOT NULL AND selling_price > 0
                                   THEN (selling_price - delivery_cost) / selling_price
                                   ELSE NULL END
                          ) STORED,
    pipeline_value        NUMERIC(15,2),
    probability            NUMERIC(5,4),
    weighted_revenue        NUMERIC(15,2) GENERATED ALWAYS AS (
                              CASE WHEN pipeline_value IS NOT NULL AND probability IS NOT NULL
                                   THEN pipeline_value * probability
                                   ELSE NULL END
                          ) STORED,
    recurring              BOOLEAN NOT NULL DEFAULT false,
    owner_role_title       VARCHAR(100),
    notes                  TEXT,
    created_by             UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ,
    CONSTRAINT uq_cmprevenue_code UNIQUE (plan_id, service_code),
    CONSTRAINT chk_cmprevenue_probability CHECK (probability IS NULL OR probability BETWEEN 0 AND 1)
);
COMMENT ON TABLE cmp_revenue IS 'Revenue/commercial model per service (source: 08_REVENUE_MODEL). WARNING: the source workbook''s Selling Price, Delivery Cost, Pipeline Value columns were found corrupted (Excel date values like "1949-04-12" instead of currency) at the time this schema was written — do not import those columns as-is; they need Finance correction at the source first. gross_margin and weighted_revenue are safe generated columns (NULL when inputs are missing, never a false 0 or a divide-by-zero error).';

CREATE INDEX idx_cmpsnapshots_planid ON cmp_snapshots(plan_id);
CREATE INDEX idx_cmpsnapshots_workstreamid ON cmp_snapshots(workstream_id);
CREATE INDEX idx_cmprevenue_planid ON cmp_revenue(plan_id);
