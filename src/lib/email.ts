import crypto from "crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

// Cache SMTP settings from DB for 60 seconds
let smtpCache: { settings: Record<string, string>; expiresAt: number } | null = null;

async function getSmtpSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (smtpCache && smtpCache.expiresAt > now) {
    return smtpCache.settings;
  }

  try {
    const rows = await prisma.setting.findMany({
      where: {
        key: {
          in: ["smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from"],
        },
      },
    });

    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    smtpCache = { settings, expiresAt: now + 60_000 };
    return settings;
  } catch {
    return {};
  }
}

// Create transporter: DB settings first, then env vars fallback
async function getTransporter() {
  const db = await getSmtpSettings();

  const host = db.smtp_host || process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(db.smtp_port || process.env.SMTP_PORT || "587"),
    secure: (db.smtp_secure || process.env.SMTP_SECURE) === "true",
    auth: {
      user: db.smtp_user || process.env.SMTP_USER,
      pass: db.smtp_pass || process.env.SMTP_PASS,
    },
  });
}

async function getFromAddress(): Promise<string> {
  const db = await getSmtpSettings();
  return db.smtp_from || process.env.SMTP_FROM || "ShelfHaven <noreply@shelfhaven.app>";
}

/**
 * Generate a secure verification token and store it in DB.
 */
export async function createVerificationToken(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });

  return token;
}

/**
 * Send verification email via SMTP or log to console in dev.
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

  const transporter = await getTransporter();

  if (!transporter) {
    console.log(`[EMAIL] Verification email for ${email}: ${verifyUrl}`);
    return;
  }

  const from = await getFromAddress();

  await transporter.sendMail({
    from,
    to: email,
    subject: "Email cim megerosites - ShelfHaven",
    html: emailTemplate(
      "Email cim megerosites",
      `<p>Koszonjuk a regisztraciot az ShelfHaven-on!</p>
       <p>Kattints az alanti gombra az email cimed megerositésehez:</p>
       <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background-color:#b45309;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:16px 0;">Email megerosites</a>
       <p style="color:#666;font-size:13px;margin-top:16px;">Ha nem te regisztraltál, hagyd figyelmen kivul ezt az emailt. A link 24 oraig ervenyes.</p>`
    ),
  });
}

/**
 * Send generic notification email.
 */
export async function sendNotificationEmail(
  email: string,
  subject: string,
  bodyHtml: string
): Promise<void> {
  const transporter = await getTransporter();

  if (!transporter) {
    console.log(`[EMAIL] Notification to ${email}: ${subject}`);
    return;
  }

  const from = await getFromAddress();

  await transporter.sendMail({
    from,
    to: email,
    subject,
    html: emailTemplate(subject, bodyHtml),
  });
}

/**
 * Test SMTP connection with given settings (used by admin panel).
 */
export async function testSmtpConnection(settings: Record<string, string>): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: parseInt(settings.smtp_port || "587"),
      secure: settings.smtp_secure === "true",
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_pass,
      },
    });
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Ismeretlen hiba" };
  }
}

/** Reusable HTML email wrapper */
function emailTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="hu">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#fef3c7;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#78350f,#92400e);padding:24px;text-align:center;">
      <h1 style="color:#fef3c7;margin:0;font-size:22px;">ShelfHaven</h1>
    </div>
    <div style="padding:32px 24px;">
      <h2 style="color:#78350f;margin:0 0 16px;font-size:18px;">${title}</h2>
      ${body}
    </div>
    <div style="padding:16px 24px;background:#fef9ee;text-align:center;font-size:12px;color:#92400e;">
      <p style="margin:0;">&copy; ${new Date().getFullYear()} ShelfHaven - shelfhaven.app</p>
    </div>
  </div>
</body>
</html>`;
}
