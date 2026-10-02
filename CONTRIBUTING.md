# Contributing to TxRadar

Thanks for your interest! Bug reports, ideas and pull requests are all welcome.

## Getting set up

```bash
git clone https://github.com/bhogi1718/txradar.git
cd txradar
npm install
cp .env.example .env.local   # add a free Etherscan key
npm run dev
```

You need Node.js 22.12 or newer. For end-to-end tests, also run
`npx playwright install chromium` once.

## Making a change

1. Create a branch from `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
2. Keep the change focused. One feature or fix per pull request.
3. Add or update tests:
   - Logic in `src/lib` gets a Vitest unit test next to it.
   - A new upstream API response gets a recorded fixture in
     `src/lib/chains/__fixtures__` and a test that uses it.
   - User-facing flows get a Playwright spec in `e2e/` (API calls are mocked in
     `e2e/mock-api.ts`, so no keys are needed).
4. Run the checks before pushing:

   ```bash
   npm run check                 # lint, typecheck, format, unit tests
   npm run build && npm run e2e  # production build + end-to-end
   ```

5. Open a pull request and fill in the template. CI runs the same checks, plus a coverage
   gate.

A pre-commit hook formats and lints staged files automatically.

## Guidelines

- **TypeScript strict.** No `any`; validate anything from outside the app with Zod.
- **Keys stay on the server.** The browser only calls `/api/*`. Never commit `.env.local`.
- **Honest data.** If a number is estimated or a lookup failed, the UI should say so.
- **Labels need a source.** New entries in `src/lib/labels/registry.ts` must link to the
  public page they were verified against.
- **Accessible by default.** New UI must pass the axe checks in both themes.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`,
`test:`, `chore:`, `refactor:`.
