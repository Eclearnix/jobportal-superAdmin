# Eclearnix Jobs Super Admin

Standalone administrator frontend for the existing Eclearnix Jobs API. It does not host authentication or grant roles itself: Google ID tokens are verified by the backend, which issues the HTTP-only session cookie and checks the `super_admin` role on protected API routes.

The admin workspace focuses on the platform overview, company verification, job approval or rejection, and administrator invites. It does not display individual user, candidate, or application records. Other role-protected admin API routes remain available in the backend but are not called by this frontend.

## Local development

1. Install Node.js 20.19+ and run `npm install`.
2. Copy `.env.example` to `.env`; set `VITE_GOOGLE_CLIENT_ID` to the OAuth web client ID used by the backend. It is a public client identifier, not a secret.
3. Configure the backend with `ADMIN_CLIENT_ORIGIN=http://localhost:5173` and the matching `GOOGLE_CLIENT_ID`; add the same origin to the Google OAuth web client.
4. Start the frontend with `npm run dev`. Vite proxies `/api` to `http://localhost:4000`.

For a deployed frontend, set `VITE_API_BASE_URL` to the API origin (without `/api` or a trailing slash), and set the backend's `ADMIN_CLIENT_ORIGIN` to this frontend's exact HTTPS origin. Add the frontend origin to the Google OAuth web client. If the frontend and API are on different sites, production session cookies use `SameSite=None; Secure`; browsers may block third-party cookies, so a custom-domain setup on the same site or a same-origin API proxy is recommended.

Only the Google client ID is public frontend configuration. Keep `GOOGLE_CLIENT_ID`, `JWT_SECRET`, `MONGODB_URI`, and other server configuration in backend environment variables; never place those values in this repository or in `VITE_` variables.

## Authentication and API routes

The frontend posts a Google Identity Services ID token to `POST /api/auth/google/super-admin`. The backend verifies the token's audience and verified email, allows only an existing Super Admin or a valid administrator invite, and sets the `ecl_session` HTTP-only cookie. On startup the frontend calls `GET /api/auth/me`; it renders the workspace only if the backend reports `role: "super_admin"`. Sign-out calls `POST /api/auth/logout`.

The backend enforces both session authentication and the Super Admin role on every administrative API route. The backend's `PRIMARY_ADMIN_EMAIL` setting designates one primary administrator; only that account can create or revoke administrator invitations. CORS is credentialed and restricted to the exact origins in `CLIENT_ORIGIN` and `ADMIN_CLIENT_ORIGIN`. This frontend uses the overview, company, job, and admin management routes:

| Method | API route | Purpose |
|---|---|---|
| GET | `/api/dashboard/admin` | Platform summary |
| GET | `/api/admin/organizations` | Paginated organization list |
| PATCH | `/api/admin/organizations/:companyId/status` | Update organization review status |
| GET | `/api/admin/jobs` | Paginated jobs |
| PATCH | `/api/admin/jobs/:jobId/status` | Moderate a job |
| GET | `/api/admin/admins` | Current administrators and pending invitations |
| POST | `/api/admin/admin-invitations` | Invite a Super Admin by email |
| DELETE | `/api/admin/admin-invitations/:inviteId` | Revoke a pending invitation |

## Validation

```powershell
npm run lint
npm run build
```

End-to-end sign-in and administrator operations require the configured Google OAuth client and running backend/database. Never commit credentials or tokens.
