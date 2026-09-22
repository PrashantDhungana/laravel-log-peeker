# Laravel Log Peeker

Local Laravel log search powered by ripgrep. Open one or more log files by absolute path, filter by time, phrase, or regex, and browse results instantly — even on multi-GB files. Nothing leaves your machine.

## How it works

Laravel Log Peeker runs a small Node server on `127.0.0.1` that:

1. Reads the head and tail of each log to discover time bounds (~128 KB, no full scan)
2. Binary-searches timestamps to narrow a byte range
3. Streams that range into `rg --json` and resolves Laravel entry boundaries in Node
4. Streams matching entries to the browser as NDJSON

There is no upfront indexing pass. Cost scales with your time window and match count, not total file size.

## Quick start

```bash
npm install
npm run build
npm start
```

Your browser opens with a tokenised URL. Then either:

- Paste absolute path(s) — one per line — for example:

  `C:\myapp\storage\logs\laravel.log`

- **Browse** (Windows) to pick files via the native dialog
- Drag and drop log files onto the path field (paths are used when the browser provides them; otherwise files are copied into a local staging folder)

### Development

```bash
npm run dev
```

Starts the API on port 3847 and Vite on port 5173, then opens the tokenised dev UI URL.

### CLI options

```bash
npm start -- "C:\path\to\laravel.log"   # pre-fill path
npm start -- --port 4000                # custom port
npm start -- --no-open                  # do not launch browser
```

You can also run the bin directly: `npx laravel-log-peeker` (same options).

## Filters

- **Time range** — From/To datetimes, prefilled from the opened files' first and last entries
- **Phrase** — fixed-string search (case insensitive by default; optional case-sensitive toggle)
- **Regex** — with optional flags (default `i`)
- **Exclude phrase** — applied at entry granularity
- **Level** — multi-select from levels found in the log (Laravel DEBUG through EMERGENCY)
- **Channel** — e.g. `production`, `local` (from facets when available)

Results stream in as they are found. Match counts and level/channel facets are scanned in the background. Use **Load more** to paginate by byte cursor (per file when several are open). Select a result to view the full entry and neighbouring context.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the local server (serve `web-dist/`; run `npm run build` first) |
| `npm run dev` | API server + Vite dev server |
| `npm run build` | Production web build to `web-dist/` |
| `npm run preview` | Serve an existing `web-dist/` without rebuilding |
| `npm test` | Vitest unit and performance smoke tests |

## Security

The server reads absolute paths on your machine (and can stage dropped browser files under a local temp directory). It binds to `127.0.0.1` only, generates a random startup token, and requires that token on every API request. Do not expose the port beyond localhost.

## Privacy

Log files stay on your machine. The browser talks only to your local Laravel Log Peeker server.
