-- Step 2: the real data model (see Book Hub Engineering §3). The step 1 test table goes away.
DROP TABLE IF EXISTS test_records;

-- A source is one work: a book, paper, article, blog post, thread or talk.
-- Translations and editions of the same work are rows in `editions`, not new sources.
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'book' CHECK (kind IN ('book','paper','article','blog','thread','talk','video','other')),
  title TEXT NOT NULL,
  subtitle TEXT,
  authors TEXT NOT NULL DEFAULT '[]',          -- JSON array; original author first (e.g. Homer, not the translator)
  title_key TEXT NOT NULL,                      -- normalised title, for matching
  author_key TEXT NOT NULL DEFAULT '',          -- normalised surname of the first author
  type TEXT CHECK (type IN ('fiction','nonfiction','biography','autobiography')),
  is_textbook INTEGER NOT NULL DEFAULT 0,
  year INTEGER,
  year_source TEXT,                             -- where the year came from: openlibrary | claude-web | claude-memory | user
  pages INTEGER,
  pages_source TEXT,
  difficulty TEXT,                              -- language difficulty: easy | medium | hard
  url TEXT,
  cover_url TEXT,
  library_status TEXT NOT NULL DEFAULT 'none' CHECK (library_status IN ('none','on_shelf','finished')),
  finished_on TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_sources_keys ON sources (author_key, title_key);
CREATE INDEX idx_sources_status ON sources (library_status);

-- Other names a source is known by ("LOTR" = "The Lord of the Rings").
CREATE TABLE source_aliases (
  source_id INTEGER NOT NULL REFERENCES sources(id),
  title_key TEXT NOT NULL,
  author_key TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL,
  PRIMARY KEY (source_id, title_key, author_key)
);
CREATE INDEX idx_aliases_keys ON source_aliases (author_key, title_key);

-- Outside identifiers (ISBN, Open Library work/edition, URL). One source can have many.
CREATE TABLE source_ids (
  kind TEXT NOT NULL CHECK (kind IN ('isbn13','ol_work','ol_edition','url')),
  value TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (kind, value)
);

CREATE TABLE editions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  label TEXT NOT NULL,                          -- e.g. "Emily Wilson translation", "UK paperback"
  translator TEXT,
  publisher TEXT,
  isbn13 TEXT,
  language TEXT,
  owned INTEGER NOT NULL DEFAULT 0,
  notes TEXT,                                   -- e.g. "want to read this translation next"
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_editions_source ON editions (source_id);

-- Researched facts, cached with link and date so they can be reused instead of re-searched.
CREATE TABLE facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  edition_id INTEGER REFERENCES editions(id),
  field TEXT NOT NULL,                          -- amazon_rating | goodreads_rating | price_inr | endorsement | ...
  value TEXT NOT NULL,
  link TEXT,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  note TEXT
);
CREATE INDEX idx_facts_source ON facts (source_id, field);

-- Latest full card per source (JSON), so repeat requests can reuse it.
CREATE TABLE cards (
  source_id INTEGER PRIMARY KEY REFERENCES sources(id),
  card TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Every feature run. Same feature + same input = same fingerprint = counted once.
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature TEXT NOT NULL CHECK (feature IN ('recs','details','discuss','summary','shelf')),
  input TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  runs INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_run_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE appearances (
  request_id INTEGER NOT NULL REFERENCES requests(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  rank INTEGER,
  fit_score REAL,
  origin TEXT NOT NULL CHECK (origin IN ('recommended','list_article','lookup')),
  PRIMARY KEY (request_id, source_id)
);
CREATE INDEX idx_appearances_source ON appearances (source_id);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_notes_source ON notes (source_id);

CREATE TABLE discussions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  locator TEXT,                                 -- chapter / verse / topic
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_discussions_source ON discussions (source_id);

CREATE TABLE summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_summaries_source ON summaries (source_id);

-- Editable criteria. Every save keeps the previous version in rules_history.
CREATE TABLE rules (
  name TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE rules_history (
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (name, version)
);

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  resolved_at TEXT
);

CREATE TABLE test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
