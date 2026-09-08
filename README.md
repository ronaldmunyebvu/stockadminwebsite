# StockCount Admin

A web admin console for the StockCount inventory-counting app. It shares the same Neon PostgreSQL database through the bundled Express API. The dashboard and the API are deployed together on Vercel.

## Local development

```bash
npm install
npm run dev      # Vite dev server (http://localhost:5174), proxies /api to the backend
npm run server   # Express API on http://localhost:8787
```

The Vite dev server proxies `/api` requests to the local Express server (port 8787). The Express server reads `DATABASE_URL` and keeps the connection string server-side.

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
3. Add the environment variables below in **Project → Settings → Environment Variables**:
   - `DATABASE_URL` — your Neon PostgreSQL connection string
   - `JWT_SECRET` — a long random secret
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_APP_PASSWORD`, `SMTP_FROM` — email sender (Gmail App Password recommended)
   - `PUBLIC_API_URL` — your deployed domain, e.g. `https://your-app.vercel.app` (used in email confirmation links)
4. Vercel runs `npm run build` (Vite → `dist`) and serves it as static content. The `api/index.cjs` file becomes a serverless function mounted at `/api/*`, so the frontend talks to the database through the same origin — no "failed to fetch" cross-origin issues.
5. Leave `VITE_API_URL` **empty** so the frontend uses the same-origin `/api` route. If you set it, use only an API origin such as `https://api.example.com`; do not include a trailing `/api` because the frontend adds that path automatically.

## Database

The app expects the shared tables `organizations`, `users`, `locations`, `zones`, `items`, `count_sessions`, `count_entries`, `excel_uploads`, and `audit_logs`. Apply [001_stockcount_neon.sql](neon/001_stockcount_neon.sql) to the Neon database before connecting either app.

## Administrator email confirmation

Shop creation requires email confirmation before sign-in. The API emails a confirmation link built from `PUBLIC_API_URL`. For Gmail or Google Workspace, enable 2-step verification and create an **App Password**, then use it as `SMTP_APP_PASSWORD`. Keep SMTP secrets and `DATABASE_URL` in Vercel's environment variables — never in the React code or the browser.

## Product import

From **Inventory**, choose **Import Excel** and upload `.xlsx`, `.xls`, or `.csv`. Required columns are `Name` and `SKU`. Optional: `Barcode`, `Unit`, `Category`, `System Qty`.
