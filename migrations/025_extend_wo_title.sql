-- Migration 025: Extend csi_wo.title to 500 chars for longer WO titles
ALTER TABLE csi_wo ALTER COLUMN title TYPE VARCHAR(500);
