# Paths: Asks, Saved Paths, and Templates (Demo Week — Day 4)

Status: implemented.

## Concepts

- **Ask:** any header search ("where does my money go?"). Results carry a **Save as Path** button.
- **Saved Path:** a persistent, user-owned workspace (`SavedPath` in the encrypted store): name, original ask, optional template, pinned by default. Open re-runs the ask; Pin/Unpin and Delete are on the card.
- **Path template:** a data recipe, not a form (`app/src/templates.ts`). It names the data it needs, the ask that creates it, and the scaffold it creates. Templates now ship as **Finance**, **Health**, **Relationship Rhythms**, and **Reading Life**.

## Budgeting template

- Needs: a bank statement CSV (Day 3 importer). Scaffold: spending by category, money in vs out, largest recurring costs, descriptive insights only (never prescriptive advice).
- Detail view rebuilds transactions from imported `finance` entries and shows totals, category share, and the largest category. With no statement data it honestly asks for an import instead of showing empty charts.
- **Suggested by Hyperself:** with 3+ finance entries, the template card carries a "Suggested for you" pill with the reason.

## Demo beat

Import statement → ask "where does my money go?" → Save as Path → open Budgeting in Paths: totals + category breakdown, pinned for next time, fully offline inside the vault.

## Health template

- Needs: 2+ `health` entries (Apple Health export ZIP/XML, health results, or activity/sleep notes). Suggested on Insights once that data exists; the saved Health Path stays hidden while no health data is present.
- Detail view (`healthSummary` in `app/src/templates.ts`): entry counts by signal (activity, sleep, check-ups), most recent records, and record-kind lines from health-export summaries. Descriptive only — the card states it is not medical advice, and health entries are always `personal` (never shareable, never in packs).
