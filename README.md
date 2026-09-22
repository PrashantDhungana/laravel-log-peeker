# Storage Peeker

Local Laravel log search powered by ripgrep. Paste an absolute path to a log file, filter by time, phrase, or regex, and browse results instantly — even on multi-GB files. Nothing is uploaded.

## How it works

Storage Peeker runs a small Node server on `127.0.0.1` that:

1. Reads the head and tail of the log to discover time bounds (~128 KB, no full scan)
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

Your browser opens with a tokenised URL. Paste the absolute path to your log file, for example:

`C:\ElegantProjects\myapp\storage\logs\laravel.log`

### Development

```bash
npm run dev
```

Starts the API on port 3847 and Vite on port 5173. Open the dev UI URL printed in the terminal (includes the auth token).

### CLI options

```bash
npm start -- "C:\path\to\laravel.log"   # pre-fill path
npm start -- --port 4000                # custom port
npm start -- --no-open                  # do not launch browser
```

## Filters

- **Time range** — From/To datetimes, prefilled from the file's first and last entries
- **Phrase** — fixed-string search (case insensitive by default)
- **Regex** — with optional flags (default `i`)
- **Exclude phrase** — applied at entry granularity
- **Level** — DEBUG through EMERGENCY
- **Channel** — e.g. `production`, `local`

Results stream in as they are found. Use **Load more** to paginate by byte cursor.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Build UI (if needed) and run local server |
| `npm run dev` | API server + Vite dev server |
| `npm run build` | Production web build to `web-dist/` |
| `npm test` | Vitest unit and performance smoke tests |

## Security

The server reads arbitrary absolute paths on your machine. It binds to `127.0.0.1` only, generates a random startup token, and requires that token on every API request. Do not expose the port beyond localhost.

## Privacy

Log files stay on your machine. The browser talks only to your local Storage Peeker server.
