# ShelfHaven (eBookesPolc) v3.3

Webes e-konyvtar platform, ahol felhasznalok e-konyveket tolthetnek fel, rendezhetik kategoriak es temak szerint, es a beepitett EPUB olvasoban olvashatjak azokat. A konyvek vizualisan konyvespolcokon jelennek meg, kozossegi funkciokkal (kovetkoezes, kommentek, tevekenyseegi hirfolyam).

---

## Funkcionalitas

### Alapfunkciok
- E-konyv feltoltes (EPUB, PDF, MOBI, AZW3, FB2, CBR) - max 50MB
- Automatikus PDF/MOBI -> EPUB konverzio (Calibre)
- Beepitett EPUB olvaso (EPUB.js) soetoet moddal, betutipus/meret beallitassal
- Olvasasi haladas mentese (CFI pozicio + szazalek)
- Konyvjelzok, kiemellesek, annotaciok
- Konyvespolc nezet (3D konyvgerinc effekt) es racs nezet
- Kategoriak es temak szerinti rendszerezes
- Egyeni polcok (publikus / privat)
- Kereses (teljes szoveges: cim + szerzo)

### Kozossegi funkciok (v3.2)
- Felhasznaloi profilok es kovetoesi rendszer (Follow)
- Kommentek konyvekhez (toebbszintu valasz szalak)
- Tevekenyseegi hirfolyam (Activity Feed)
- Felfedezoes oldal (Discover) - nepszeru es uj konyvek
- Konyv megosztasa (publikus link token-nel, lejarat megadasaval)

### Admin funkciok
- Felhasznalo kezeles (letrehozas, szerep modositas, torles)
- Konyv moderacio (osszes konyv listazas, torles)
- Kategoria es tema kezeles
- SMTP email beallitas (verifikacios email toggle)
- OIDC (Authentik) integracol beallitasa
- Regisztracio ki/bekapcsolas
- Rate limit monitor
- Teljes biztonsagi mentes es visszaallitas (v3.3)

### Teljesitmeny es offline (v3.1)
- Blurhash boritokep placeholder-ek
- PWA (Service Worker + runtimeCaching)
- Offline konyvek (IndexedDB tarolassal)
- Lazy-loaded Recharts statisztika grafikonok

---

## Tech Stack

| Reteg | Technologia |
|-------|-------------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Stilusok** | Tailwind CSS 4, shadcn/ui (Radix UI), Framer Motion |
| **Backend** | Next.js API Routes, Prisma ORM v7 |
| **Adatbazis** | MySQL 8.4 (Docker) |
| **Auth** | NextAuth.js v5 (Auth.js) - credentials + OIDC (Authentik) |
| **Storage** | MinIO (S3-kompatibilis, Docker container) |
| **E-konyv** | EPUB.js (bongeszos olvasas), Calibre CLI (konverzio) |
| **i18n** | next-intl v4 (magyar + angol) |
| **Allapotkezeles** | Zustand |
| **Validacio** | Zod v4 + React Hook Form |
| **Teszteles** | Vitest (4 unit) + Playwright (22 E2E) |
| **Infra** | Docker Compose (4 service) |

---

## Elofeltetelek

- **Docker** + Docker Compose v2
- **Node.js 22+** (fejleszteshez)

---

## Gyorsinditas

### 1. Docker Compose (ajanlott)

```bash
git clone <repo-url>
cd ebookespolc
cp .env.example .env

# Szerkeszd a .env fajlt - csereld ki a jelszavakat!
# nano .env

# Inditas (elso alkalommal ~3-5 perc a build)
docker compose up -d

# Megnyitas: http://localhost:3000
```

Az adatbazis tabla automatikusan letrejon az elso indulaskor (`docker-entrypoint.sh`).

### 2. Alapertelmezett admin felhasznalo

Az elso indulaskor automatikusan letrejon egy admin felhasznalo:

| | |
|---|---|
| **Email** | `demo@demo.hu` |
| **Jelszo** | `Demo123!` |

> **FONTOS**: Production-ben valtoztasd meg a jelszot vagy hozz letre sajat admin fiokot es torold a demo-t!

### 3. Fejlesztoi mod (hot-reload)

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

---

## Docker szolgaltatasok

| Service | Port | Leiras | Healthcheck |
|---------|------|--------|-------------|
| `app` | 3000 | Next.js alkalmazas | `wget /api/health` |
| `db` | 3306 | MySQL 8.4 adatbazis | `mysqladmin ping` |
| `minio` | 9000 / 9001 | Fajl storage (API / konzol) | `mc ready local` |
| `calibre` | 8080 | E-konyv konverzio szerver | `GET /health` |

```bash
docker compose up -d            # Inditas
docker compose down             # Leallitas
docker compose logs -f app      # Log kovetes
docker compose restart app      # App ujrainditas
```

---

## Production deployment

```
                    ┌─────────────┐
   HTTPS (443)      │   Reverse   │
  ─────────────────>│   Proxy     │
                    │  (NPM/nginx)│
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

Production-ben allitsd be a `.env` fajlban:
- `NEXTAUTH_SECRET` — generalas: `openssl rand -base64 32`
- `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` — eros jelszavak
- `MINIO_ROOT_PASSWORD` — eros jelszo
- `NEXTAUTH_URL` — a domain (pl. `https://yourdomain.com`)
- `MINIO_PUBLIC_ENDPOINT` — a domain

**Architektura jellemzok:**
- Ket halozat: `frontend` (publikus) + `backend` (internal, nem elerheto kivulrol)
- Memory limitek: app 512MB, calibre 1GB
- JSON log driver (max 10MB x 5 fajl / container)
- MySQL: `--mysql-native-password=ON` a kompatibilitashoz
- Reverse proxy (pl. nginx, Caddy, NPM) szukseges HTTPS-hez

---

## Kornyezeti valtozok

| Valtozo | Alapertelmezett | Leiras |
|---------|-----------------|--------|
| `DATABASE_URL` | - | MySQL connection string |
| `NEXTAUTH_SECRET` | - | Auth titkositasi kulcs (min 32 char!) |
| `NEXTAUTH_URL` | `http://localhost:3000` | Alkalmazas publikus URL-je |
| `AUTH_TRUST_HOST` | `true` | Reverse proxy mogott `true` kell |
| `MINIO_ENDPOINT` | `localhost` | MinIO szerver cime |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO hozzaferesi kulcs |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO titkos kulcs |
| `MINIO_BUCKET_EBOOKS` | `ebooks` | E-konyv bucket neve |
| `MINIO_BUCKET_COVERS` | `covers` | Boritokep bucket neve |
| `MINIO_USE_SSL` | `false` | SSL hasznalata MinIO-hoz |
| `CALIBRE_SERVICE_URL` | `http://localhost:8080` | Calibre konverzios szerver |

> **FONTOS**: Production-ben MINDIG csereld le a titkos kulcsokat!
> Generalas: `openssl rand -base64 32`

### Opcionalis valtozok (admin panelrol is allithato)

Az alabbi beallitasok a DB `Setting` tablajabol toltoednek, es az admin panelen modosithatok:
- **OIDC**: `oidc_enabled`, `oidc_issuer`, `oidc_client_id`, `oidc_client_secret`, `oidc_only`
- **SMTP**: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`
- **Toggle-ok**: `email_verification_enabled`, `registration_enabled`

---

## Projekt struktura

```
ebookespolc/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Login, register, verify-email
│   │   ├── (main)/             # Fooeldalak (17 oldal)
│   │   │   ├── library/        # Konyvtar (polc/racs nezet)
│   │   │   ├── book/[id]/      # Konyv reszletek
│   │   │   ├── reader/[id]/    # EPUB olvaso
│   │   │   ├── admin/          # Admin vezerlopult (7 tab)
│   │   │   ├── profile/        # Felhasznaloi profil
│   │   │   ├── shelves/        # Egyeni polcok
│   │   │   ├── upload/         # Konyv feltoltes (single + bulk)
│   │   │   ├── discover/       # Felfedezoes oldal
│   │   │   ├── activity/       # Tevekenyseegi hirfolyam
│   │   │   ├── topics/         # Temak
│   │   │   ├── stats/          # Statisztikak
│   │   │   └── user/[id]/      # Publikus profil
│   │   ├── (reader)/           # Olvaso layout (kulon)
│   │   └── api/                # REST API (~40 endpoint)
│   │       ├── auth/           # Register, verify-email
│   │       ├── books/          # CRUD, upload, convert, download, cover
│   │       ├── admin/          # Stats, users, books, backup, settings
│   │       ├── shelves/        # Polc CRUD + konyv hozzaadas
│   │       ├── bookmarks/      # Konyvjelzo CRUD
│   │       ├── user/           # Profil, reader-settings, follow
│   │       ├── categories/     # Kategoria GET/POST
│   │       ├── topics/         # Tema CRUD
│   │       ├── activity/       # Hirfolyam
│   │       ├── comments/       # Komment CRUD
│   │       └── health/         # Docker healthcheck
│   ├── components/             # React komponensek
│   │   ├── ui/                 # shadcn/ui bazis komponensek
│   │   ├── bookshelf/          # BookSpine, ShelfScene, BookCover
│   │   ├── reader/             # EpubReader (fo olvaso)
│   │   ├── layout/             # Header, Footer
│   │   └── auth/               # Login/Register form-ok
│   ├── lib/                    # Segedi konyvtarak
│   │   ├── auth.ts             # NextAuth config + brute-force vedelem
│   │   ├── prisma.ts           # Prisma client singleton
│   │   ├── storage/minio.ts    # MinIO S3 kliens
│   │   ├── rate-limit.ts       # In-memory rate limiter (7 preset)
│   │   ├── csrf.ts             # CSRF Origin/Host validacio
│   │   ├── security-logger.ts  # Strukturalt JSON security logging
│   │   ├── email.ts            # SMTP email kuldes
│   │   ├── backup/             # Admin backup & restore szolgaltatas
│   │   └── ebook/              # EPUB parser, Calibre kliens, cover utils
│   ├── hooks/                  # Custom React hook-ok
│   ├── store/                  # Zustand store-ok
│   ├── i18n/                   # next-intl konfig
│   └── types/                  # TypeScript tipusok
├── prisma/
│   ├── schema.prisma           # Adatbazis sema (23 tabla)
│   ├── init.sql                # Auto-generalt create script
│   └── seed.ts                 # Demo adat betoltes
├── messages/                   # Forditasok
│   ├── hu.json                 # Magyar (~350+ kulcs)
│   └── en.json                 # Angol
├── tests/
│   ├── unit/                   # Vitest unit tesztek (4 fajl)
│   └── e2e/                    # Playwright E2E tesztek (22 fajl)
├── docker/
│   └── calibre/                # Calibre konverzios szerver (Python)
├── docker-compose.yml          # Docker Compose (unified)
├── Dockerfile                  # Multi-stage build (4 stage)
└── docker-entrypoint.sh        # Auto DB init + migration
```

---

## Adatbazis sema (23 tabla)

```
User ─────┬── Book ────────┬── ReadingProgress
          │                ├── Bookmark
          ├── Account      ├── Highlight
          ├── Session      ├── Review
          ├── Shelf ──── ShelfBook
          ├── Follow       ├── Like
          ├── Activity     ├── SharedLink
          ├── Comment      ├── Comment
          ├── Notification ├── BookCategory ── Category
          └── ReadingGoal  └── BookTopic ──── Topic

Kulon: Setting, VerificationToken
```

---

## Teszteles

```bash
# Unit tesztek (Vitest)
npm run test:run

# E2E tesztek (Playwright)
npm run test:e2e

# E2E interaktiv UI moddal
npm run test:e2e:ui

# Osszes teszt (CI)
npm run test:run && npm run test:e2e
```

| Tipus | Darabszam | Framework |
|-------|-----------|-----------|
| Unit / Integration | 4 fajl | Vitest + React Testing Library |
| E2E | 22 fajl | Playwright (Chromium) |

---

## Biztonsag

### Implementalt vedelmi retegek

- **Autentikaacio**: NextAuth.js v5 (JWT session, 7 napos lejacat)
- **OIDC**: Authentik integraciol (admin panelrol konfiguralhato)
- **CSRF**: Origin/Host validacio minden mutatoo (PUT/POST/DELETE) endpointon
- **Rate limiting**: In-memory, 7 preset (auth: 10/15perc, API: 60/perc, public: 30/perc)
- **Brute-force vedelem**: 5 probalkozas utan 15 perces zarolasa (email-enkent)
- **CSP**: Restriktiv Content-Security-Policy (script, style, img, connect, frame-ancestors)
- **Security headerek**: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP
- **EPUB ZIP bomb vedelem**: Max 5000 fajl, gyanius ratio detektalas
- **SSRF vedelem**: Privat IP ellenorzes cover letoltesnel (redirect utan is)
- **Magic bytes validacio**: 8 formatum (EPUB, PDF, MOBI, AZW3, FB2, CBR, DOCX, RTF)
- **Stale JWT invalidalas**: 5 percenkent DB ellenorzes, torolt user token elorvenytelenites
- **Middleware route vedelem**: 14 vedett route pattern
- **Input validacio**: Zod v4 minden API endpointon

### Audit eredmeny (2026-02-23)

Teljes biztonsagi audit:
- **15/15 input validacios teszt PASS** (SQLi, XSS, path traversal, XXE)
- **Osszes vedett endpoint** helyesen 401-et ad auth nelkul
- **CORS**: deny-all policy (nincs cross-origin hozzaferes)
- **Osszertekeles**: **A-**

---

## API veegpontok (foobbek)

| Metodus | Utvonal | Leiras |
|---------|---------|--------|
| `GET` | `/api/books` | Konyvek listazasa (auth) |
| `POST` | `/api/books/upload` | Konyv feltoltes |
| `GET` | `/api/books/[id]` | Konyv reszletek |
| `GET` | `/api/books/[id]/download` | EPUB letoltes (proxy) |
| `GET` | `/api/books/[id]/cover` | Boritokep (proxy) |
| `POST` | `/api/books/[id]/convert` | PDF/MOBI konverzio inditasa |
| `GET` | `/api/categories` | Kategoriak (publikus) |
| `GET` | `/api/topics` | Temak (publikus) |
| `GET/PUT` | `/api/user/profile` | Profil lekeres/modositas |
| `GET/POST` | `/api/shelves` | Polcok CRUD |
| `POST` | `/api/auth/register` | Regisztracio |
| `GET` | `/api/admin/stats` | Admin statisztikak |
| `GET/POST` | `/api/admin/backup` | Biztonsagi mentes |
| `POST` | `/api/admin/backup/restore` | Visszaallitas |
| `GET/PUT` | `/api/admin/settings` | Admin beallitasok |
| `GET` | `/api/health` | Docker healthcheck |

---

## Oldalak (17 db)

| Utvonal | Leiras | Auth |
|---------|--------|------|
| `/` | Fooldal | Nem |
| `/login` | Bejelentkezes | Nem |
| `/register` | Regisztracio | Nem |
| `/library` | Konyvtar (polc/racs) | Igen |
| `/upload` | Konyv feltoltes | Igen |
| `/book/[id]` | Konyv reszletek | Igen |
| `/reader/[id]` | EPUB olvaso | Igen |
| `/shelves` | Sajat polcok | Igen |
| `/shelves/[id]` | Polc tartalma | Igen |
| `/profile` | Profil beallitasok | Igen |
| `/user/[id]` | Publikus felhasznaloi profil | Igen |
| `/topics` | Temak | Igen |
| `/stats` | Olvasasi statisztikak | Igen |
| `/discover` | Felfedezoes | Igen |
| `/activity` | Tevekenyseegi hirfolyam | Igen |
| `/shared/[token]` | Megosztott konyv | Nem* |
| `/admin` | Admin vezerlopult | Admin |

---

## Hasznos parancsok

```bash
# Fejlesztes
npm run dev                              # Dev szerver
npm run build                            # Production build
npx prisma studio                        # Adatbazis bongeszes
npx prisma db push                       # Sema szinkronizalas
npm run db:seed                          # Demo adatok

# Docker
docker compose up -d                     # Inditas
docker compose down                      # Leallitas
docker compose logs -f app               # Log kovetes
docker compose build --no-cache app      # Teljes ujraepites

# Teszteles
npm run test:run                         # Unit tesztek
npm run test:e2e                         # E2E tesztek
npx tsc --noEmit                         # TypeScript ellenorzes
```

---

## Verziotoerteenet

| Verzio | Datum | Ujdonsagok |
|--------|-------|------------|
| **v3.3** | 2026-02 | Admin backup & restore (ZIP), biztonsagi audit, email verifikacio toggle, regisztracio toggle, OIDC security fix |
| **v3.2** | 2026-02 | Kozossegi funkciok: Follow, Comment, Activity, Discover |
| **v3.1** | 2026-01 | Teljesitmeny (Blurhash, PWA, offline), annotaciok, 6 uj E2E teszt |
| **v3.0** | 2026-01 | Alapfunkciok: feltoltes, olvasas, polcok, kategoriak, temak, admin, i18n |

---

## Kozremukodes

Ez egy kozossegi (nem kereskedelmi) projekt. Minden hozzajarulas szivesen fogadott!

## Licenc

Privat projekt - minden jog fenntartva.
