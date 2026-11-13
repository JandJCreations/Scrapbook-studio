<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Smoke tests (keep them growing)

Browser smoke tests live in `scripts/smoke.mjs` and run with `npm run smoke` against a running app (`npm run dev`, or `npm run build && npx next start`). They drive a real browser with the `agent-browser` CLI and also run in GitHub Actions on every push (`.github/workflows/smoke.yml`).

When you add or change a user-facing feature:
1. Add a `check("...", () => { ... })` to `scripts/smoke.mjs` that walks the main path of the feature like a user would (open the page, click, fill, confirm the result is visible). Use `agent-browser snapshot -i` to find accessible names; prefer roles and labels over CSS selectors.
2. Checks that need a signed-in user go inside the `if (EMAIL && PASSWORD)` block.
3. Run `npm run smoke` locally and make sure it passes before opening the PR. Mention the new checks in the PR description.
