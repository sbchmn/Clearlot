# Clearlot

Group-buy manager with timed drops, a shared always-on catalog, crypto TXID
verification (BTC, Ethereum Classic, SOL, TRON), Cash App / Venmo review,
lab-test operations, and chat checkout.

This is a React / TanStack Start rebuild of [Group Test Tracker](https://github.com/sbchmn/Group-Test-Tracker).

## What it does

- **Catalog** — always-on SKUs with their own prices.
- **Drops** — timed lots, per-item caps and prices, flat admin fee, shipping
  by item count. Same inventory as the catalog.
- **Settlement** — admin enables BTC / ETC / SOL / TRON wallets plus Cash App
  and Venmo handles. Checkout requires a TXID and a payment screenshot.
- **Auto-verify** — crypto transfers are checked on-chain against the quoted
  amount and configured wallet. Failures become **Admin verification pending**.
- **Tests** — recruiting / approve / cost-share / paid-gated results. Drop
  items declare included tests and who pays; live drops spawn group tests
  and/or COA library stubs.
- **Desk** — full chat checkout on the web, and on Telegram after you link
  the account from Profile.

## Local / preview

```bash
npm install
npm run dev
```

Sign in (Google, X, or email). The first account becomes admin. Sample
products, a live September lot, settlement rails, and a recruiting test seed
on the first public catalog/drops visit (and again only if the database is
empty).

## DigitalOcean App Platform

1. This repo is meant to live at [`sbchmn/Clearlot`](https://github.com/sbchmn/Clearlot).
2. Create an App from GitHub and use the included `.do/app.yaml`, **or**
   create an app with:
   - Dockerfile (`Dockerfile`)
   - HTTP port `8080`
   - A managed Postgres component
3. Bind `DATABASE_URL` from that database to the web service (App Platform
   does this when the database is attached).
4. Add a `BETTER_AUTH_SECRET` (long random string) as a runtime secret.
5. Deploy. Schema migrates during `npm run build`.

The Dockerfile builds with `NITRO_PRESET=node-server` so the container serves
`.output/server/index.mjs` on `PORT`. Grok/Vercel deploys still use the
default Nitro `vercel` preset.

## Telegram

1. Create a bot with BotFather and paste the token + webhook secret under
   Admin → (bot config) or `bot_config`.
2. Point the webhook at `https://<your-host>/api/telegram` with the same secret
   header Telegram sends (`X-Telegram-Bot-Api-Secret-Token`).
3. Members generate a link token on Profile and send `/start <token>` to the bot.

The webhook is fail-closed: requests are rejected until both token and secret
are set.

## Environment

Never commit a `.env`. In this sandbox, Postgres is an in-memory PGLite
fallback. On DigitalOcean / Neon, set `DATABASE_URL`.

## License

GPL-3.0, matching the original Group Test Tracker.
