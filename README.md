# Eclearnix Jobs Super Admin

Super Admin frontend and API in one project. The frontend provides platform overview, company verification, job moderation, and administrator invites. The Express API verifies Google ID tokens, manages HTTP-only sessions, and enforces the `super_admin` role on protected routes.

## Local development

1. Install Node.js 20.19+ and run `npm install`.
2. Copy `.env.example` to `.env`. Set `MONGODB_URI`, a random `JWT_SECRET` of at least 32 characters, `GOOGLE_CLIENT_ID`, and `VITE_GOOGLE_CLIENT_ID`. `PRIMARY_ADMIN_EMAIL` defaults to the initial primary account; change it only if you intend to use a different initial account. The Google client ID is public; keep database credentials and signing secrets in server-only variables.
3. Configure the Google OAuth web client to allow `http://localhost:5173`.
4. Start the API with `npm run server`.
5. In another terminal, start the Super Admin UI with `npm run dev`. Vite proxies `/api` requests to `http://localhost:4000`.

The API connects to the MongoDB database in `MONGODB_URI` and will not start without that URI and a `JWT_SECRET`. Set `ADMIN_CLIENT_ORIGIN` to the exact frontend origin. Provision the initial administrator from a trusted operator terminal with `npm run admin:provision -- deepakrg23it@srishakthi.ac.in`.

For production, set `VITE_API_BASE_URL` to the API origin without `/api` or a trailing slash if the API is hosted separately. Set `CLIENT_ORIGIN` and `ADMIN_CLIENT_ORIGIN` to the exact permitted origins. If the UI and API are on different sites, production browsers may block third-party cookies; a same-site custom domain or same-origin API proxy is recommended.

## Authentication and API routes

The frontend sends Google Identity Services ID tokens to `POST /api/auth/google/super-admin`. The backend verifies the token audience and verified email, allows only an existing Super Admin or a valid administrator invite, and sets the `ecl_session` HTTP-only cookie. On startup the frontend calls `GET /api/auth/me`; it renders the workspace only if the backend reports `role: "super_admin"`. Sign-out calls `POST /api/auth/logout`.

The backend enforces session authentication and the Super Admin role on every administrative API route. The database tracks the primary administrator; `PRIMARY_ADMIN_EMAIL` bootstraps that designation for the initial account when no primary is assigned. An invited user must sign in with the invited, Google-verified email to join as a normal Super Admin. The current primary can then select **Assign as primary administrator** to transfer primary status; the previous primary remains a Super Admin. Only the current primary can create or revoke invitations, remove secondary administrators, or transfer primary status. CORS is credentialed and restricted to the configured origins.

The admin overview counts candidate and recruiter accounts as registered users. “Active in last 30 days” counts unique registered users with an authenticated app/API visit in that period; activity timestamps are refreshed at most once every 15 minutes per user. This is not anonymous traffic or page-view analytics.

| Method | API route | Purpose |
|---|---|---|
| GET | `/api/dashboard/admin` | Platform summary, registered-user totals, new registrations, and unique users active in the last 30 days |
| GET | `/api/admin/organizations` | Paginated organization list |
| PATCH | `/api/admin/organizations/:companyId/status` | Update organization review status |
| GET | `/api/admin/jobs` | Paginated jobs |
| PATCH | `/api/admin/jobs/:jobId/status` | Moderate a job |
| GET | `/api/admin/admins` | Current administrators and pending invitations |
| DELETE | `/api/admin/admins/:adminId` | Remove a secondary Super Admin (primary admin only) |
| POST | `/api/admin/admins/:adminId/primary` | Assign a secondary Super Admin as primary |
| POST | `/api/admin/admin-invitations` | Invite a Super Admin by email |
| DELETE | `/api/admin/admin-invitations/:inviteId` | Revoke a pending invitation |

## Deployment

The included Vercel configuration builds the UI, routes `/api/*` through one Express function in `api/index.js`, and rewrites other paths to the SPA entry point. Configure `MONGODB_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `PRIMARY_ADMIN_EMAIL`, `CLIENT_ORIGIN`, and `ADMIN_CLIENT_ORIGIN` as server environment variables. Set `VITE_GOOGLE_CLIENT_ID` as a public frontend build variable. Add `TRUST_PROXY=true` when deployed behind Vercel's proxy.

Administrator invitations and interview notifications use SMTP. For Gmail, enable 2-Step Verification and create a Google App Password, then set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` to the sending Gmail address, and `SMTP_PASSWORD` to the App Password. `SMTP_FROM` may be left blank to use `SMTP_USER`; otherwise, use the same address or a verified Gmail send-as alias. Set `ADMIN_CLIENT_ORIGIN` to the deployed Super Admin portal origin so invitation emails link to the correct page. Store these values in the API deployment environment, not in frontend `VITE_` variables.

Never put server secrets in `VITE_` variables or commit them. End-to-end OAuth and database workflows require configured Google OAuth and MongoDB.

## Validation

```powershell
npm run lint
npm run build
Get-ChildItem server -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```
