-- v2.11: a "stopped" status for books put down partway. The status column is rebuilt without a fixed list of values
-- (the code checks them), like the verdict column in 0006, so new statuses need no migration.
DROP INDEX IF EXISTS idx_sources_status;
ALTER TABLE sources ADD COLUMN library_status_new TEXT NOT NULL DEFAULT 'none';
UPDATE sources SET library_status_new = library_status;
ALTER TABLE sources DROP COLUMN library_status;
ALTER TABLE sources RENAME COLUMN library_status_new TO library_status;
CREATE INDEX idx_sources_status ON sources (library_status);
