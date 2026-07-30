-- ════════════════════════════════════════════════════════════════════════════
-- Migration 036: Soft Skills domain + operational/tender-prep skills
-- Deliberate expansion beyond PRD §7.15's original eight technology domains
-- to a ninth ("Soft Skills"), per HOD request — interpersonal/behavioral
-- competency is a genuinely different axis from named technical depth.
-- Also adds tender-preparation-specific skills under the existing
-- "Consultancy" domain, which the seed data already uses for client/deal-
-- facing deliverable skills (Tender Writing, Client Presentation).
-- Depends on: SKILL (009)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE SKILL DROP CONSTRAINT chk_skill_domain;
ALTER TABLE SKILL ADD CONSTRAINT chk_skill_domain CHECK (TechnologyDomain IN
    ('Cloud','Cyber Security','Data Centre','Network','Enterprise Architecture','AI / HPC','BIM','Consultancy','Soft Skills'));

INSERT INTO SKILL (SkillName, TechnologyDomain) VALUES
('Client Communication', 'Soft Skills'),
('Negotiation', 'Soft Skills'),
('Team Leadership', 'Soft Skills'),
('Conflict Resolution', 'Soft Skills'),
('Time & Priority Management', 'Soft Skills'),
('Tender Technical Writeup', 'Consultancy'),
('Solution Costing & Estimation', 'Consultancy'),
('RFP Response Preparation', 'Consultancy'),
('Bid Defense / Client Q&A', 'Consultancy')
ON CONFLICT (SkillName, TechnologyDomain) DO NOTHING;
