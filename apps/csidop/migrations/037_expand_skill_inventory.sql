-- ════════════════════════════════════════════════════════════════════════════
-- Migration 037: Expand skill inventory for comprehensive coverage
-- The original seed only had 2-6 skills per domain (26 total) - too thin for
-- staff to get a real capability picture during self-assessment. Adds ~62
-- industry-standard skills across all 9 domains, per HOD review/approval.
-- Depends on: SKILL (009), 036 (Soft Skills domain)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO SKILL (SkillName, TechnologyDomain) VALUES
-- Cloud
('Cloud Migration & Modernization', 'Cloud'),
('Cloud Cost Optimization (FinOps)', 'Cloud'),
('Kubernetes / Container Orchestration', 'Cloud'),
('Serverless Architecture', 'Cloud'),
('Cloud Security & Compliance', 'Cloud'),
('Multi-Cloud / Hybrid Cloud Strategy', 'Cloud'),
('Infrastructure as Code', 'Cloud'),
('Cloud Backup & Disaster Recovery', 'Cloud'),

-- Cyber Security
('SOC / SIEM Operations', 'Cyber Security'),
('Identity & Access Management', 'Cyber Security'),
('Endpoint Detection & Response', 'Cyber Security'),
('Vulnerability Assessment & Management', 'Cyber Security'),
('Security Compliance & Governance', 'Cyber Security'),
('Incident Response & Forensics', 'Cyber Security'),
('Zero Trust Architecture', 'Cyber Security'),
('Firewall & IPS/IDS Management', 'Cyber Security'),

-- Data Centre
('Data Centre Design & Planning', 'Data Centre'),
('Backup & Disaster Recovery', 'Data Centre'),
('Hyperconverged Infrastructure', 'Data Centre'),
('Power & Cooling Systems', 'Data Centre'),
('SAN/NAS Administration', 'Data Centre'),
('Data Centre Migration', 'Data Centre'),
('Business Continuity Planning', 'Data Centre'),

-- Network
('Network Design & Architecture', 'Network'),
('Wireless (WLAN) Design', 'Network'),
('Network Automation & Scripting', 'Network'),
('Load Balancing', 'Network'),
('VoIP / Unified Communications', 'Network'),
('Network Monitoring & Troubleshooting', 'Network'),
('WAN Optimization', 'Network'),

-- Enterprise Architecture
('Business Process Modelling', 'Enterprise Architecture'),
('IT Strategy & Roadmapping', 'Enterprise Architecture'),
('System Integration Design', 'Enterprise Architecture'),
('Data Architecture & Governance', 'Enterprise Architecture'),
('API Management & Integration', 'Enterprise Architecture'),
('Legacy System Modernization', 'Enterprise Architecture'),

-- AI / HPC
('AI/ML Model Development', 'AI / HPC'),
('Data Science & Analytics', 'AI / HPC'),
('HPC Design', 'AI / HPC'),
('NLP / GenAI Solutions', 'AI / HPC'),
('MLOps Pipeline Design', 'AI / HPC'),
('AI Ethics & Governance', 'AI / HPC'),

-- BIM
('Navisworks Clash Detection', 'BIM'),
('BIM Execution Planning (BEP)', 'BIM'),
('4D/5D BIM (Scheduling & Costing)', 'BIM'),
('MEP Coordination', 'BIM'),
('BIM Standards (ISO 19650)', 'BIM'),
('Point Cloud / Laser Scanning', 'BIM'),
('Structural Modelling', 'BIM'),
('Digital Twin Development', 'BIM'),

-- Consultancy
('Requirements Gathering & Analysis', 'Consultancy'),
('Stakeholder Management', 'Consultancy'),
('Business Case Development', 'Consultancy'),
('Change Management', 'Consultancy'),
('Project Scoping & Planning', 'Consultancy'),
('Vendor/Partner Management', 'Consultancy'),

-- Soft Skills
('Public Speaking / Presentation', 'Soft Skills'),
('Cross-functional Collaboration', 'Soft Skills'),
('Problem Solving & Critical Thinking', 'Soft Skills'),
('Adaptability & Resilience', 'Soft Skills'),
('Mentoring & Coaching', 'Soft Skills'),
('Emotional Intelligence', 'Soft Skills')
ON CONFLICT (SkillName, TechnologyDomain) DO NOTHING;
