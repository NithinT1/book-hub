-- v2.8: every book gets a Verdict (what to do with it), kept with its history. Quality and Fit live in the card.
-- Rules get clearer names, and a reader can load their own saved quality scores as a reference.

ALTER TABLE sources ADD COLUMN verdict TEXT CHECK (verdict IN ('read','read_parts','reread','idea_only','bench','skip','not_sure'));
ALTER TABLE sources ADD COLUMN verdict_how TEXT;   -- first_hand | second_hand | kindle | modern_alternative | borrow
ALTER TABLE sources ADD COLUMN verdict_why TEXT;
ALTER TABLE sources ADD COLUMN verdict_by TEXT;    -- ai | me (me = locked: the AI never changes it)
ALTER TABLE sources ADD COLUMN verdict_at TEXT;

CREATE TABLE verdict_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  verdict TEXT NOT NULL,
  how TEXT,
  why TEXT,
  set_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_verdict_history_source ON verdict_history (source_id);

-- Books scored outside Book Hub (e.g. the reader's own spreadsheet). Matched by title and author; keys are filled
-- in by the hub on first use, so an import only needs title, author and score.
CREATE TABLE reference_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT,
  title_key TEXT NOT NULL DEFAULT '',
  author_key TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL,
  tier TEXT,
  factors TEXT,
  belief TEXT,
  mistake TEXT,
  confidence TEXT,
  note TEXT
);
CREATE INDEX idx_reference_keys ON reference_scores (title_key);

-- Earlier cards carried a buy decision; it becomes the starting Verdict until the book comes up again.
UPDATE sources SET
  verdict = (SELECT CASE json_extract(c.card, '$.buy')
      WHEN 'first_hand' THEN 'read' WHEN 'second_hand' THEN 'read' WHEN 'kindle' THEN 'read'
      WHEN 'summary' THEN 'idea_only' WHEN 'skip' THEN 'skip' WHEN 'not_sure' THEN 'not_sure' END
    FROM cards c WHERE c.source_id = sources.id),
  verdict_how = (SELECT CASE json_extract(c.card, '$.buy') WHEN 'first_hand' THEN 'first_hand' WHEN 'second_hand' THEN 'second_hand' WHEN 'kindle' THEN 'kindle' END
    FROM cards c WHERE c.source_id = sources.id),
  verdict_why = 'From the earlier buy decision',
  verdict_by = 'ai',
  verdict_at = (SELECT c.updated_at FROM cards c WHERE c.source_id = sources.id)
WHERE id IN (SELECT source_id FROM cards WHERE json_extract(card, '$.buy') IS NOT NULL);
INSERT INTO verdict_history (source_id, verdict, how, why, set_by, created_at)
  SELECT id, verdict, verdict_how, verdict_why, 'ai', verdict_at FROM sources WHERE verdict IS NOT NULL;

-- Clearer rule names; earlier versions move with them. If the new code already seeded a starter under a new name
-- (a request between deploy and this migration), the renamed rule replaces it.
DELETE FROM rules WHERE name = 'fiction-profile' AND EXISTS (SELECT 1 FROM rules WHERE name = 'fiction-taste');
DELETE FROM rules WHERE name = 'nonfiction-profile' AND EXISTS (SELECT 1 FROM rules WHERE name = 'nonfiction-taste');
DELETE FROM rules WHERE name = 'buying-preferences' AND EXISTS (SELECT 1 FROM rules WHERE name = 'buy-decision');
UPDATE rules SET name = 'fiction-profile' WHERE name = 'fiction-taste';
UPDATE rules_history SET name = 'fiction-profile' WHERE name = 'fiction-taste';
UPDATE rules SET name = 'nonfiction-profile' WHERE name = 'nonfiction-taste';
UPDATE rules_history SET name = 'nonfiction-profile' WHERE name = 'nonfiction-taste';
UPDATE rules SET name = 'buying-preferences' WHERE name = 'buy-decision';
UPDATE rules_history SET name = 'buying-preferences' WHERE name = 'buy-decision';

-- The timeless test is now part of the Quality rule. Its versions stay readable in history.
INSERT OR IGNORE INTO rules_history (name, version, body, saved_at)
  SELECT name, version, body, updated_at FROM rules WHERE name = 'timeless-nonfiction';
DELETE FROM rules WHERE name = 'timeless-nonfiction';

-- The Home card that asked for taste is now the set-up card.
UPDATE settings SET key = 'setup_card' WHERE key = 'taste_card';
