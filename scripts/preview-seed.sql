-- Sample library for visual checks and the README screenshots (local database only). Well-known books; prices
-- and counts are illustrative.
INSERT INTO settings (key, value) VALUES ('currency', 'USD'), ('taste_card', 'done');
INSERT INTO sources (id, title, authors, title_key, author_key, type, year, one_liner, library_status, buy_rank, cover_url) VALUES
(1,'The Count of Monte Cristo','["Alexandre Dumas"]','count of monte cristo','dumas','fiction',1844,'A young sailor, betrayed and jailed for years, escapes with a fortune and a plan.','want_to_buy',1,'https://covers.openlibrary.org/b/isbn/9780140449266-M.jpg'),
(2,'Thinking, Fast and Slow','["Daniel Kahneman"]','thinking fast and slow','kahneman','nonfiction',2011,'The two systems that drive how we think, and the mistakes they make.','want_to_buy',2,'https://covers.openlibrary.org/b/isbn/9780374533557-M.jpg'),
(3,'Project Hail Mary','["Andy Weir"]','project hail mary','weir','fiction',2021,'A science teacher wakes up alone on a spaceship with no memory of why he is there.','reading',NULL,'https://covers.openlibrary.org/b/isbn/9780593135204-M.jpg'),
(4,'The Art of War','["Sun Tzu"]','art of war','sun tzu','nonfiction',-500,'Thirteen short chapters on winning conflicts, ideally without fighting.','own',NULL,'https://covers.openlibrary.org/b/isbn/9781590302255-M.jpg'),
(5,'Educated','["Tara Westover"]','educated','westover','autobiography',2018,'A girl raised without school in rural Idaho teaches herself into Cambridge.','finished',NULL,'https://covers.openlibrary.org/b/isbn/9780399590504-M.jpg'),
(6,'The Old Man and the Sea','["Ernest Hemingway"]','old man and the sea','hemingway','fiction',1952,'An old fisherman fights a giant marlin far out at sea.','finished',NULL,'https://covers.openlibrary.org/b/isbn/9780684801223-M.jpg'),
(7,'A Short History of Nearly Everything','["Bill Bryson"]','short history of nearly everything','bryson','nonfiction',2003,'How we know what we know about the universe, told with curiosity and humour.','none',NULL,'https://covers.openlibrary.org/b/isbn/9780767908184-M.jpg'),
(8,'The Remains of the Day','["Kazuo Ishiguro"]','remains of the day','ishiguro','fiction',1989,'An English butler looks back on a lifetime of loyal service on a road trip.','none',NULL,'https://covers.openlibrary.org/b/isbn/9780679731726-M.jpg'),
(9,'Deep Work','["Cal Newport"]','deep work','newport','nonfiction',2016,'Why focused, undistracted work is rare and valuable, and how to do more of it.','archived',NULL,'https://covers.openlibrary.org/b/isbn/9781455586691-M.jpg');
UPDATE sources SET archive_reason = 'read_via_summary' WHERE id = 9;
UPDATE sources SET rating = 8, reread = 'maybe' WHERE id = 6;
INSERT INTO notes (source_id, text, kind) VALUES
(6, '## One-line verdict' || char(10) || 'Simple, short and still moving decades later.' || char(10) || char(10) || '## What I took away' || char(10) || 'Dignity is in how you fight, not whether you win.', 'review'),
(3, 'Chapter 6: the science is explained so clearly that the puzzle feels like mine to solve.', 'note');
INSERT INTO facts (source_id, field, value) VALUES (1,'price','$18'),(2,'price','$14');
INSERT INTO source_tags VALUES (3,'page-turner'),(3,'sci-fi'),(4,'strategy'),(7,'science'),(8,'literary'),(2,'psychology'),(2,'decision making');
INSERT INTO cards (source_id, card) VALUES
(1, '{"markdown":"**The Count of Monte Cristo — Alexandre Dumas (1844). Fit 8/10.**\nIn one line: a young sailor, betrayed and jailed for years, escapes with a fortune and a plan.\nAuthor: one of the most-read French novelists; also wrote The Three Musketeers.\nCore idea (premise only): Edmond Dantès is framed on his wedding day, spends years in a fortress prison, then returns as the mysterious Count.\nFit: a long but gripping adventure — revenge, disguise and twists, chapter after chapter.\nClassic status: strong. In print for over 180 years, adapted for film and TV many times.\nWeaknesses: very long (well over 1,000 pages unabridged); some middle chapters are slow.\nWhich translation: Robin Buss (Penguin Classics, 1996), complete and modern; avoid abridged editions.\nConfidence: High.\nBuy: first-hand, the Penguin Classics edition.","timeless":"not_applicable","buy":"first_hand","confidence":"high"}'),
(7, '{"markdown":"card","timeless":"yes"}'), (2, '{"markdown":"card","timeless":"yes"}');
INSERT INTO requests (id, feature, input, fingerprint) VALUES (1,'recs','how science works','f1'),(2,'recs','books that make you curious','f2'),(3,'recs','popular science for beginners','f3');
INSERT INTO appearances (request_id, source_id, rank, origin) VALUES (1,7,1,'recommended'),(2,7,1,'recommended'),(3,7,2,'recommended'),(2,8,3,'recommended');
INSERT INTO summaries (source_id, body) VALUES (9, '# Deep Work — summary');
