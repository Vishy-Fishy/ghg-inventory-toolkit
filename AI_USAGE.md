# AI usage disclosure

This project was developed with help from an AI assistant (Claude, by Anthropic). This file records where and how, so that reviewers and users can judge the work.

## Where AI was used
- Reading the original Excel toolkit and describing its formulas.
- Drafting the calculation engine, the Excel template and reader, the dashboard, the export module and the tests.
- Drafting documentation, including this repository's README.

## How the output was checked by people
- The engine was compared month by month with the original Excel toolkit on a real dataset kept private. Scope 1 and Scope 2 matched exactly. Three defects in the spreadsheet were identified through this comparison and are described in docs/KNOWN_ISSUES.md.
- Hand-calculated checks and regression tests in `tests/` can be read and re-run by anyone (`npm test`).
- Emission factors are copied from the original toolkit. They have NOT yet been checked against their primary sources, and `data/sources.json` says so for each source.
- Design decisions (what the tool should do, which categories to include, how to handle bad rows) were made by the human authors.

## Human review log
Keep adding a line each time a person reviews AI-drafted work.

| Date | Reviewer | What was reviewed | Outcome |
|------|----------|-------------------|---------|
| 2026-10 | S C Vishweshvaran | Engine versus original spreadsheet, month by month | Matched, three spreadsheet defects found |
