-- Pins: up to 5 books on My shelf that are my current focus, in my order. Only Reading or Not started books;
-- a book unpins itself when it leaves those.
ALTER TABLE sources ADD COLUMN pin_rank INTEGER;
