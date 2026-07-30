-- ════════════════════════════════════════════════════════════════════════════
-- Migration 035: General IT Knowledge Baseline
-- An objective multiple-choice quiz, distinct from the self-rated skill
-- rubric (034) — measures a company-wide IT literacy floor rather than
-- named-skill depth. Question bank starts entirely INACTIVE: nothing is
-- scored against these until an Admin/HOD reviews and activates them.
-- Depends on: STAFF
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IT_KNOWLEDGE_QUESTION (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    QuestionText    TEXT NOT NULL,
    OptionA         VARCHAR(300) NOT NULL,
    OptionB         VARCHAR(300) NOT NULL,
    OptionC         VARCHAR(300) NOT NULL,
    OptionD         VARCHAR(300) NOT NULL,
    CorrectOption   CHAR(1) NOT NULL,
    Category        VARCHAR(50) NOT NULL,
    IsActive        BOOLEAN NOT NULL DEFAULT false,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT chk_itq_correct_option CHECK (CorrectOption IN ('A','B','C','D')),
    CONSTRAINT chk_itq_category CHECK (Category IN ('Networking','Security','Cloud','Hardware & OS','General'))
);
COMMENT ON TABLE IT_KNOWLEDGE_QUESTION IS 'Admin-managed general IT knowledge question bank; IsActive gates whether a question appears in the live quiz';

CREATE TABLE IT_KNOWLEDGE_ATTEMPT (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    StaffId         UUID NOT NULL REFERENCES STAFF(Id) ON DELETE CASCADE,
    QuarterLabel    VARCHAR(7) NOT NULL,
    TotalQuestions  SMALLINT NOT NULL,
    CorrectCount    SMALLINT NOT NULL,
    ScorePercent    SMALLINT NOT NULL,
    Level           VARCHAR(20) NOT NULL,
    Answers         JSONB NOT NULL,
    SubmittedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_itattempt_quarter UNIQUE (StaffId, QuarterLabel),
    CONSTRAINT chk_itattempt_level CHECK (Level IN ('Beginner','Intermediate','Advanced','Expert')),
    CONSTRAINT chk_itattempt_score CHECK (ScorePercent BETWEEN 0 AND 100)
);
COMMENT ON TABLE IT_KNOWLEDGE_ATTEMPT IS 'One quiz attempt per staff per quarter; score computed server-side from Answers, never trusted from the client';

CREATE INDEX idx_itattempt_staff ON IT_KNOWLEDGE_ATTEMPT(StaffId);

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON IT_KNOWLEDGE_QUESTION
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Starter question bank (draft — IsActive = false) ─────────────────────────
-- 20 general IT-fundamentals questions, 4 per category. Reviewed/edited by an
-- Admin/HOD via the admin UI before being activated; nothing here is live.

INSERT INTO IT_KNOWLEDGE_QUESTION (QuestionText, OptionA, OptionB, OptionC, OptionD, CorrectOption, Category) VALUES
('What does "DNS" stand for?', 'Domain Name System', 'Dynamic Network Service', 'Direct Network Setup', 'Domain Network Server', 'A', 'Networking'),
('Which port is commonly used for HTTPS traffic?', '21', '80', '443', '3389', 'C', 'Networking'),
('In networking, what does a VPN primarily provide?', 'Faster internet speed', 'A secure, encrypted connection over a public network', 'Automatic IP address assignment', 'Wireless signal boosting', 'B', 'Networking'),
('What is the purpose of a subnet mask?', 'To encrypt network traffic', 'To assign a domain name', 'To divide an IP address into network and host portions', 'To block unauthorized websites', 'C', 'Networking'),

('What is "phishing"?', 'A method of speeding up network traffic', 'A social engineering attack that tricks users into revealing sensitive information', 'A type of firewall configuration', 'A backup strategy', 'B', 'Security'),
('What does MFA (Multi-Factor Authentication) add to a login process?', 'A second password only', 'An additional verification step beyond just a password', 'Automatic password reset', 'Faster login speed', 'B', 'Security'),
('Which of these is generally considered the strongest password practice?', 'Using the same password across all systems', 'Using a long, unique passphrase with a password manager', 'Writing passwords on a sticky note', 'Changing your password every day', 'B', 'Security'),
('What is the main purpose of a firewall?', 'To speed up internet browsing', 'To monitor and control incoming/outgoing network traffic based on rules', 'To store backup files', 'To manage user email accounts', 'B', 'Security'),

('What does "SaaS" stand for?', 'System as a Server', 'Software as a Service', 'Storage as a Solution', 'Security as a Standard', 'B', 'Cloud'),
('In cloud computing, what is "scalability"?', 'The ability to encrypt data automatically', 'The ability to increase or decrease resources based on demand', 'The physical size of a data center', 'The number of users allowed to log in', 'B', 'Cloud'),
('Which of the following is a major public cloud provider?', 'Cisco', 'Amazon Web Services', 'Adobe', 'Oracle Financials', 'B', 'Cloud'),
('What is the key difference between IaaS and SaaS?', 'IaaS provides ready-to-use software; SaaS provides raw infrastructure', 'IaaS provides infrastructure to build on; SaaS delivers a complete, ready-to-use application', 'There is no difference', 'SaaS is only used for email', 'B', 'Cloud'),

('What does "RAM" stand for?', 'Random Access Memory', 'Read Access Module', 'Rapid Application Manager', 'Remote Access Machine', 'A', 'Hardware & OS'),
('What is the primary function of an operating system?', 'To design websites', 'To manage hardware resources and provide a platform for applications to run', 'To send emails', 'To create spreadsheets', 'B', 'Hardware & OS'),
('What is the difference between an SSD and an HDD?', 'SSDs use spinning magnetic disks; HDDs use flash memory', 'SSDs use flash memory (faster, no moving parts); HDDs use spinning magnetic disks', 'There is no functional difference', 'HDDs are always faster than SSDs', 'B', 'Hardware & OS'),
('What does BIOS/UEFI do when a computer starts up?', 'Connects to the internet automatically', 'Initializes hardware and starts the boot process before the OS loads', 'Scans for viruses', 'Installs software updates', 'B', 'Hardware & OS'),

('What is a common purpose of regular data backups?', 'To make the computer run faster', 'To protect against data loss from hardware failure, errors, or attacks', 'To reduce internet usage', 'To automatically update software', 'B', 'General'),
('What does "SLA" typically refer to in an IT services context?', 'Server Load Average', 'Service Level Agreement — a commitment on service quality/response time', 'System Login Access', 'Software License Agreement', 'B', 'General'),
('What is the purpose of version control (e.g. Git)?', 'To speed up computer performance', 'To track and manage changes to files/code over time, enabling collaboration', 'To create backups only', 'To encrypt data automatically', 'B', 'General'),
('Why is documentation important in an IT project?', 'It is optional and rarely needed', 'It ensures knowledge is captured and can be understood/maintained by others', 'It replaces the need for testing', 'It is only required for legal reasons', 'B', 'General');
