-- A small library for behaviour tests (local database only).
INSERT INTO sources (title, authors, title_key, author_key, type, year, year_source, library_status) VALUES
 ('The Art of War', '["Sun Tzu"]', 'art of war', 'sun tzu', 'nonfiction', -500, 'claude-memory', 'finished'),
 ('Outliers', '["Malcolm Gladwell"]', 'outliers', 'gladwell', 'nonfiction', 2008, 'openlibrary', 'own'),
 ('Murder on the Orient Express', '["Agatha Christie"]', 'murder on the orient express', 'christie', 'fiction', 1934, 'openlibrary', 'finished'),
 ('Before the Coffee Gets Cold', '["Toshikazu Kawaguchi"]', 'before the coffee gets cold', 'kawaguchi', 'fiction', 2015, 'claude-web', 'finished');
