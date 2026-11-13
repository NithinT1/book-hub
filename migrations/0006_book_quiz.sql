-- v2.9: Book Quiz. Every quiz is kept; the latest one per book counts. A quiz can set (and lock) the Verdict,
-- which gains "practise": you know a self-help book's ideas, so practising beats reading.

-- The verdict column is rebuilt without a fixed list of values (the code checks them), so new values need no migration.
ALTER TABLE sources ADD COLUMN verdict_new TEXT;
UPDATE sources SET verdict_new = verdict;
ALTER TABLE sources DROP COLUMN verdict;
ALTER TABLE sources RENAME COLUMN verdict_new TO verdict;

CREATE TABLE quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  score REAL NOT NULL,              -- "You already know": 0–10, high = the reader already holds the book
  practice REAL,                    -- self-help books: how much the reader actually does it, 0–10
  mode TEXT NOT NULL DEFAULT 'scan', -- scan | deep
  partial INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,                     -- keep | skip | practise | info (informs only; never sets the Verdict)
  verdict TEXT,
  verdict_why TEXT,
  practice_tip TEXT,
  ideas TEXT NOT NULL DEFAULT '[]', -- JSON: [{ idea, core, result, covered_by, note }]
  ideas_left TEXT NOT NULL DEFAULT '[]',
  replacement TEXT,
  chapters TEXT,
  confidence TEXT,
  summary TEXT,                     -- the debrief: what the book holds, what's new for the reader
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_quizzes_source ON quizzes (source_id);
