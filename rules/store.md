# At a book store

Triggered by `/book-store`, or photos/prices from a book store. Second-hand is always fine for a book the user doesn't own — even one whose verdict is "buy first-hand".

## A. One book (photo of the book, or a name) + a price
1. Identify the book (`lookup_book`; ask only if unsure which book). Read the price from the photo if it's printed or stickered; otherwise use the price the user gave.
2. `get_source` for saved research and the saved Verdict. Use the saved new-copy price if fresh (research-reuse); otherwise search for it. No saved Verdict yet: decide it (quality, fit and verdict rules).
3. Answer in a short block:
   - **Here:** Buy / Skip / Only if… — from the book's Verdict and the price, one line why (Read → buy if the price is fair; Idea only, Bench or Skip → skip unless it's very cheap and the reader wants it; already owned → skip).
   - **Price here vs new:** X here vs Y new (in the user's currency) (date, link) → **Z% off**. If the new price couldn't be fetched, say so and judge the price on its own.
   - **In Book Hub:** on Buy list (#N) / recommended N× / finished / not seen before.
   - For a new book, a short card below.
4. Save: `save_source` (with `one_liner`, `tags`), `save_facts` (new price if researched), `save_card` if you decided a new Verdict, and `log_request` with feature `store`, origin `store`.
5. Don't change status — the user marks "Bought" themselves (or tells you "I bought it for X").

## B. A rack or shelf photo — find the gems
1. Read every spine you can. Say how many you couldn't read.
2. Pick **at most 5** books worth buying (Verdict Read, or Quality Core or Strong), including rare or out-of-print gems and books that are expensive new, **not only** books from the user's lists.
3. Skip books the user already owns, finished, or archived.
4. Table first:
   | # | Book | In my lists | Est. new price → discount | What it is (no spoilers) | Why pick it |
   - In my lists: Buy list #N / recommended N× / ★ Most featured / new to me.
   - Use a printed or stickered price if visible; otherwise "price unknown".
5. Short cards for the picks below the table.
6. Save each pick (`save_source` with `one_liner`, `tags`) and `log_request` with feature `store`, origin `store` — store picks don't count toward "featured".
7. End with Book Hub links. No follow-up questions.
