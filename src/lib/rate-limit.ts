// Simple in-memory rate limiter using Map
// Suitable for single-instance deployments (Docker)

interface RateLimitConfig {
  interval: number; // window in ms
  maxRequests: number;
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Periodically clean up expired entries (every 60 seconds)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap) {
      if (value.resetAt < now) {
        rateLimitMap.delete(key);
      }
    }
  }, 60_000);
}

export function rateLimit(
  key: string,
  config: RateLimitConfig
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + config.interval });
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.interval,
    };
  }

  if (entry.count >= config.maxRequests) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// Helper to get client IP from request
// Behind trusted proxy (nginx/caddy), use rightmost non-private IP from X-Forwarded-For
// or first IP if all are public (single proxy setup)
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((ip) => ip.trim());
    // In single-proxy setups (nginx/caddy -> app), the first IP is the real client
    // Validate it looks like an IP to prevent spoofing with arbitrary strings
    const clientIp = ips[0];
    if (clientIp && /^[\d.:a-fA-F]+$/.test(clientIp)) {
      return clientIp;
    }
  }
  const real = request.headers.get("x-real-ip");
  if (real && /^[\d.:a-fA-F]+$/.test(real)) return real;
  return "unknown";
}

export const ADMIN_LIMIT = { interval: 60 * 1000, maxRequests: 100 }; // 100 per minute (admin)

// Pre-configured limiters
export const AUTH_LIMIT = { interval: 15 * 60 * 1000, maxRequests: 10 }; // 10 per 15 min
export const REGISTER_LIMIT = { interval: 60 * 60 * 1000, maxRequests: 20 }; // 20 per hour
export const UPLOAD_LIMIT = { interval: 60 * 60 * 1000, maxRequests: 50 }; // 50 per hour
export const API_LIMIT = { interval: 60 * 1000, maxRequests: 60 }; // 60 per minute
export const DOWNLOAD_LIMIT = { interval: 60 * 1000, maxRequests: 10 }; // 10 per minute
export const PROGRESS_LIMIT = { interval: 60 * 1000, maxRequests: 10 }; // 10 per minute
export const PUBLIC_LIMIT = { interval: 60 * 1000, maxRequests: 30 }; // 30 per minute (public GET)

// Rate limit configuration lookup (for admin display)
const LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  auth: AUTH_LIMIT,
  register: REGISTER_LIMIT,
  upload: UPLOAD_LIMIT,
  api: API_LIMIT,
  download: DOWNLOAD_LIMIT,
  progress: PROGRESS_LIMIT,
  public: PUBLIC_LIMIT,
  admin: ADMIN_LIMIT,
};

// Export rate limit stats for admin dashboard
export function getRateLimitStats(): {
  prefix: string;
  ip: string;
  count: number;
  maxRequests: number;
  resetAt: number;
}[] {
  const now = Date.now();
  const stats: { prefix: string; ip: string; count: number; maxRequests: number; resetAt: number }[] = [];
  for (const [key, value] of rateLimitMap) {
    if (value.resetAt < now) continue;
    const [prefix, ...ipParts] = key.split(":");
    const config = LIMIT_CONFIGS[prefix];
    stats.push({
      prefix,
      ip: ipParts.join(":"),
      count: value.count,
      maxRequests: config?.maxRequests ?? 0,
      resetAt: value.resetAt,
    });
  }
  return stats;
}

// Helper that returns a 429 Response if rate limited
export function checkRateLimit(
  request: Request,
  prefix: string,
  config: RateLimitConfig
): Response | null {
  const ip = getClientIp(request);
  const result = rateLimit(`${prefix}:${ip}`, config);

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: "Túl sok kérés, próbáld újra később" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(
            Math.ceil((result.resetAt - Date.now()) / 1000)
          ),
          "X-RateLimit-Limit": String(config.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        },
      }
    );
  }
  return null;
}
