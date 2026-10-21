# CivicPulse Backend

Backend API for **CivicPulse**, a community issue reporting and management
platform. This repository currently implements the **authentication and
authorization** foundation described in *Civic Pulse Project Proposal*:

- user registration **with email OTP verification**, login, logout and "current user"
- secure password hashing (bcrypt)
- JWT access + refresh tokens delivered as **secure HTTP-only cookies**
- role-based access control (`CITIZEN`, `ADMIN`, `PERSONNEL`)
- protected API endpoints, session revocation and refresh-token rotation
- request validation, rate limiting, security headers and centralised error handling
- the `User` and `Session` models required by authentication

This repository implements the **authentication module only**. Issue reporting,
assignment and history modules are intentionally not included here.

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
| Hardening | `helmet`, `express-rate-limit`, `cors` |

---

## Project structure

```
prisma/
  schema/                 # multi-file Prisma schema
    schema.prisma         # generator + datasource
    enum.prisma           # Role, UserStatus
    user.prisma
    session.prisma        # server-side refresh-token records
  all-seeds/              # one seed file per role
    admin.seed.ts
    personnel.seed.ts
    citizen.seed.ts
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
    middlewares/
      auth.ts             # requireAuth, requireRole, currentUser
      validateRequest.ts  # validateBody / validateQuery / validateParams
      rateLimit.ts
      globalErrorHandler.ts  # + notFound
    modules/
      auth/               # route, controller, service, validation, interfaces
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
| `SEED_ON_START` | `true` | Create demo accounts on boot |
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

On first boot the demo accounts are created (see below).

---

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| `ADMIN` | `admin@civicpulse.local` | `Admin@12345` |
| `PERSONNEL` | `personnel@civicpulse.local` | `Personnel@12345` |
| `CITIZEN` | `citizen@civicpulse.local` | `Citizen@12345` |

Seeding is idempotent: existing accounts are not recreated and their passwords
are never reset. Change the `SEED_*` values (and `SEED_ON_START=false`) for any
non-local deployment.

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
| `POST` | `/api/auth/change-password` | access token | Change password, revoke all sessions |

#### `POST /api/auth/register`

```json
{ "name": "Ayesha Rahman", "email": "ayesha@example.com", "password": "Str0ngPass" }
```

- Sends a 6-digit OTP and stores the pending sign-up for 5 minutes. **No
  account exists until the OTP is verified.**
- `201` with `{ expiresIn, expiresAt, sessionExpiresIn }`. `409` if the email is
  already registered.
- A `role` field is rejected by validation, so a client cannot self-assign
  `ADMIN`.
- Password policy: at least 8 characters, ≤ 72 bytes, one letter and one digit.

#### `POST /api/auth/verify-email`

```json
{ "email": "ayesha@example.com", "otp": "123456" }
```

- `201` with a confirmation message. The account is created with role `CITIZEN`
  and `emailVerified: true`. No user details are returned.
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

#### `POST /api/auth/change-password`

```json
{ "currentPassword": "Old@12345", "newPassword": "New@12345" }
```

`200` and the client must log in again. `400` if the current password is wrong.

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
```

A ready-to-import Postman collection is in
[`postman/CivicPulse.postman_collection.json`](postman/CivicPulse.postman_collection.json).
Postman keeps cookies in its cookie jar, so no manual token handling is needed.

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
| `bun run db:seed` | Create/update the demo accounts |

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

Out of scope by design (proposal §12): forgot-password, push notifications,
issue reporting and issue workflows.
