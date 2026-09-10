# Clearlot — Project Map

Living map for the Secure Reliability Optimizer pass. Refresh after each edit phase.

## Product

**Clearlot** is a React / TanStack Start rebuild of Group Test Tracker as a
group-buy manager: timed drops, always-on catalog, crypto TXID verification,
lab-test tooling, and web + chat checkout. Packaged for DigitalOcean App
Platform (and the Grok/Vercel preview). GitHub: `sbchmn/Clearlot`.

## Auth / data (locked)

- Auth ON (accounts, per-user orders, admin vs member).
- Database ON (Neon in deploy, PGLite in preview).
- `authMiddleware` on every per-user and admin server function.
- Shared catalog/drop/COA reads are public (no personal data).
- First signed-in profile is promoted to admin.
- Demo inventory seeds on first public catalog/drops/COA read (`created_by = 'system'`)
  or on first admin profile — claim via `app_meta.seeded` so it cannot double-insert.

## Target files and modules

| Area | Files |
|---|---|
| Schema | `migrations/0001_auth.sql`, `migrations/0002_clearlot.sql` |
| Shell | `src/router.tsx`, `src/routes/__root.tsx`, `src/styles.css` |
| Auth | `src/routes/login.tsx`, `src/routes/api/auth/$.ts`, `src/lib/auth/email-password.ts` |
| Domain | `src/lib/server/{profile,catalog,orders,crypto,tests,bot,admin,seed}.ts` |
| UI | `src/components/ui/*`, `src/components/app-frame.tsx` |
| Buyer | `/`, `/shop`, `/drops`, `/cart`, `/checkout`, `/orders`, `/desk`, `/tests`, `/library`, `/profile` |
| Admin | `/admin/*` products, drops, orders, settlement, tests, users |
| Bot | `runDeskTurn(userId)` + `/desk` + `/api/telegram` webhook |
| Deploy | `Dockerfile`, `.do/app.yaml`, `startup.sh`, `README.md` |

## Intended behavior

1. Admin configures BTC / ETC / SOL / TRON wallets plus Cash App / Venmo.
2. Shared product inventory; catalog price and per-drop price may differ.
3. Timed drops with caps, admin fee, shipping tiers by item count.
4. Checkout requires TXID + payment-proof screenshot.
5. Crypto: auto-check destination + amount; success receipt or pending-admin.
6. Cash App / Venmo: always pending admin, still require proof.
7. Group-buy items declare included tests and payer (admin vs group-funded);
   spawning creates public COA stubs and/or group tests.
8. Existing test capabilities retained: recruit, approve, cost share, results.
9. Full chat checkout via `/desk` and linked Telegram (same `runDeskTurn`).
10. DO App Platform deploy from GitHub via Dockerfile + app spec.

## Latest edit phase

- Public seed so homepage/catalog/drops/COA are playable signed-out.
- Extract `*ForUser` internals so Telegram does not need cookie auth.
- Telegram webhook: secret required, link tokens, photo proof download, sendMessage.
- TRON base58 ↔ hex address matching (TronGrid hex vs admin T-address).
- COA library is public (published rows only).
- Profile can generate a Telegram link token.

## Risks / assumptions

- Public chain APIs (mempool.space, Blockscout, Solana RPC, TronGrid) have
  rate limits and can fail — failure degrades to pending-admin, never to
  auto-success.
- Shared wallet + amount match (not unique deposit addresses) for v1.
- ETC means Ethereum Classic, not ETH.
- Screenshots stored as constrained base64 in Postgres (max ~400KB).
- Telegram webhook works only when deployed with a public URL + bot token
  + webhook secret. Unconfigured webhook is fail-closed (403).
- Preview seed data uses burn addresses so accidental real payments are lost,
  not credited to a personal wallet.

## Validation

- `npm run typecheck`, `npm run build`, `npm test` (includes crypto tests)
- Browser smoke desktop + mobile (dev + production preview)
- Checkout path: submit proof + txid → pending or verified receipt
- Admin verify/reject restocks correctly

## Security / reliability checks (every phase)

- Auth boundaries, parameterized SQL, TXID uniqueness, rate limits
- Timeouts on chain I/O, idempotent order submit, stock reservations
- Telegram secret required when a bot token is configured
- No secrets in repo; no `.env` files
