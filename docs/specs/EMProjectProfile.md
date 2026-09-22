---
last_reviewed: 2026-09-22
next_review_date: 2026-10-22
review_cadence_days: 30
---
## Project state

- Project stage: greenfield (not deployed yet)
- Current development goal: MVP
- Backwards compatibility required: `no` (v2 clean rebuild; v1 browser-only indexer removed)
- Production data must be preserved: `unknown`
- Sandbox database reset: `unknown`

## Notes

- v2 architecture: local Node server (`127.0.0.1`) + browser UI (Vite/React).
- Search powered by `@vscode/ripgrep` with binary search over chronological timestamps — no upfront indexing pass.
- User provides an absolute path to a log file on disk; the server reads it directly.
- Log files are never uploaded; processing stays on the local machine.

## Review history

- 2026-09-22: v2 rebuild — replaced client-side indexer with ripgrep-powered local server for multi-GB performance.
- 2026-09-22: Initial profile created from project kick-off conversation.
