/**
 * Backfill script: Generate blurhash for existing books that have covers but no blurHash.
 *
 * Usage (from Docker container):
 *   npx tsx scripts/generate-blurhash.ts
 *
 * Or from host with Docker:
 *   docker compose exec app npx tsx scripts/generate-blurhash.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import sharp from "sharp";
import { encode } from "blurhash";

function createPrisma() {
  const url = new URL(process.env.DATABASE_URL!);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 5,
    allowPublicKeyRetrieval: true,
  });
  return new PrismaClient({ adapter });
}

const prisma = createPrisma();

async function generateBlurHash(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      4,
      3
    );
  } catch {
    return null;
  }
}

async function main() {
  const books = await prisma.book.findMany({
    where: {
      blurHash: null,
      coverUrl: { not: null },
    },
    select: {
      id: true,
      title: true,
      coverUrl: true,
    },
  });

  console.log(`Found ${books.length} books without blurhash`);

  let success = 0;
  let failed = 0;

  for (const book of books) {
    try {
      // Fetch cover from MinIO (internal URL)
      const res = await fetch(book.coverUrl!, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.warn(`  [SKIP] ${book.title} - HTTP ${res.status}`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const hash = await generateBlurHash(buffer);

      if (hash) {
        await prisma.book.update({
          where: { id: book.id },
          data: { blurHash: hash },
        });
        console.log(`  [OK] ${book.title} → ${hash.substring(0, 20)}...`);
        success++;
      } else {
        console.warn(`  [FAIL] ${book.title} - encoding failed`);
        failed++;
      }
    } catch (err) {
      console.error(`  [ERROR] ${book.title}:`, err);
      failed++;
    }
  }

  console.log(`\nDone: ${success} updated, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
