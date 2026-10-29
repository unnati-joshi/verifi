<p align="center">
  <img src="public/assets/logo.svg" alt="verifi" width="200">
</p>

<p align="center"><strong>Financial Risk Intelligence Platform</strong><br>
Rule-based risk reports for loans, insurance policies and UPI payments.</p>

<p align="center">
  Node.js · Express · SQLite (WAL) · REST · JWT · Google OAuth 2.0
</p>

----

## Overview

VeriFi is a full-stack web app that analyses a financial product **before** you commit to it. You enter what you know about a loan offer, an insurance policy or a UPI payment request, and a deterministic rule engine scores it on four dimensions:

| Dimension | Meaning | Direction |
|---|---|---|
| **Trust** | Is the provider regulated, accountable and legitimate? | higher is better |
| **Transparency** | Are costs, exclusions and terms disclosed clearly? | higher is better |
| **Risk** | How likely is financial loss (fraud, unaffordability, unfair terms)? | lower is better |
| **Complexity** | How hard is the product to understand, compare or exit? | lower is better |

The four scores roll up into a 0–100 **safety score** and an **A–E grade**, and every finding is explained with a concrete recommendation. Users can save reports, search and filter their history, export a report to PDF, and track lenders, insurers or UPI IDs on a **watchlist**.

## Features

- **Authentication** – email/password (bcrypt, 12 rounds) and **Google OAuth 2.0** (authorization-code flow with CSRF `state`). Sessions are **JWTs** in an `httpOnly`, `SameSite=Lax` cookie; API clients can send `Authorization: Bearer <token>` instead.
- **Rule-based risk engine** – 51 rules across three products:
  - **Loans** – EMI and effective APR (solved numerically, including the processing fee), EMI-to-income affordability, RBI digital-lending red flags (fees before disbursal, contact/photo permissions), KFS/APR disclosure, foreclosure charges on floating-rate loans.
  - **Insurance** – IRDAI registration, claim settlement ratio, cover-to-income and cover-to-premium adequacy, free-look period, co-pay, room-rent caps, surrender charges, mis-selling signals.
  - **UPI payments** – PIN-to-receive and collect-request scams, OTP/PIN sharing, screen-sharing apps, bait words in UPI IDs (`refund`, `kyc`, `support`…), unknown PSP handles, payee-name mismatch, urgency pressure, large first-time payments, AutoPay mandates.
- **SQLite with WAL mode** – users, saved reports and watchlists in one file; foreign keys with cascade deletes; indexed per-user queries.
- **REST API** – consistent JSON errors with per-field validation details; the server always recomputes results instead of trusting the client.
- **Frontend** – responsive vanilla HTML/CSS/JS (no framework) with light and dark themes (follows the system setting, with a manual toggle): landing page with the live rule catalogue, sign-in/sign-up, overview with stats and grade distribution, analysis forms generated from the engine schema, report view with score scale and per-rule findings, report history with search/filter/pagination, watchlist, and print-to-PDF export.
- **Security** – Helmet with a strict Content-Security-Policy, rate-limited auth and analysis endpoints, timing-safe login, parameterised SQL everywhere, per-user data scoping.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Server | Express 5 |
| Database | SQLite via `better-sqlite3`, WAL journal mode |
| Auth | JWT (`jsonwebtoken`), `bcryptjs`, Google OAuth 2.0 |
| Frontend | HTML, CSS, ES modules (served by Express) |
| Tests | `node:test` + `supertest` |

## Getting started

```bash
npm install
cp .env.example .env      # then set JWT_SECRET (and Google keys if you want Google sign-in)
npm start                 # http://localhost:3000
```

The database starts empty; create an account from the sign-up page.

Other scripts:

```bash
npm run dev     # restart on file changes
npm test        # 25 engine + API tests
```

### Enabling Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** of type *Web application*.
2. Add the authorized redirect URI: `http://localhost:3000/api/auth/google/callback` (use your `APP_URL` in production).
3. Put the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart.

Without these values the app works normally and the Google button is hidden.

## Project structure

```
verifi/
├── public/                  # Frontend (static, served by Express)
│   ├── assets/              # Logo, favicon, icons
│   ├── css/styles.css
│   ├── js/
│   │   ├── api.js           # fetch wrapper + session helpers
│   │   ├── layout.js        # shared header / nav
│   │   ├── report-view.js   # report rendering (gauge, dimensions, findings)
│   │   ├── ui.js            # formatting, toasts, dialogs
│   │   └── pages/           # one module per page
│   └── *.html               # landing, login, dashboard, analyze, reports, report, watchlist
├── src/
│   ├── app.js               # Express app (middleware + routes)
│   ├── server.js            # entry point
│   ├── config.js            # env configuration
│   ├── db/                  # SQLite connection (WAL) and schema
│   ├── engine/              # rule engine
│   │   ├── index.js         # scoring, grading, schema
│   │   ├── validate.js      # input coercion & validation
│   │   └── rules/           # loan.js, insurance.js, upi.js
│   ├── middleware/          # JWT auth, error handling
│   └── routes/              # auth, engine, reports, watchlist
└── test/                    # engine + API tests
```

## How scoring works

1. Input is validated and coerced against the product's field schema (the same schema renders the frontend form).
2. Derived metrics are computed (e.g. EMI, effective APR, cover-to-income ratio, UPI handle analysis).
3. Every rule whose condition matches adds a finding and adjusts one or more dimensions from a baseline.
4. Dimensions are clamped to 0–100 and combined:
   `safety = 0.30·trust + 0.25·transparency + 0.30·(100 − risk) + 0.15·(100 − complexity)`
5. Any **critical** finding caps the safety score at 39, so the grade can never be better than D.
6. Grade bands: **A** ≥ 85 · **B** ≥ 70 · **C** ≥ 55 · **D** ≥ 40 · **E** < 40.

## REST API

All responses are JSON. Errors look like `{ "error": "message", "details": { "field": "reason" } }`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | – | Health check |
| GET | `/api/auth/config` | – | Whether Google sign-in is enabled |
| POST | `/api/auth/register` | – | Create account `{ name, email, password }` |
| POST | `/api/auth/login` | – | Sign in `{ email, password }` → `{ token, user }` + cookie |
| POST | `/api/auth/logout` | – | Clear session cookie |
| GET | `/api/auth/me` | ✓ | Current user |
| GET | `/api/auth/google` | – | Start Google OAuth 2.0 |
| GET | `/api/auth/google/callback` | – | OAuth redirect target |
| GET | `/api/engine/schema` | – | Products, fields, rules, weights, grade bands |
| POST | `/api/engine/analyze/:type` | – | Preview a report without saving (`loan`, `insurance`, `upi`) |
| GET | `/api/reports` | ✓ | List reports `?type=&grade=&q=&limit=&offset=` |
| GET | `/api/reports/stats` | ✓ | Dashboard statistics |
| POST | `/api/reports` | ✓ | Analyse and save `{ productType, input, title?, watchlistId? }` |
| GET | `/api/reports/:id` | ✓ | Full report |
| DELETE | `/api/reports/:id` | ✓ | Delete a report |
| GET | `/api/watchlist` | ✓ | Watchlist with latest grade per item |
| POST | `/api/watchlist` | ✓ | Add `{ name, productType, identifier?, notes? }` |
| PATCH | `/api/watchlist/:id` | ✓ | Update an item |
| GET | `/api/watchlist/:id/reports` | ✓ | Report history for an item |
| DELETE | `/api/watchlist/:id` | ✓ | Remove an item |

Example:

```bash
curl -X POST http://localhost:3000/api/engine/analyze/upi \
  -H 'Content-Type: application/json' \
  -d '{"payeeName":"Refund Desk","upiId":"refund.support@xyzpay","amount":4999,
       "transactionType":"collect_request","source":"unsolicited","expectingToReceive":true}'
```

## Deployment

The app is a single Node process with a SQLite file, so it needs a host with a **persistent disk** for `DB_PATH`.

Required environment in production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | random string, 32+ characters (the server refuses to start without it) |
| `APP_URL` | public URL, e.g. `https://verifi.example.com` |
| `DB_PATH` | path on the persistent disk, e.g. `/app/data/verifi.db` |
| `TRUST_PROXY` | `1` when behind one reverse proxy (default) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional; add `<APP_URL>/api/auth/google/callback` as a redirect URI |

**Docker**

```bash
docker build -t verifi .
docker run -d -p 3000:3000 -v verifi-data:/app/data \
  -e JWT_SECRET=... -e APP_URL=https://verifi.example.com verifi
```

The image runs as a non-root user, stores the database in the `/app/data` volume and has a health check on `/api/health`.

**Render / Railway / any Node host**

- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Attach a persistent disk and point `DB_PATH` at it.
- Health check path: `/api/health`

In production the server sends HSTS, caches static assets for an hour (HTML always revalidates), serves a 404 page for unknown routes and shuts down cleanly on `SIGTERM`.

## Database schema

- **users** – `id, email (unique, case-insensitive), name, password_hash?, google_id?, avatar_url, created_at`
- **reports** – `id, user_id → users, product_type, title, input_json, result_json, overall_score, grade, created_at`
- **watchlist** – `id, user_id → users, name, product_type, identifier, notes, last_report_id → reports, created_at` (unique per user + name + type)

## Disclaimer

VeriFi's reports are informational and based on the details you enter. They are not financial, legal or investment advice.

## License

MIT
