# Contributing

Thanks for helping. This is a small project, so keep changes focused.

## Ground rules
- **No real data.** Never commit or paste spreadsheets, invoices or numbers from a real organisation into the repository, issues or pull requests. Use synthetic data (`src/sample.js` shows the idea). `.gitignore` blocks spreadsheets outside `examples/` on purpose.
- **Every emission factor needs a source.** When you add or change a factor, add or update its entry in `data/sources.json` and say where the value comes from, in the pull request.
- **Tests with every calculation change.** Add a hand-calculated test in `tests/engine.test.js`: write the formula out so a reader can follow it, not just a number.
- **Never silently zero.** If a row cannot be calculated, report it as an issue and exclude it.

## Workflow
1. Fork, create a branch, make the change.
2. `npm install`, `npm test`, `npm run build`.
3. Open a pull request describing what changed and why. If you used an AI assistant, say so (see `AI_USAGE.md`).

## Reporting a wrong result
Open an issue with the inputs for one row (made up if necessary), the result you got, and the result you expected with your reasoning or source.

## Conduct
Be respectful and assume good faith. Harassment of any kind is not tolerated. Maintainers may remove comments or contributions that break this rule.
