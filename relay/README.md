# SciPlotFlow relay

A tiny Cloudflare Worker + Durable Object that lets a SciPlotFlow session start by link (Collaborate ▸ Start a
session). It passes on how the browsers set up a direct WebRTC connection, and carries the data itself when they cannot
connect directly. Runs on the Workers Free plan.

## Deploy

```
npm install
npx wrangler login
npx wrangler deploy
```

The address printed (`https://sciplotflow-relay.<your-subdomain>.workers.dev`) goes in `RELAY_URL`
(`src/collab/relay.ts`, as `wss://…`), or in the app under Collaborate ▸ Advanced. The pages allowed to use it are
`ALLOWED_ORIGINS` in `wrangler.jsonc` (comma list).

Try it locally (no account needed): `npx wrangler dev --port 8787`, then in the app set Advanced ▸ Relay address to
`ws://127.0.0.1:8787`; `node scripts/relay-live.ts` (from the app's folder) checks it end to end.

## What it sees, what it does not

- Sees: that a room exists (a random 128-bit id), random peer ids and which one is the host, the kind of each message
  (signal or data), who sends it to whom, its size, and the pages' origin.
- Never sees: the content. The key is in the link's fragment (after `#`), which browsers never send; every message
  (the connection descriptions, which hold IP addresses, and the project's data) is sealed with AES-GCM 256 before it
  leaves the browser.
- Keeps: only while a session runs, the host's peer id, the SHA-256 of the host's secret token and, after the host's
  connection drops, the deadline to come back (60 s). Deleted when the session ends.
- Limits: 16 people per session, 4 MiB per message, keep-alive pings answered by the platform (not billed as requests).
