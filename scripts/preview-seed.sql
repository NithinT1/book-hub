-- Sample library for visual checks and the README screenshots (local database only). Well-known books; prices
-- and counts are illustrative.
INSERT INTO settings (key, value) VALUES ('currency', 'USD'), ('setup_card', 'hidden');
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
(7, '{"markdown":"card","timeless":"yes","quality":7.4,"quality_tier":"good","quality_factors":{"Foundation":3,"Reach":5,"Thinking tool":3,"Evidence":4,"Durability":4},"fit":6,"fit_label":"general","fit_reason":"A must-know overview of how science found things out","confidence":"high"}'),
(2, '{"markdown":"card","timeless":"yes","quality":8.8,"quality_tier":"core","quality_factors":{"Foundation":4,"Reach":5,"Thinking tool":5,"Evidence":3,"Durability":4},"fit":8,"fit_label":"self","fit_reason":"Main book for deciding better","belief":"People decide mostly by reason","mistake":"Trusting a confident gut call in unfamiliar situations","critic":"Gerd Gigerenzer","confidence":"high"}'),
(8, '{"markdown":"card","timeless":"yes","quality":8.2,"quality_tier":"strong","fit":4,"fit_reason":"Quiet literary fiction; you asked for page-turners","confidence":"medium"}'),
(4, '{"markdown":"card","timeless":"yes","quality":7.6,"quality_tier":"strong","fit":6,"fit_label":"general","confidence":"high"}');
UPDATE sources SET verdict = 'read', verdict_how = 'first_hand', verdict_why = 'A lasting classic worth owning', verdict_by = 'ai', verdict_at = '2026-11-01T00:00:00Z' WHERE id = 1;
UPDATE sources SET verdict = 'read', verdict_how = 'second_hand', verdict_why = 'Main book for deciding better; no book you have read covers it', verdict_by = 'ai', verdict_at = '2026-11-01T00:00:00Z' WHERE id = 2;
UPDATE sources SET verdict = 'idea_only', verdict_why = 'The core fits on a page', verdict_by = 'ai', verdict_at = '2026-11-01T00:00:00Z' WHERE id = 4;
UPDATE sources SET verdict = 'read', verdict_how = 'second_hand', verdict_why = 'Best single overview of how science works', verdict_by = 'ai', verdict_at = '2026-11-01T00:00:00Z' WHERE id = 7;
UPDATE sources SET verdict = 'bench', verdict_why = 'Read it when you want something quiet', verdict_by = 'ai', verdict_at = '2026-11-01T00:00:00Z' WHERE id = 8;
INSERT INTO verdict_history (source_id, verdict, how, why, set_by, created_at) SELECT id, verdict, verdict_how, verdict_why, 'ai', verdict_at FROM sources WHERE verdict IS NOT NULL;
INSERT INTO requests (id, feature, input, fingerprint) VALUES (1,'recs','how science works','f1'),(2,'recs','books that make you curious','f2'),(3,'recs','popular science for beginners','f3');
INSERT INTO appearances (request_id, source_id, rank, origin) VALUES (1,7,1,'recommended'),(2,7,1,'recommended'),(3,7,2,'recommended'),(2,8,3,'recommended');
INSERT INTO summaries (source_id, body) VALUES (9, '# Deep Work — summary');
INSERT INTO quizzes (source_id, score, mode, partial, outcome, verdict, verdict_why, ideas, ideas_left, chapters, confidence, summary) VALUES
(7, 6.4, 'scan', 0, 'keep', 'read_parts', 'you already know 6.4/10', '[{"idea":"How the age of the Earth was worked out","core":true,"result":"held","note":"Radiometric dating, after a century of wrong guesses"},{"idea":"Why the dinosaurs died out","core":true,"result":"partly","note":"An asteroid impact, accepted only in the 1990s"},{"idea":"How small and recent our species is","result":"new","note":"Humans are a blink in Earth''s history"}]', '["Why the dinosaurs died out","How small and recent our species is"]', 'Part 3 and Part 6', 'high', '**What the book holds:** how scientists found out what we know, told through the people who did it.'),
(4, 5.0, 'scan', 1, NULL, NULL, NULL, '[{"idea":"Win without fighting","core":true,"result":"held"}]', '[]', NULL, 'medium', NULL);
UPDATE sources SET verdict = 'read_parts', verdict_why = 'you already know 6.4/10', verdict_by = 'quiz', verdict_how = NULL WHERE id = 7;
UPDATE sources SET pin_rank = 1 WHERE id = 4;
UPDATE sources SET pin_rank = 2 WHERE id = 3;
