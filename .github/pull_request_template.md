## What

<!-- What does this PR do? One paragraph, plain language. Not a file list — GitHub shows the diff. -->

## Why

<!-- What was broken, missing, or wrong? Why this approach? -->

## Testing

<!-- Specific steps to verify this works. What did you actually run or click? -->

- [ ] Local smoke test — `node src/index.js` starts without error
- [ ] Affected command or event tested manually in a dev guild
- [ ] Migration tested on a clean DB copy (if applicable)
- [ ] Slash commands deployed to dev guild after command changes

## Notes

<!-- Migration required? New env var needed? Known side effects? Delete if nothing applies. -->

---

- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] No secrets, tokens, or `.env` values in the diff — run `git diff --cached | grep -iE "(token|secret|password|key)"` to check
- [ ] No `console.log` debug statements left in
- [ ] `@reviewer` used before opening this PR

