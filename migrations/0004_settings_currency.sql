-- v2.6: settings (currency first) and the currency each saved price was entered in.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
ALTER TABLE sources ADD COLUMN bought_currency TEXT;
ALTER TABLE sources ADD COLUMN given_currency TEXT;
-- Hubs created before this version stored prices in INR: keep them in INR. New hubs start empty and pick their own.
INSERT INTO settings (key, value) SELECT 'currency', 'INR' WHERE EXISTS (SELECT 1 FROM sources);
UPDATE sources SET bought_currency = 'INR' WHERE bought_price IS NOT NULL;
UPDATE sources SET given_currency = 'INR' WHERE given_price IS NOT NULL;
