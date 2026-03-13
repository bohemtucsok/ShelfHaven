<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-blue" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED" alt="Docker Compose" />
  <img src="https://img.shields.io/badge/MySQL-8.4-orange" alt="MySQL 8.4" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

# ShelfHaven

<p align="center">
  <strong>Web-based e-library platform with bookshelf UI, built-in EPUB reader, and social features.</strong>
</p>

<p align="center">
  <strong>🇬🇧 English</strong> | <a href="README.hu.md">🇭🇺 Magyar</a>
</p>

<p align="center">
  <a href="#screenshots">Screenshots</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#production">Production</a> •
  <a href="#security">Security</a> •
  <a href="#testing">Testing</a>
</p>

---

<table>
<tr>
<td width="80" align="center">
  <img src="https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android" />
</td>
<td>
  <strong>📱 ShelfHaven Mobile App — Coming Soon!</strong><br/>
  Native Android companion app built with Kotlin &amp; Jetpack Compose.<br/>
  Syncs your library, reading progress, and bookmarks across all your devices.
</td>
<td width="200" align="center">
  <img src="https://img.shields.io/badge/development-85%25-yellow?style=flat-square" alt="85%" /><br/>
  <sub>█████████████░░ 85%</sub>
</td>
</tr>
</table>

---

## Why ShelfHaven?

You have a collection of e-books scattered across devices. You want a beautiful, self-hosted library where you can upload, organize, and read them — with a cozy bookshelf feel, not a boring file list.

**ShelfHaven** gives you a full e-library platform running in Docker. Upload EPUBs (or PDFs/MOBIs — they get auto-converted), organize them on virtual bookshelves with categories and topics, and read them in a built-in EPUB reader with dark mode, bookmarks, and highlights.

Invite friends → they can browse your library, save books, comment, and follow each other. That's it.

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/01-home.png" width="80%" alt="Home page with bookshelf and categories" />
</p>

<p align="center">
  <em>Home page — mascot, categories, and your bookshelf at a glance</em>
</p>

<p align="center">
  <img src="docs/screenshots/01-login.png" width="45%" alt="Login page" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/03-admin.png" width="45%" alt="Admin dashboard" />
</p>

<p align="center">
  <em>Login &nbsp;|&nbsp; Admin Dashboard with statistics</em>
</p>

<p align="center">
  <img src="docs/screenshots/04-stats.png" width="80%" alt="Reading statistics with charts" />
</p>

<p align="center">
  <em>Reading statistics — goals, streaks, and charts</em>
</p>

---

## Features

- **Bookshelf UI** with 3D spine effects and smooth animations (Framer Motion)
- **Built-in EPUB reader** — dark mode, font settings, bookmarks, highlights, annotations
- **Auto-conversion** — upload PDF/MOBI/AZW3/FB2/CBR, Calibre converts to EPUB
- **Social features** — follow users, comment on books, activity feed, discover page
- **Save to library** — save other users' books to your own collection
- **Custom shelves** — organize books into public or private shelves
- **Categories & topics** — color-coded chips, auto-categorization from metadata
- **Admin dashboard** — user management, book moderation, full backup/restore (ZIP)
- **PWA + offline** — install as app, read books offline (IndexedDB)
- **i18n** — Hungarian + English, cookie-based locale detection
- **Security hardened** — OWASP audit passed, rate limiting, CSRF, CSP, brute-force protection

---

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url>
cd ShelfHaven
cp .env.example .env
```

Edit `.env` — change the passwords:

```bash
MYSQL_ROOT_PASSWORD=your_strong_password
MYSQL_PASSWORD=your_db_password
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
MINIO_ROOT_PASSWORD=your_minio_password
```

### 2. Start with Docker Compose

```bash
docker compose up -d
# First run takes ~3-5 minutes to build
```

### 3. Open and log in

Open **http://localhost:3000** — a default admin account is created automatically:

| | |
|---|---|
| **Email** | `demo@demo.hu` |
| **Password** | `Demo123!` |

> **Important:** Change the password or create your own admin account in production!

### 4. Upload books

Go to **Upload**, drag & drop your e-books (EPUB, PDF, MOBI — max 50MB), and they appear on your bookshelf.

<details>
<summary><strong>Development mode (hot-reload)</strong></summary>

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Requires Node.js 22+ and a running MySQL + MinIO instance.

</details>

---

## Docker Services

| Service | Port | Description | Healthcheck |
|---------|------|-------------|-------------|
| `app` | 3000 | Next.js application | `wget /api/health` |
| `db` | 3306 | MySQL 8.4 database | `mysqladmin ping` |
| `minio` | 9000 / 9001 | File storage (API / console) | `curl /minio/health/live` |
| `calibre` | 8080 | E-book conversion server | `curl /health` |

```bash
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose logs -f app        # Follow app logs
docker compose build --no-cache app  # Full rebuild
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MYSQL_ROOT_PASSWORD` | — | MySQL root password |
| `MYSQL_PASSWORD` | — | MySQL app user password |
| `NEXTAUTH_SECRET` | — | Auth encryption key (min 32 chars!) |
| `NEXTAUTH_URL` | `http://localhost:3000` | Public app URL |
| `AUTH_TRUST_HOST` | `true` | Set `true` behind reverse proxy |
| `MINIO_ROOT_USER` | `minioadmin` | MinIO access key |
| `MINIO_ROOT_PASSWORD` | — | MinIO secret key |
| `MINIO_PUBLIC_ENDPOINT` | `localhost` | MinIO public hostname |
| `APP_PORT` | `3000` | Application port |

> **Generate secrets:** `openssl rand -base64 32`

<details>
<summary><strong>Optional settings (configurable from admin panel)</strong></summary>

These are stored in the database `Setting` table and can be changed from the admin dashboard:

- **OIDC:** `oidc_enabled`, `oidc_issuer`, `oidc_client_id`, `oidc_client_secret`, `oidc_only`
- **SMTP:** `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`
- **Toggles:** `email_verification_enabled`, `registration_enabled`

</details>

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS 4, shadcn/ui (Radix UI), Framer Motion |
| **Backend** | Next.js API Routes, Prisma ORM v7 |
| **Database** | MySQL 8.4 (Docker) |
| **Auth** | NextAuth.js v5 (Auth.js) — credentials + OIDC (Authentik) |
| **Storage** | MinIO (S3-compatible, Docker container) |
| **E-book** | EPUB.js (browser reader), Calibre CLI (conversion) |
| **i18n** | next-intl v4 (Hungarian + English) |
| **State** | Zustand |
| **Validation** | Zod v4 + React Hook Form |
| **Testing** | Vitest (unit) + Playwright (E2E) |
| **Infrastructure** | Docker Compose (4 services) |

---

## Production

```
                    ┌─────────────┐
   HTTPS (443)      │   Reverse   │
  ─────────────────>│   Proxy     │
                    │ (nginx/NPM) │
                    └──────┬──────┘
                           │ :3000
                    ┌──────┴──────┐
                    │   Next.js   │  frontend network
                    │    (app)    │
                    └──┬───┬───┬──┘
                       │   │   │     backend network (internal)
                 ┌─────┘   │   └─────┐
                 │         │         │
            ┌────┴───┐ ┌───┴──┐ ┌───┴────┐
            │ MySQL  │ │MinIO │ │Calibre │
            │  8.4   │ │      │ │  CLI   │
            └────────┘ └──────┘ └────────┘
```

<details>
<summary><strong>Production checklist</strong></summary>

Set in `.env`:
- `NEXTAUTH_SECRET` — generate: `openssl rand -base64 32`
- `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` — strong passwords
- `MINIO_ROOT_PASSWORD` — strong password
- `NEXTAUTH_URL` — your domain (e.g., `https://yourdomain.com`)
- `MINIO_PUBLIC_ENDPOINT` — your domain

Architecture:
- Two networks: `frontend` (public) + `backend` (internal, not exposed)
- Memory limits: app 512MB, calibre 1GB
- JSON log driver (max 10MB x 5 files per container)
- Reverse proxy (nginx, Caddy, or NPM) required for HTTPS

</details>

---

## Security

### Implemented protections

| Layer | Detail |
|-------|--------|
| **Authentication** | NextAuth.js v5 (JWT, 24h expiry) |
| **OIDC** | Authentik integration (admin-configurable) |
| **CSRF** | Origin/Host validation on all mutating endpoints |
| **Rate limiting** | In-memory, 7 presets (auth: 10/15min, API: 60/min, public: 30/min) |
| **Brute-force** | 5 attempts → 15min lockout (per email) |
| **CSP** | Restrictive Content-Security-Policy |
| **Headers** | HSTS, X-Frame-Options DENY, nosniff, COOP, CORP, Permissions-Policy |
| **EPUB safety** | ZIP bomb protection (5000 file limit, ratio detection) |
| **SSRF** | Private IP check on cover downloads (post-redirect too) |
| **File validation** | Magic bytes for 8 formats (EPUB, PDF, MOBI, AZW3, FB2, CBR, DOCX, RTF) |
| **Stale JWT** | DB verification every 5 min, deleted user token invalidation |
| **Input** | Zod v4 validation on every API endpoint |

<details>
<summary><strong>Audit results (2026-02-23)</strong></summary>

- **15/15 input validation tests PASS** (SQLi, XSS, path traversal, XXE)
- **All protected endpoints** correctly return 401 without auth
- **CORS:** deny-all policy
- **Overall rating: A-**

</details>

---

## Database Schema (24 tables)

```
User ─────┬── Book ────────┬── ReadingProgress
          │                ├── Bookmark
          ├── Account      ├── Highlight
          ├── Session      ├── Review
          ├── Shelf ──── ShelfBook
          ├── Follow       ├── Like
          ├── Activity     ├── SavedBook
          ├── Comment      ├── SharedLink
          ├── Notification ├── Comment
          └── ReadingGoal  ├── BookCategory ── Category
                           └── BookTopic ──── Topic

Standalone: Setting, VerificationToken
```

---

## Testing

```bash
npm run test:run          # Unit tests (Vitest)
npm run test:e2e          # E2E tests (Playwright)
npm run test:e2e:ui       # E2E with interactive UI
npx tsc --noEmit          # TypeScript check
```

| Type | Count | Framework |
|------|-------|-----------|
| Unit / Integration | 4 files | Vitest + React Testing Library |
| E2E | 22 files | Playwright (Chromium) |

---

## Project Structure

<details>
<summary><strong>Click to expand</strong></summary>

```
ShelfHaven/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Login, register, verify-email
│   │   ├── (main)/             # Main pages (17 pages)
│   │   ├── (reader)/           # Reader layout (separate)
│   │   └── api/                # REST API (~85 endpoints)
│   ├── components/             # React components
│   │   ├── bookshelf/          # BookSpine, ShelfScene, BookCover, SaveToLibraryButton
│   │   ├── reader/             # EpubReader
│   │   ├── social/             # ActivityCard, CommentSection, FollowButton
│   │   ├── discover/           # DiscoverSection, TrendingCard
│   │   ├── admin/              # BackupPanel
│   │   └── layout/             # Header, Footer
│   ├── lib/                    # Utilities
│   │   ├── auth.ts             # NextAuth config + brute-force + OIDC
│   │   ├── prisma.ts           # Prisma client singleton
│   │   ├── storage/minio.ts    # MinIO S3 client
│   │   ├── backup/             # Admin backup & restore
│   │   └── ebook/              # EPUB parser, Calibre client, cover utils
│   ├── hooks/                  # Custom React hooks
│   ├── store/                  # Zustand stores
│   └── types/                  # TypeScript types
├── prisma/
│   ├── schema.prisma           # Database schema (24 tables)
│   └── init.sql                # Auto-generated create script
├── messages/                   # Translations (hu + en)
├── tests/                      # Unit (4) + E2E (22) tests
├── docker/calibre/             # Calibre conversion server (Python)
├── docker-compose.yml          # Docker Compose (unified, 4 services)
├── Dockerfile                  # Multi-stage build (4 stages)
└── docker-entrypoint.sh        # Auto DB init + migration
```

</details>

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| **v3.5** | 2026-03 | Reader search & slider, view mode persistence, cover upload, refresh button, Harbor CI/CD, mobile app companion |
| **v3.4** | 2026-02 | SavedBook (save others' books), auth cookie HTTPS fix, shelf dropdown fix |
| **v3.3** | 2026-02 | Admin backup & restore (ZIP), security audit, email/registration toggles |
| **v3.2** | 2026-02 | Social: Follow, Comment, Activity, Discover |
| **v3.1** | 2026-01 | Performance (Blurhash, PWA, offline), annotations, 6 new E2E tests |
| **v3.0** | 2026-01 | Core: upload, read, shelves, categories, topics, admin, i18n |

---

## Supporters

<p align="center">
  <a href="https://infotipp.hu"><img src="docs/images/infotipp-logo.png" height="40" alt="Infotipp Rendszerház Kft." /></a>
  &nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://brutefence.com"><img src="docs/images/brutefence.png" height="40" alt="BruteFence" /></a>
</p>

---

## License

This project is licensed under the [MIT License](LICENSE).

## Disclaimer

This software is provided for managing **legally obtained** e-books and digital content only. The developers are not responsible for how the software is used. It is the sole responsibility of the user/operator to ensure compliance with all applicable copyright laws and regulations in their jurisdiction. Unauthorized distribution of copyrighted material is strictly prohibited.
