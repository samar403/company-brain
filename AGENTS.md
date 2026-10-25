<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Company Brain project notes

- Product overview, architecture and API reference: `README.md`.
- Data lives in SQLite via Node's built-in `node:sqlite` (`src/lib/db.ts`); schema is created on boot, no migrations tool.
- All Claude calls go through `src/lib/ai/claude.ts` (`generateJson`, structured outputs). Prompts and JSON schemas: `src/lib/ai/prompts.ts`. Every AI path has an offline fallback in `src/lib/ai/heuristics.ts`; keep both working.
- Mutations are server actions in `src/app/actions.ts`; agent-facing endpoints are under `src/app/api/v1` and `src/app/api/mcp`.
- Design tokens are CSS variables in `src/app/globals.css` (light + dark); reuse `src/components/ui.tsx` primitives.
