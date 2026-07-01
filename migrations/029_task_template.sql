-- Task templates: default checklist items per request type
-- Configurable by HOD/SM via Admin panel

CREATE TABLE IF NOT EXISTS task_template (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requesttypeid UUID NOT NULL REFERENCES request_type(id) ON DELETE CASCADE,
  taskname    VARCHAR(500) NOT NULL,
  scope       VARCHAR(20) NOT NULL DEFAULT 'Internal',
  sortorder   INT NOT NULL DEFAULT 0,
  createdat   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_template_reqtype ON task_template(requesttypeid, sortorder);

-- Seed existing Tender / RFP tasks as templates
INSERT INTO task_template (requesttypeid, taskname, scope, sortorder)
SELECT rt.id, t.taskname, 'Internal', t.sortorder
FROM request_type rt
CROSS JOIN (VALUES
  ('Initial Review & Requirement Understanding', 1),
  ('Solution Recommendation / Proposal Strategy', 2),
  ('Product / Solution Definition', 3),
  ('Cuicu Fill-up for CMT Partner Request', 4),
  ('Implementation Schedule / Gantt Chart', 5),
  ('Project Team & Organisation Chart', 6),
  ('Experience Profile / Track Record / Brochure', 7),
  ('Risk Assessment', 8),
  ('Partner / Vendor Quotation & Technical Confirmation', 9),
  ('Bill of Materials', 10),
  ('Compliance Matrix', 11),
  ('Solution Architecture Diagram', 12),
  ('Technical Proposal Write-up', 13),
  ('Final Review & Submission', 14)
) AS t(taskname, sortorder)
WHERE rt.typename = 'Tender / RFP'
ON CONFLICT DO NOTHING;
