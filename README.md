# ClickCount Admin

A web admin console for the ClickCount inventory-counting app. It shares the same Neon PostgreSQL database through the bundled Express API. The dashboard and the API are deployed together on Vercel.

## Local development

```bash
npm install
npm run dev   # starts BOTH the Express API (http://localhost:8787) and Vite (http://localhost:5174)
```

The Vite dev server proxies `/api` requests to the local Express server (port 8787), so the browser always calls the same origin — no CORS and no "Failed to fetch" when the API is on another port. `VITE_API_URL` is left empty for exactly this reason. If you want to run the two processes separately, use `npm run dev:server` and `npm run dev:client` in two terminals.

The Express server reads `DATABASE_URL` and keeps the connection string server-side.

### "Failed to fetch" on sign-in

That error means the browser could not reach the API at all. Check, in order:

1. The API is running — `npm run dev` starts it; if you opened only Vite, run `npm run server` in a second terminal, then reload the page.
2. `curl http://localhost:8787/api/health` returns `{"ok":true,"database":true}`. If the server is running but the database is unreachable, the health call still reports `database:true`, so also check the API terminal for connection errors.
3. `.env` has `VITE_API_URL=` (empty). A value such as `http://localhost:8787` breaks every other machine (and your deployed site) because `localhost` there means the visitor's own computer. The frontend now ignores a `localhost` API URL whenever the page itself is not served from `localhost`, so requests fall back to the same-origin `/api` route.

```env
VITE_API_URL=          # leave empty to use the same-origin /api route
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=replace-with-a-long-random-secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_APP_PASSWORD=your-provider-app-password
SMTP_FROM=you@example.com
PUBLIC_API_URL=http://localhost:8787
```

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import the repository into Vercel (Vercel auto-detects Vite).
3. Add the environment variables below in **Project â†’ Settings â†’ Environment Variables**:
   - `DATABASE_URL` â€” your Neon PostgreSQL connection string
   - `JWT_SECRET` â€” a long random secret
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_APP_PASSWORD`, `SMTP_FROM` â€” email sender (Gmail App Password recommended)
   - `PUBLIC_API_URL` â€” your deployed domain, e.g. `https://your-app.vercel.app` (used in email confirmation links)
4. Vercel runs `npm run build` (Vite â†’ `dist`) and serves it as static content. The `api/index.cjs` file becomes a serverless function mounted at `/api/*`, so the frontend talks to the database through the same origin â€” no "failed to fetch" cross-origin issues.
5. Leave `VITE_API_URL` **empty** so the frontend uses the same-origin `/api` route. If you set it, use only an API origin such as `https://api.example.com`; do not include a trailing `/api` because the frontend adds that path automatically.

## Database

The app expects the shared tables `organizations`, `users`, `locations`, `zones`, `items`, `count_sessions`, `count_entries`, `excel_uploads`, and `audit_logs`. Apply [001_ClickCount_neon.sql](neon/001_ClickCount_neon.sql) to the Neon database before connecting either app.

## Administrator email confirmation

Shop creation requires email confirmation before sign-in. The API emails a confirmation link built from `PUBLIC_API_URL`. For Gmail or Google Workspace, enable 2-step verification and create an **App Password**, then use it as `SMTP_APP_PASSWORD`. Keep SMTP secrets and `DATABASE_URL` in Vercel's environment variables â€” never in the React code or the browser.

## SMS OTP delivery (OmniFlex)

When an administrator signs up or signs in with a phone number, the verification code is sent as an SMS through [OmniFlex](https://omniflex.co.zw) (`POST /api/sms/send`).

1. Sign in to OmniFlex and open **Settings -> Developer Keys**.
2. Generate a key (it starts with `omf_live_`) and copy it - it is shown only once.
3. Put it in `.env` locally and in Vercel's environment variables:

```env
OMNIFLEX_API_KEY=omf_live_xxxxxxxx
OMNIFLEX_SENDER_ID=          # optional; the account's active/default sender ID is used when empty
OMNIFLEX_BASE_URL=https://omniflex.co.zw/api
```

Without `OMNIFLEX_API_KEY` the API logs the code to the server console instead, and falls back to Africa's Talking (`AT_*`) if those keys are present. Codes are always logged as `[OTP] purpose=... identifier=... code=...`, which is handy while developing.

Delivery is bounded to 10 seconds so a slow gateway can never hang a sign-up. Recipient numbers are normalised to `263...` before sending, and OmniFlex routes them to Econet or NetOne automatically.

## Product import

From **Inventory**, choose **Import Excel** and upload `.xlsx`, `.xls`, or `.csv`. Required columns are `Name` and `SKU`. Optional: `Barcode`, `Unit`, `Category`, `System Qty`.
