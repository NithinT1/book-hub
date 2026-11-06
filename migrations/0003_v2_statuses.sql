-- v2: seven statuses, buy list, archive reasons, reviews, tags, one-liners, series.
-- The sources table is kept (other tables point at it). The old status column is renamed legacy_status
-- (frozen, unused) and a new library_status column with the seven values takes its place.
-- Mapping: none → none ("not decided"), on_shelf → own, finished → finished.

CREATE TABLE series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  author_key TEXT NOT NULL DEFAULT '',
  books TEXT NOT NULL DEFAULT '[]',            -- JSON [{position, title}] — names only, not sources
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (name_key, author_key)
);

DROP INDEX IF EXISTS idx_sources_status;
ALTER TABLE sources RENAME COLUMN library_status TO legacy_status;
ALTER TABLE sources ADD COLUMN library_status TEXT NOT NULL DEFAULT 'none'
  CHECK (library_status IN ('none','want_to_buy','own','reading','finished','archived','given_away'));
UPDATE sources SET library_status = CASE legacy_status WHEN 'on_shelf' THEN 'own' ELSE legacy_status END;
CREATE INDEX idx_sources_status ON sources (library_status);

ALTER TABLE sources ADD COLUMN one_liner TEXT;                 -- spoiler-free, what it is in one line
ALTER TABLE sources ADD COLUMN status_changed_at TEXT;
ALTER TABLE sources ADD COLUMN buy_rank INTEGER;               -- order on the Buy list (1 = top)
ALTER TABLE sources ADD COLUMN buy_format TEXT CHECK (buy_format IN ('first_hand','second_hand','kindle'));
ALTER TABLE sources ADD COLUMN bought_on TEXT;
ALTER TABLE sources ADD COLUMN bought_format TEXT CHECK (bought_format IN ('first_hand','second_hand','kindle'));
ALTER TABLE sources ADD COLUMN bought_price INTEGER;           -- INR
ALTER TABLE sources ADD COLUMN owned_format TEXT CHECK (owned_format IN ('physical','kindle','both'));
ALTER TABLE sources ADD COLUMN archive_reason TEXT CHECK (archive_reason IN ('not_useful','read_via_summary'));
ALTER TABLE sources ADD COLUMN archived_on TEXT;
ALTER TABLE sources ADD COLUMN given_on TEXT;
ALTER TABLE sources ADD COLUMN given_price INTEGER;
ALTER TABLE sources ADD COLUMN rating INTEGER CHECK (rating BETWEEN 0 AND 10);
ALTER TABLE sources ADD COLUMN reread TEXT CHECK (reread IN ('yes','maybe','no'));
ALTER TABLE sources ADD COLUMN hide_from_featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN series_id INTEGER REFERENCES series(id);
ALTER TABLE sources ADD COLUMN series_position REAL;
CREATE INDEX idx_sources_series ON sources (series_id);

UPDATE sources SET status_changed_at = updated_at WHERE library_status != 'none';
-- One-liners start from the saved card's core idea where there is one.
UPDATE sources SET one_liner = (SELECT json_extract(card, '$.core_idea') FROM cards WHERE cards.source_id = sources.id);

CREATE TABLE source_tags (
  source_id INTEGER NOT NULL REFERENCES sources(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (source_id, tag)
);
CREATE INDEX idx_tags_tag ON source_tags (tag);

-- Notes gain a kind (note | review) and an optional chapter/page.
ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
ALTER TABLE notes ADD COLUMN locator TEXT;

-- Requests and appearances accept new features/origins. Order matters so no row ever points at a missing table:
-- park appearances in a plain copy, swap requests, recreate appearances, restore the rows.
CREATE TABLE requests_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature TEXT NOT NULL CHECK (feature IN ('recs','details','discuss','summary','shelf','store','giveaway','checkin')),
  input TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  runs INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_run_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
INSERT INTO requests_v2 SELECT id, feature, input, fingerprint, runs, created_at, last_run_at FROM requests;
CREATE TABLE appearances_parked AS SELECT request_id, source_id, rank, fit_score, origin FROM appearances;
DROP TABLE appearances;
DROP TABLE requests;
ALTER TABLE requests_v2 RENAME TO requests;
CREATE TABLE appearances (
  request_id INTEGER NOT NULL REFERENCES requests(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  rank INTEGER,
  fit_score REAL,
  origin TEXT NOT NULL CHECK (origin IN ('recommended','list_article','lookup','checkin','store')),
  PRIMARY KEY (request_id, source_id)
);
INSERT INTO appearances SELECT request_id, source_id, rank, fit_score, origin FROM appearances_parked;
DROP TABLE appearances_parked;
CREATE INDEX idx_appearances_source ON appearances (source_id);
