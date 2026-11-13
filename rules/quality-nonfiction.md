# Quality: non-fiction

Quality answers one question: **is this a good book?** It is about the book only. Score blind: what the reader has read, owns or likes never changes it, and fame earns nothing (a recommender can suggest a book, never add points). Fit and the Verdict handle the reader.

If Book Hub returns a **reference score** for the book (the reader's own saved scores), use it as the Quality and say "from your saved scores".

## Gates
A book that fails a gate is never recommended; if the reader named it, its Verdict is Skip with the gate named. Change "on" to "off" to turn a gate off.

- on · **Fact pile:** facts with no central idea. Except: facts woven into an idea pass.
- on · **Stretched:** an essay could do the whole job. Except: lives and narrative history, where length is the point.
- on · **Repackaged:** a better original is readable today. Except: a book that adds a new connection, test or structure that experts respect, or when the original is lost, too long, too hard, or badly dated.
- on · **False:** the main claim is refuted or can't be checked. Except: wisdom texts are judged by long use.
- on · **Perishable:** the value ends with an event, a version or a news cycle. Except: reportage that reveals something lasting.

## Factors and weights
Score each factor 1–5 (3 = halfway between the 1 and 5 descriptions). Higher weight = matters more to this reader.

| Factor | Weight | Question | 5 | 3 | 1 |
|---|---|---|---|---|---|
| Foundation | 4 | Does it explain how the world, people or things work at a deep level? | a root mechanism that explains many things | a solid idea with limited spread | surface tips or trends |
| Reach | 4 | How many separate fields does its core idea change how you see? | four or more | two | one niche |
| Thinking tool | 4 | Does it change how you think, or only what you think? | you use its method on new problems | some reusable framing, mostly conclusions | conclusions to accept |
| Evidence | 4 | Would its main claims survive expert checking? | strong; critics haven't broken it | core holds, parts contested | refuted or uncheckable |
| Durability | 4 | Will the core still be true and useful in 20 years? | almost certain | core lasts, examples date | out of date within 5 years |

**Quality /10** = sum of (weight × factor) ÷ (5 × sum of weights) × 10, one decimal.
**Tiers:** Core 8.5+ · Strong 7.5–8.4 · Good 6.5–7.4 · Edge below 6.5.
- Evidence by type: wisdom texts by long use and whether the practice holds; memoirs by candour and corroboration.
- Durability by the idea's clock, not the shelf: human nature, ethics, power and logic last (age is evidence); technology, medicine and current affairs date fast (age is a warning).
- Truth cap: Evidence 2 or less → Quality at most 7.0.
- Give every score a confidence label (High / Medium / Low): scores are judged from knowledge of the book, not a re-read.

## Timeless
Always shown on its own, separate from the score, because a timeless idea is worth knowing even when the book isn't worth reading.
- **15 years or older:** Yes or No. Main test: serious readers recommended it decades ago and still do today (show links for both).
- **Under 15 years:** Too new: promising, or Too new: not, judged on originality, density, evidence and the author's credibility (which weighs more in fast-moving fields).
- Explain the verdict in 2–3 lines.

## Example books
Anchors so scores stay consistent: On the Origin of Species (Core) · Influence (Strong) · Atomic Habits (Good or Edge: practical, little new mechanism). Who Moved My Cheese? fails Stretched.

## Save
`save_card` with `quality`, `quality_tier`, `quality_factors` (factor name → 1–5), `timeless`, `confidence`, and when you can name them, `belief` (the belief it breaks), `mistake` (the costly mistake it prevents) and `critic` (its strongest critic).
