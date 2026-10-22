# CivicPulse Backend

Backend API for **CivicPulse**, a community issue reporting and management
platform. This repository implements the authentication foundation plus the
issue reporting, assignment, status history, dashboard and admin user modules
described in *Civic Pulse Project Proposal*:

- user registration **with email OTP verification**, login, logout and "current user"
- secure password hashing (bcrypt)
- JWT access + refresh tokens delivered as **secure HTTP-only cookies**
- role-based access control (`CITIZEN`, `ADMIN`, `PERSONNEL`)
- protected API endpoints, session revocation and refresh-token rotation
- issue reporting, editing, deletion, search, filtering and pagination
- Cloudinary-backed issue photo uploads with server-side ownership checks
- admin assignment, priority changes and status workflow with history
- citizen, personnel and administrator dashboard statistics
- admin user listing for assignment and account oversight
- request validation, rate limiting, security headers and centralised error handling
- the `User`, `Session`, `Issue` and `IssueHistory` models

Registration sends a 6-digit code by email and the account is only created once
that code is confirmed. Authentication itself remains **credential-based only**
(email + password) — there is no OAuth, Google sign-in or other third-party
identity provider. Email is used solely for the registration OTP; there are no
marketing, push or notification emails.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Runtime | [Bun](https://bun.sh) |
| HTTP | Express 5 |
| ORM | Prisma 7 (driver adapter: `@prisma/adapter-pg`) |
| Database | PostgreSQL |
| Validation | Zod 4 |
| Auth | `jsonwebtoken` (HS256) + `cookie-parser` |
| Passwords | `bcryptjs` |
| OTP storage | Redis |
| Email | `nodemailer` (plain text) |
| Image uploads | `cloudinary` + `multer` (memory storage) |
| Hardening | `helmet`, `express-rate-limit`, `cors` |

---

## Project structure

```
prisma/
  schema/                 # multi-file Prisma schema
    schema.prisma         # generator + datasource
    enum.prisma           # Role, UserStatus, Issue enums
    user.prisma
    session.prisma        # server-side refresh-token records
    issue.prisma          # reported issues + assignment
    issue-history.prisma  # status-change audit trail
  all-seeds/              # one seed file per role + demo issues
    admin.seed.ts
    personnel.seed.ts
    citizen.seed.ts
    issues.seed.ts        # additive demo issue + history data
    seed.types.ts
    seed.ts               # shared upsert logic
src/
  app.ts                  # Express wiring
  server.ts               # bootstrap: config check, DB connect, seed, listen
  app/
    config/               # environment configuration
    lib/
      prisma.ts           # PrismaClient + pg adapter
      redis.ts            # Redis client (OTP + pending registration)
      nodemailer.ts       # SMTP transporter
      cloudinary.ts       # Cloudinary client + upload/delete helpers
      multer.ts           # in-memory image upload middleware
    middlewares/
      auth.ts             # requireAuth, requireRole, currentUser
      validateRequest.ts  # validateBody / validateQuery / validateParams
      rateLimit.ts
      globalErrorHandler.ts  # + notFound
    modules/
      auth/               # register, login, sessions
      issues/             # reporting, workflow, history, stats
      dashboard/          # dashboard route
      admin/              # admin user listing
    utils/                # jwt, password, cookie, email, AppError, ...
generated/prisma/         # generated Prisma client (do not edit)
```

---

## Getting started

### 1. Install dependencies

```bash
bun install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Then generate two secrets and paste them into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | – | PostgreSQL connection string |
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `development` \| `production` |
| `API_PREFIX` | `/api` | Base path for API routes |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin (cookies enabled) |
| `TRUST_PROXY` | `0` | Number of trusted reverse proxies |
| `BCRYPT_SALT_ROUNDS` | `12` | bcrypt cost (10–15) |
| `JWT_ACCESS_SECRET` | – | ≥ 32 chars, different from refresh secret |
| `JWT_REFRESH_SECRET` | – | ≥ 32 chars |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh-token / session lifetime |
| `JWT_ISSUER` | `civicpulse-api` | `iss` claim |
| `JWT_AUDIENCE` | `civicpulse-web` | `aud` claim |
| `COOKIE_SAME_SITE` | `lax` | `lax` \| `strict` \| `none` |
| `COOKIE_SECURE` | `true` in production | Send cookies over HTTPS only |
| `COOKIE_DOMAIN` | unset | e.g. `.example.com` for cross-subdomain |
| `REDIS_HOST` | `127.0.0.1` | Redis host for OTP storage |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_USER` / `REDIS_PASSWORD` | unset | Set if your Redis requires auth |
| `SMTP_USER` | unset | SMTP account (Gmail address) |
| `SMTP_PASSWORD` | unset | Gmail **App Password** |
| `EMAIL_SENDER` | SMTP user | `From` header for OTP emails |
| `OTP_EXPIRES_IN_SECONDS` | `120` | OTP lifetime |
| `REGISTRATION_SESSION_EXPIRES_IN_SECONDS` | `300` | How long pending registration data is kept |
| `CLOUDINARY_CLOUD_NAME` | unset | Cloudinary cloud name (all three required for uploads) |
| `CLOUDINARY_API_KEY` | unset | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | unset | Cloudinary API secret |
| `SEED_ON_START` | `true` | Create demo accounts and demo issues on boot |
| `SEED_*` | see `.env.example` | Demo account name / email / password |

> `COOKIE_SAME_SITE=none` requires `COOKIE_SECURE=true`; the server refuses to
> start otherwise. Keep `lax` unless your frontend is on a different
> registrable domain.

### 3. Start Redis

Registration OTPs and pending sign-up data are kept in Redis:

```bash
redis-server
# or, without installing Redis:
docker run --rm -p 6379:6379 redis:7
```

If `SMTP_USER` / `SMTP_PASSWORD` are left empty in development, the OTP is
printed to the API console instead of being emailed. Production startup
requires both.

### 4. Create the database schema

Migrations are **not** run automatically. Run this once (and after every schema
change):

```bash
bun run db:migrate
```

Then generate the client:

```bash
bun run db:generate
```

### 5. Start the API

```bash
bun run dev      # watch mode
bun run start    # one-off
```

On first boot the demo accounts and demo issues are created (see below).

---

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| `ADMIN` | `admin@civicpulse.local` | `Admin@12345` |
| `PERSONNEL` | `personnel@civicpulse.local` | `Personnel@12345` |
| `CITIZEN` | `citizen@civicpulse.local` | `Citizen@12345` |

Seeding is **additive**: existing accounts, issues and history are left
untouched. Missing demo accounts and the demo issues below are created on first
boot (or with `bun run db:seed`); nothing is deleted or updated.

Each demo account also gets a profile photo (`https://picsum.photos/...`) so the
`imageUrl` field and the `PATCH /api/auth/me/image` endpoint have data to work
with right away.

### Demo issues

| Title | Category | Priority | Status |
| --- | --- | --- | --- |
| Large pothole on Main Road | `ROADS` | `HIGH` | `PENDING` |
| Streetlight not working near Central Park | `STREETLIGHTS` | `MEDIUM` | `IN_PROGRESS` |
| Water pipe leaking on Elm Street | `WATER` | `HIGH` | `RESOLVED` |
| Overflowing bins at Market Square | `WASTE` | `LOW` | `PENDING` |
| Damaged bench in Riverside Park | `OTHER` | `MEDIUM` | `RESOLVED` |

The demo issues include assignment and status-history records, so the dashboard
and history endpoints have data immediately after seeding. Change the `SEED_*`
values (and set `SEED_ON_START=false`) for any non-local deployment.

---

## Authentication model

**Why cookies instead of `Authorization` headers?** The proposal specifies
*"JWT with secure HTTP-only cookies"*. Tokens are therefore **never returned in
the response body**; they are set as `HttpOnly` cookies, which JavaScript cannot
read, so a cross-site scripting bug cannot steal them.

Two cookies are issued:

| Cookie | Lifetime | Purpose |
| --- | --- | --- |
| `cp_access_token` | `JWT_ACCESS_EXPIRES_IN` (15m) | Authenticates requests |
| `cp_refresh_token` | `JWT_REFRESH_EXPIRES_IN` (7d) | Obtains a new pair |

Both are `HttpOnly`, `SameSite` configurable, `Secure` in production, and scoped
to `/`.

**Server-side sessions.** Every login stores a `Session` row containing a
SHA-256 hash of the refresh token (never the token itself). This makes real
logout possible:

- `POST /api/auth/refresh-token` **rotates** the refresh token: the old row is
  revoked and a new one is created.
- Replaying an already-rotated refresh token is treated as theft: every session
  for that user is revoked and the account's `tokenVersion` is incremented.
- `POST /api/auth/logout` revokes the presented session and clears the cookies.
- `POST /api/auth/change-password` revokes **all** sessions and bumps
  `tokenVersion`, so every existing access token stops working immediately.

> Logout ends the refresh session immediately. The already-issued **access**
> token stays valid until it expires (default 15 minutes), which is the normal
> trade-off for stateless access tokens. Any revocation that matters for
> security (password change, block, token replay) bumps `tokenVersion` and
> therefore invalidates access tokens instantly.

**Authorization.** `requireAuth` re-reads the user on every request, so a role
change, block, deletion or password change takes effect on the next request
instead of when the token expires. `requireRole(...)` reads the role from the
database, never from the token.

**Password storage.** bcrypt with a configurable cost (default 12). Passwords
longer than 72 **bytes** are rejected because bcrypt silently truncates beyond
that limit.

**Email verification (OTP).** Registration is a two-step flow:

1. `POST /api/auth/register` validates the input, hashes the password, stores the
   pending account and a 6-digit OTP in Redis, then emails the code. **No
   `User` row is created yet.**
2. `POST /api/auth/verify-email` checks the code and creates the `User` with
   `emailVerified = true`. Only then can the account log in.

The OTP is valid for 2 minutes, is deleted as soon as it is used, and is
compared in constant time. `POST /api/auth/resend-otp` issues a fresh code and
extends the pending registration window (5 minutes). Both endpoints are rate
limited. In development the OTP is always printed to the console; the email is
sent when SMTP is configured.

**Enumeration resistance.** `POST /auth/login` performs one bcrypt comparison
even when the email is unknown, and only reports account state (blocked/deleted)
after the password has been verified. `verify-email` and `resend-otp` give
generic errors so they cannot be used to enumerate pending registrations.

---

## API reference

Base path: `/api`. All responses use a consistent envelope:

```json
{ "success": true, "statusCode": 200, "message": "...", "data": { } }
```

`data` is omitted for responses that have no payload (for example email
verification).

Errors use `{ "success": false, "statusCode": 4xx, "message": "...", "errors": [] }`.

### Authentication

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | public | Start registration and email an OTP |
| `POST` | `/api/auth/verify-email` | public | Confirm the OTP and create the account |
| `POST` | `/api/auth/resend-otp` | public | Send a new registration OTP |
| `POST` | `/api/auth/login` | public | Log in and receive auth cookies |
| `POST` | `/api/auth/refresh-token` | refresh cookie | Rotate tokens |
| `POST` | `/api/auth/logout` | refresh cookie (optional) | End the session |
| `GET` | `/api/auth/me` | access token | Current user profile |
| `PATCH` | `/api/auth/me/image` | access token | Upload or replace the profile photo |
| `POST` | `/api/auth/change-password` | access token | Change password, revoke all sessions |

#### `POST /api/auth/register`

Send either JSON or multipart:

```json
{ "name": "Ayesha Rahman", "email": "ayesha@example.com", "password": "Str0ngPass" }
```

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -F 'body={"name":"Ayesha Rahman","email":"ayesha@example.com","password":"Str0ngPass"}' \
  -F "image=@avatar.jpg"
```

- In multipart, the account fields go in one text field named `body` as a JSON
  object and the optional picture is a File field named `image`. Flat fields
  (`name`, `email`, `password` as separate form fields) are still accepted.
- Sends a 6-digit OTP and stores the pending sign-up for 5 minutes. **No
  account exists until the OTP is verified.**
- `201` with `{ expiresIn, expiresAt, sessionExpiresIn }`. `409` if the email is
  already registered.
- The optional `image` file (JPEG, PNG, WebP or GIF, max 5 MB) is uploaded to
  Cloudinary immediately and applied to the account when the OTP is verified. If
  registration is never verified, the temporary upload is deleted the next time a
  server with Cloudinary configured starts.
- A `role` field is rejected by validation, so a client cannot self-assign
  `ADMIN`.
- Password policy: at least 8 characters, ≤ 72 bytes, one letter and one digit.

#### `POST /api/auth/verify-email`

```json
{ "email": "ayesha@example.com", "otp": "123456" }
```

- `201` with a confirmation message. The account is created with role `CITIZEN`,
  `emailVerified: true`, and the profile photo supplied during registration (if
  any). No user details are returned.
- `400` if the code is wrong, expired, or the registration session has expired.
- `409` if the email was verified concurrently.

#### `POST /api/auth/resend-otp`

```json
{ "email": "ayesha@example.com" }
```

- `200` with the new `expiresIn`, `expiresAt` and `sessionExpiresIn`.
- `400` if the pending registration has expired; register again.
- `409` if the email is already registered.

#### `POST /api/auth/login`

```json
{ "email": "citizen@civicpulse.local", "password": "Citizen@12345" }
```

- `200` with the profile and two `Set-Cookie` headers.
- `401` for wrong credentials, `403` if the account is blocked or its email is
  not verified.
- Limited to 10 **failed** attempts per IP per 15 minutes.

#### `POST /api/auth/refresh-token`

No body. Reads `cp_refresh_token`, rotates it, sets new cookies and returns the
profile. `401` if the session is missing, expired, revoked or reused.

#### `POST /api/auth/logout`

No body. Always `200`; clears both cookies. Safe to call when already logged out.

#### `GET /api/auth/me`

Returns the current profile. `401` when not authenticated.

#### `PATCH /api/auth/me/image`

```bash
curl -b jar.txt -X PATCH http://localhost:5000/api/auth/me/image \
  -F "image=@avatar.jpg"
```

- Uploads a JPEG, PNG, WebP or GIF file (max 5 MB) in the `image` form-data
  field. Any logged-in role can update their own photo.
- The photo is uploaded to Cloudinary under `civicpulse/users`. The secure URL is
  stored in `imageUrl` and returned in the profile; the Cloudinary public id
  stays server-side and the previous photo is deleted after a replacement.

#### `POST /api/auth/change-password`

```json
{ "currentPassword": "Old@12345", "newPassword": "New@12345" }
```

`200` and the client must log in again. `400` if the current password is wrong.

### Issues

Public reads never expose reporter or assignee email addresses. Only names are
included. Issue photos are uploaded to Cloudinary; the returned secure URL is
stored in `imageUrl` and the Cloudinary public id is kept privately for cleanup.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/issues` | public | List issues with search, filters and pagination |
| `GET` | `/api/issues/me` | access token | List the current user's own reports |
| `GET` | `/api/issues/assigned` | `PERSONNEL` | List issues assigned to the current personnel |
| `GET` | `/api/issues/:id` | public | Issue details |
| `GET` | `/api/issues/:id/history` | public | Status-change history |
| `POST` | `/api/issues` | `CITIZEN` | Report an issue |
| `PATCH` | `/api/issues/:id` | owner (`PENDING`) or `ADMIN` | Edit an issue |
| `PATCH` | `/api/issues/:id/image` | owner (`PENDING`) or `ADMIN` | Upload or replace the issue photo |
| `DELETE` | `/api/issues/:id` | owner (`PENDING`) or `ADMIN` | Delete an issue |
| `PATCH` | `/api/issues/:id/assign` | `ADMIN` | Assign or unassign personnel |
| `PATCH` | `/api/issues/:id/status` | `ADMIN` or assigned `PERSONNEL` | Update status and record history |
| `PATCH` | `/api/issues/:id/priority` | `ADMIN` | Change priority |

#### `GET /api/issues`

Query parameters:

| Parameter | Values | Default |
| --- | --- | --- |
| `search` | title substring | – |
| `category` | `ROADS`, `STREETLIGHTS`, `WATER`, `WASTE`, `OTHER` | – |
| `priority` | `LOW`, `MEDIUM`, `HIGH` | – |
| `status` | `PENDING`, `IN_PROGRESS`, `RESOLVED` | – |
| `page` | integer ≥ 1 | `1` |
| `limit` | integer 1–100 | `10` |
| `sort` | `newest`, `oldest` | `newest` |

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Issues retrieved.",
  "data": [],
  "meta": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
}
```

#### `POST /api/issues`

```json
{
  "title": "Broken streetlight near the library",
  "description": "The streetlight has been off for three nights.",
  "category": "STREETLIGHTS",
  "location": "Library entrance, Civic Avenue",
  "imageUrl": "https://example.com/photo.jpg",
  "priority": "HIGH"
}
```

`201` with the created issue in `PENDING` status. Creating an issue also writes
the first `IssueHistory` row. Send the same request as `multipart/form-data` with
an `image` file field to upload a photo while reporting. In multipart, put the
issue fields in one text field named `body` as a JSON object:

```bash
curl -b jar.txt -X POST http://localhost:5000/api/issues \
  -F 'body={"title":"Broken streetlight","description":"The lamp outside the library is dark.","category":"STREETLIGHTS","location":"Library entrance","priority":"HIGH"}' \
  -F "image=@photo.jpg"
```

Flat form fields (the issue fields as separate keys) are also accepted.

A JSON request can still provide `imageUrl` for an image hosted elsewhere.

#### `PATCH /api/issues/:id/image`

```bash
curl -b jar.txt -X PATCH http://localhost:5000/api/issues/<issue-id>/image \
  -F "image=@photo.jpg"
```

The image is uploaded to Cloudinary under `civicpulse/issues`. The issue stores
the secure URL in `imageUrl`; the Cloudinary public id stays server-side and is
used to delete the old file when the photo is replaced or the issue is deleted.
JPEG, PNG, WebP and GIF files are accepted up to 5 MB. Owners may change the
photo only while their report is `PENDING`; admins may change any issue photo.

#### `PATCH /api/issues/:id/status`

```json
{ "status": "RESOLVED", "resolutionNote": "Lamp replaced." }
```

- `ADMIN` may move an issue between any two different statuses.
- `PERSONNEL` must be the assignee and may only follow
  `PENDING → IN_PROGRESS → RESOLVED`.
- Every change is written to `IssueHistory` in the same database transaction.
- Setting `RESOLVED` records `resolvedAt` and `resolutionNote`.

#### `PATCH /api/issues/:id/assign`

```json
{ "personnelId": "uuid-of-active-personnel" }
```

Send `{ "personnelId": null }` to unassign.

### Dashboard

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/dashboard/stats` | access token | Role-scoped dashboard statistics |

`ADMIN` receives platform-wide counts (`scope: "ALL"`), `PERSONNEL` receives
counts for assigned issues (`scope: "ASSIGNED"`), and `CITIZEN` receives counts
for their own reports (`scope: "OWN"`). The response includes total, pending,
in-progress, resolved and high-priority counts, a status distribution and the
five most recent issues in scope.

### Administration

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | `ADMIN` | List and search users |
| `PATCH` | `/api/admin/users/:id/image` | `ADMIN` | Replace a user's photo |
| `DELETE` | `/api/admin/users/:id/image` | `ADMIN` | Remove a user's photo |

Query parameters: `search` (name or email), `role`
(`CITIZEN`/`ADMIN`/`PERSONNEL`), `status` (`ACTIVE`/`BLOCKED`/`DELETED`),
`page` and `limit`. Use `role=PERSONNEL` to populate the assignment picker.

`PATCH /api/admin/users/:id/image` accepts a JPEG, PNG, WebP or GIF file in the
`image` form-data field (max 5 MB) and replaces the user's Cloudinary photo.
`DELETE /api/admin/users/:id/image` clears `imageUrl` and removes the file from
Cloudinary. Every user result already includes `imageUrl`.

### Health

`GET /health` → `200` when the process is up (no database access).

---

## Testing with curl

Cookies must be stored between requests:

```bash
curl -c jar.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@civicpulse.local","password":"Admin@12345"}'

curl -b jar.txt http://localhost:5000/api/auth/me

curl -b jar.txt -X POST http://localhost:5000/api/issues \
  -H "Content-Type: application/json" \
  -d '{"title":"Broken streetlight","description":"The lamp outside the library is dark.","category":"STREETLIGHTS","location":"Library entrance","priority":"HIGH"}'

curl "http://localhost:5000/api/issues?status=PENDING&category=STREETLIGHTS&page=1&limit=10"
```

A ready-to-import Postman collection is in
[`postman/CivicPulse.postman_collection.json`](postman/CivicPulse.postman_collection.json).
Postman keeps cookies in its cookie jar, so no manual token handling is needed.
Run the folders in order (`Auth`, `Public Issues`, `Citizen`, `Admin`,
`Personnel`, `Cleanup`); each role logs in once at the point where the active
cookie switches from the previous role.

---

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Start with watch mode |
| `bun run start` | Start once |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint:check` / `lint:fix` | Biome lint |
| `bun run format:check` / `format:fix` | Biome format |
| `bun run db:generate` | Generate the Prisma client |
| `bun run db:migrate` | Create/apply a migration (development) |
| `bun run db:studio` | Open Prisma Studio |
| `bun run db:seed` | Create the missing demo accounts and demo issues |

---

## Security checklist

- [x] bcrypt password hashing with configurable cost
- [x] `HttpOnly` + `SameSite` + `Secure` (production) cookies
- [x] Access and refresh secrets are separate and validated at startup
- [x] Refresh-token rotation with reuse detection
- [x] Immediate revocation (logout, password change, account block)
- [x] Role checked against the database on every request
- [x] Email verification before an account can log in
- [x] Single-use OTP, 2-minute expiry, constant-time comparison
- [x] OTP endpoints rate limited per IP
- [x] Zod validation on body, query and route params
- [x] Rate limiting on login, registration and the whole auth surface
- [x] `helmet` security headers, CORS restricted to `FRONTEND_URL`
- [x] Centralised error handling that never leaks stack traces in production
- [x] Login timing equalised to prevent account enumeration
- [x] bcrypt 72-byte truncation prevented
- [x] Citizens can only edit or delete their own pending reports
- [x] Only admins can assign personnel or change priority
- [x] Personnel can only update issues assigned to them
- [x] Status changes validated server-side and recorded in history
- [x] Public issue responses exclude reporter and assignee email addresses
- [x] Issue photos are type-checked, size-limited and uploaded server-side
- [x] Replaced and deleted issue photos are removed from Cloudinary

Out of scope by design (proposal §12): forgot-password, interactive maps,
push notifications, real-time messaging and AI classification.
