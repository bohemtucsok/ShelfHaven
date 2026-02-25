import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcryptjs from "bcryptjs";
import { logSecurityEvent } from "@/lib/security-logger";
import { getGravatarUrl } from "@/lib/gravatar";
import { checkRateLimit, AUTH_LIMIT } from "@/lib/rate-limit";
import { type NextRequest } from "next/server";

// Brute-force protection: track failed login attempts per email
const loginAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// OIDC config types and DB loader
// ---------------------------------------------------------------------------

interface OidcConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  oidcOnly: boolean;
}

async function loadOidcSettings(): Promise<OidcConfig | null> {
  try {
    const keys = [
      "oidc_enabled",
      "oidc_issuer",
      "oidc_client_id",
      "oidc_client_secret",
      "oidc_only",
    ];
    const rows = await prisma.setting.findMany({
      where: { key: { in: keys } },
    });

    const map = new Map(rows.map((r) => [r.key, r.value]));

    if (map.get("oidc_enabled") !== "true") return null;

    const issuer = map.get("oidc_issuer");
    const clientId = map.get("oidc_client_id");
    const clientSecret = map.get("oidc_client_secret");

    if (!issuer || !clientId || !clientSecret) return null;

    return {
      enabled: true,
      issuer,
      clientId,
      clientSecret,
      oidcOnly: map.get("oidc_only") === "true",
    };
  } catch (e) {
    // DB may not be ready yet during build / initial bootstrap
    console.error("[auth] Failed to load OIDC settings:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build the NextAuth config dynamically
// ---------------------------------------------------------------------------

function buildAuthConfig(oidcConfig: OidcConfig | null) {
  // Determine HTTPS from NEXTAUTH_URL/AUTH_URL (not NODE_ENV) — allows production builds on HTTP localhost
  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "";
  const isHttps = authUrl.startsWith("https://");

  // Build providers array - Credentials only included when NOT oidcOnly
  // This reduces attack surface: if oidcOnly, no brute-force target exists
  const providers: NonNullable<NextAuthConfig["providers"]> = [];

  if (!oidcConfig?.oidcOnly) {
    providers.push(Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Jelszo", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = (credentials.email as string).toLowerCase();
        const now = Date.now();

        // Check brute-force protection: block if too many failed attempts
        const attempts = loginAttempts.get(email);
        if (attempts && attempts.resetAt > now && attempts.count >= MAX_LOGIN_ATTEMPTS) {
          logSecurityEvent("LOGIN_BLOCKED", { email, details: `blocked_after_${attempts.count}_attempts` });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          // Record failed attempt
          const current = loginAttempts.get(email);
          if (!current || current.resetAt < now) {
            loginAttempts.set(email, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
          } else {
            current.count++;
          }
          logSecurityEvent("LOGIN_FAILED", { email, details: "user_not_found" });
          return null;
        }

        const isPasswordValid = await bcryptjs.compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          // Record failed attempt
          const current = loginAttempts.get(email);
          if (!current || current.resetAt < now) {
            loginAttempts.set(email, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
          } else {
            current.count++;
          }
          logSecurityEvent("LOGIN_FAILED", { email, details: "wrong_password" });
          return null;
        }

        // Successful login - clear failed attempts
        loginAttempts.delete(email);

        // Warn about unverified email (don't block - existing users may not be verified)
        if (!user.emailVerified) {
          logSecurityEvent("LOGIN_SUCCESS", { email, details: "email_not_verified" });
        } else {
          logSecurityEvent("LOGIN_SUCCESS", { email });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }));
  }

  // Add OIDC (Authentik) provider if configured
  if (oidcConfig) {
    // Dynamic import not needed – we just declare the provider object directly.
    // NextAuth v5 supports inline OIDC providers:
    providers.push({
      id: "authentik",
      name: "Authentik",
      type: "oidc",
      issuer: oidcConfig.issuer,
      clientId: oidcConfig.clientId,
      clientSecret: oidcConfig.clientSecret,
      // Allow linking OIDC account to existing user with same email.
      // Safe because Authentik is a trusted, admin-controlled IdP.
      allowDangerousEmailAccountLinking: true,
    });
  }

  return {
    // Explicit secret: NextAuth v5 reads AUTH_SECRET first, fallback to NEXTAUTH_SECRET
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    adapter: PrismaAdapter(prisma),
    trustHost: true,
    jwt: {
      maxAge: 24 * 60 * 60, // 1 day (absolute max lifetime of a JWT token)
    },
    session: {
      strategy: "jwt" as const,
      maxAge: 24 * 60 * 60, // 1 day
    },
    cookies: {
      sessionToken: {
        name: isHttps ? "__Secure-authjs.session-token" : "authjs.session-token",
        options: {
          httpOnly: true,
          sameSite: "lax" as const,
          path: "/",
          secure: isHttps,
          // No maxAge → session cookie → deleted when browser closes
        },
      },
    },
    pages: {
      signIn: "/login",
    },
    providers,
    callbacks: {
      async session({ session, token }: { session: any; token: any }) {
        if (token.sub && session.user) {
          session.user.id = token.sub;
          session.user.role = (token.role as "USER" | "ADMIN") || "USER";
          session.user.language = (token.language as string) || "hu";
          session.user.theme = (token.theme as string) || "system";
          session.user.defaultView = (token.defaultView as string) || "shelf";
          // Pre-compute Gravatar URL server-side (avoids custom MD5 on client)
          if (token.email && !session.user.image) {
            session.user.image = getGravatarUrl(token.email as string);
          }
        }
        return session;
      },
      async jwt({ token, user }: { token: any; user?: any; account?: any }) {
        if (user) {
          // Initial login - set user data
          token.sub = user.id;
          token.lastVerified = Date.now();

          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: user.id },
              select: { role: true, language: true, theme: true, defaultView: true },
            });
            token.role = dbUser?.role || "USER";
            token.language = dbUser?.language || "hu";
            token.theme = dbUser?.theme || "system";
            token.defaultView = dbUser?.defaultView || "shelf";
          } catch (e) {
            console.error("[auth] jwt callback DB error:", e);
            token.role = "USER";
            token.language = "hu";
            token.theme = "system";
          }
        } else if (token.sub) {
          // Subsequent requests - periodically verify user still exists in DB
          // (handles DB wipe / user deletion while old JWT cookie persists)
          const lastVerified = (token.lastVerified as number) || 0;
          const VERIFY_INTERVAL = 5 * 60 * 1000; // 5 minutes

          if (Date.now() - lastVerified > VERIFY_INTERVAL) {
            try {
              const exists = await prisma.user.findUnique({
                where: { id: token.sub as string },
                select: { id: true },
              });
              if (!exists) {
                console.warn("[auth] User no longer exists in DB, invalidating token:", token.sub);
                // Return empty token - NextAuth will set a new cookie without sub
                // Next middleware check will see no sub → redirect to login
                return {} as typeof token;
              }
              token.lastVerified = Date.now();
            } catch (e) {
              // DB error - don't invalidate, just skip this verification
              console.error("[auth] user verification error:", e);
            }
          }
        }
        return token;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Lazy singleton with manual refresh
// ---------------------------------------------------------------------------

type AuthInstance = ReturnType<typeof NextAuth>;
let _auth: AuthInstance | null = null;
let _authPromise: Promise<AuthInstance> | null = null;

async function getInstance(): Promise<AuthInstance> {
  if (_auth) return _auth;

  // Avoid concurrent initialization
  if (_authPromise) return _authPromise;

  _authPromise = (async () => {
    const oidc = await loadOidcSettings();
    const instance = NextAuth(buildAuthConfig(oidc));
    _auth = instance;
    _authPromise = null;
    return instance;
  })();

  return _authPromise;
}

/**
 * Force re-initialization of the NextAuth instance.
 * Call after admin saves OIDC settings.
 */
export function refreshAuthInstance() {
  _auth = null;
  _authPromise = null;
}

// ---------------------------------------------------------------------------
// Wrapper exports maintaining the same API as before
// ---------------------------------------------------------------------------

// `auth()` - get session (used in Server Components, API routes, admin helper)
export async function auth(...args: any[]) {
  const inst = await getInstance();
  return (inst.auth as any)(...args);
}

// Strip Max-Age and Expires from session-token cookie so it becomes a true
// session cookie (deleted when the browser closes).  Auth.js v5 forces
// expires based on session.maxAge; we undo that here after the response.
function stripSessionCookieExpiry(response: Response): Response {
  const setCookies = (response.headers as any).getSetCookie?.() as
    | string[]
    | undefined;
  if (!setCookies || setCookies.length === 0) return response;

  const newHeaders = new Headers(response.headers);
  newHeaders.delete("set-cookie");

  for (const cookie of setCookies) {
    if (cookie.includes("authjs.session-token")) {
      const cleaned = cookie
        .split(";")
        .filter((part) => {
          const key = part.trim().toLowerCase();
          return !key.startsWith("max-age") && !key.startsWith("expires");
        })
        .join(";");
      newHeaders.append("set-cookie", cleaned);
    } else {
      newHeaders.append("set-cookie", cookie);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// `handlers` - used in [...nextauth]/route.ts as { GET, POST }
export const handlers = {
  GET: async (req: NextRequest) => {
    const inst = await getInstance();
    const res = await inst.handlers.GET(req);
    return stripSessionCookieExpiry(res);
  },
  POST: async (req: NextRequest) => {
    // Rate limit login/callback POST requests (10 per 15 min per IP)
    if (req.nextUrl.pathname.includes("/callback/")) {
      const limited = checkRateLimit(req, "auth", AUTH_LIMIT);
      if (limited) return limited;
    }
    const inst = await getInstance();
    const res = await inst.handlers.POST(req);
    return stripSessionCookieExpiry(res);
  },
};

// `signIn` / `signOut` - used in server actions
export async function signIn(...args: any[]) {
  const inst = await getInstance();
  return (inst.signIn as any)(...args);
}

export async function signOut(...args: any[]) {
  const inst = await getInstance();
  return (inst.signOut as any)(...args);
}
