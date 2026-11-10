# Eclearnix Jobs Super Admin

Super Admin frontend and API in one project. The frontend provides platform overview, company verification, job moderation, and administrator invites. The Express API verifies Google ID tokens, manages HTTP-only sessions, and enforces the `super_admin` role on protected routes.

## Local development

1. Install Node.js 20.19+ and run `npm install`.
2. Copy `.env.example` to `.env`. Set `MONGODB_URI`, a random `JWT_SECRET` of at least 32 characters, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, and `PRIMARY_ADMIN_EMAIL`. The Google client ID is public; keep database credentials and signing secrets in server-only variables.
3. Configure the Google OAuth web client to allow `http://localhost:5173`.
4. Start the API with `npm run server`.
5. In another terminal, start the Super Admin UI with `npm run dev`. Vite proxies `/api` requests to `http://localhost:4000`.

The API connects to the MongoDB database in `MONGODB_URI` and will not start without that URI and a `JWT_SECRET`. Set `ADMIN_CLIENT_ORIGIN` to the exact frontend origin and `PRIMARY_ADMIN_EMAIL` to the designated administrator. Provision the first administrator from a trusted operator terminal with `npm run admin:provision -- admin@example.com`.

For production, set `VITE_API_BASE_URL` to the API origin without `/api` or a trailing slash if the API is hosted separately. Set `CLIENT_ORIGIN` and `ADMIN_CLIENT_ORIGIN` to the exact permitted origins. If the UI and API are on different sites, production browsers may block third-party cookies; a same-site custom domain or same-origin API proxy is recommended.

## Authentication and API routes

The frontend sends Google Identity Services ID tokens to `POST /api/auth/google/super-admin`. The backend verifies the token audience and verified email, allows only an existing Super Admin or a valid administrator invite, and sets the `ecl_session` HTTP-only cookie. On startup the frontend calls `GET /api/auth/me`; it renders the workspace only if the backend reports `role: "super_admin"`. Sign-out calls `POST /api/auth/logout`.

The backend enforces session authentication and the Super Admin role on every administrative API route. `PRIMARY_ADMIN_EMAIL` designates the only account allowed to create or revoke administrator invitations. CORS is credentialed and restricted to the configured origins.

| Method | API route | Purpose |
|---|---|---|
| GET | `/api/dashboard/admin` | Platform summary |
| GET | `/api/admin/organizations` | Paginated organization list |
| PATCH | `/api/admin/organizations/:companyId/status` | Update organization review status |
| GET | `/api/admin/jobs` | Paginated jobs |
| PATCH | `/api/admin/jobs/:jobId/status` | Moderate a job |
| GET | `/api/admin/admins` | Current administrators and pending invitations |
| DELETE | `/api/admin/admins/:adminId` | Remove a secondary Super Admin (primary admin only) |
| POST | `/api/admin/admin-invitations` | Invite a Super Admin by email |
| DELETE | `/api/admin/admin-invitations/:inviteId` | Revoke a pending invitation |

## Deployment

The included Vercel configuration builds the UI, routes `/api/*` through one Express function in `api/index.js`, and rewrites other paths to the SPA entry point. Configure `MONGODB_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `PRIMARY_ADMIN_EMAIL`, `CLIENT_ORIGIN`, and `ADMIN_CLIENT_ORIGIN` as server environment variables. Set `VITE_GOOGLE_CLIENT_ID` as a public frontend build variable. Add `TRUST_PROXY=true` when deployed behind Vercel's proxy. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` only if interview email delivery is needed.

Never put server secrets in `VITE_` variables or commit them. End-to-end OAuth and database workflows require configured Google OAuth and MongoDB.

## Validation

```powershell
npm run lint
npm run build
Get-ChildItem server -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```
