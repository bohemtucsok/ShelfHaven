#!/bin/sh

echo "[entrypoint] Checking database schema..."

node -e "
const fs = require('fs');

async function run() {
  // Dynamic import for ESM module from standalone build
  const mariadb = require('mariadb');
  const url = new URL(process.env.DATABASE_URL);

  const pool = mariadb.createPool({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 1,
    connectTimeout: 60000,
    multipleStatements: true,
    ssl: { rejectUnauthorized: false },
  });

  // Wait for DB to be ready
  let conn;
  for (let i = 1; i <= 60; i++) {
    try {
      conn = await pool.getConnection();
      console.log('[entrypoint] Database connected');
      break;
    } catch (e) {
      console.log('[entrypoint] Waiting for database... (' + i + '/60): ' + e.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!conn) {
    console.log('[entrypoint] WARNING: Could not connect to database');
    await pool.end();
    return;
  }

  try {
    const tables = await conn.query('SHOW TABLES');
    if (tables.length === 0) {
      console.log('[entrypoint] No tables found. Creating schema...');
      const sql = fs.readFileSync('./prisma/init.sql', 'utf8');
      await conn.query(sql);
      console.log('[entrypoint] Database schema created successfully!');

      // Create default admin user on fresh install
      try {
        const bcryptjs = require('bcryptjs');
        const id = 'admin-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const hashedPassword = await bcryptjs.hash('Demo123!', 12);
        await conn.query(
          \"INSERT INTO \\\`User\\\` (\\\`id\\\`, \\\`email\\\`, \\\`name\\\`, \\\`password\\\`, \\\`role\\\`, \\\`emailVerified\\\`, \\\`language\\\`, \\\`theme\\\`, \\\`defaultView\\\`, \\\`createdAt\\\`, \\\`updatedAt\\\`) VALUES (?, ?, ?, ?, 'ADMIN', NOW(), 'hu', 'system', 'shelf', NOW(), NOW())\",
          [id, 'demo@demo.hu', 'Demo Admin', hashedPassword]
        );
        console.log('[entrypoint] Default admin created: demo@demo.hu / Demo123!');
      } catch (adminErr) {
        console.log('[entrypoint] Admin creation skipped: ' + adminErr.message);
      }
    } else {
      console.log('[entrypoint] Database OK (' + tables.length + ' tables found)');

      // Schema migrations for existing databases
      const migrations = [
        { col: 'defaultView', table: 'User', sql: \"ALTER TABLE \\\`User\\\` ADD COLUMN \\\`defaultView\\\` VARCHAR(191) NOT NULL DEFAULT 'shelf'\" },
      ];

      // Table-level migrations (create table if not exists)
      const tableMigrations = [
        { table: 'SavedBook', sql: \"CREATE TABLE IF NOT EXISTS \\\`SavedBook\\\` (\\\`userId\\\` VARCHAR(191) NOT NULL, \\\`bookId\\\` VARCHAR(191) NOT NULL, \\\`createdAt\\\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (\\\`userId\\\`, \\\`bookId\\\`), INDEX \\\`SavedBook_bookId_idx\\\` (\\\`bookId\\\`), CONSTRAINT \\\`SavedBook_userId_fkey\\\` FOREIGN KEY (\\\`userId\\\`) REFERENCES \\\`User\\\`(\\\`id\\\`) ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT \\\`SavedBook_bookId_fkey\\\` FOREIGN KEY (\\\`bookId\\\`) REFERENCES \\\`Book\\\`(\\\`id\\\`) ON DELETE CASCADE ON UPDATE CASCADE) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci\" },
      ];

      for (const tm of tableMigrations) {
        try {
          const tblCheck = await conn.query(
            'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            [tm.table]
          );
          if (Number(tblCheck[0].cnt) === 0) {
            await conn.query(tm.sql);
            console.log('[entrypoint] Migration: created table ' + tm.table);
          }
        } catch (e) {
          console.log('[entrypoint] Migration skip (table ' + tm.table + '): ' + e.message);
        }
      }

      for (const m of migrations) {
        try {
          const cols = await conn.query(
            'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [m.table, m.col]
          );
          const cnt = Number(cols[0].cnt);
          if (cnt === 0) {
            await conn.query(m.sql);
            console.log('[entrypoint] Migration: added ' + m.table + '.' + m.col);
          }
        } catch (e) {
          console.log('[entrypoint] Migration skip (' + m.table + '.' + m.col + '): ' + e.message);
        }
      }
    }
  } catch (err) {
    console.error('[entrypoint] WARNING: DB init error:', err.message);
  } finally {
    conn.release();
    await pool.end();
  }
}

run().then(() => process.exit(0)).catch(e => { console.error('[entrypoint] Error:', e.message); process.exit(0); });
"

echo "[entrypoint] Starting application..."
exec node server.js
