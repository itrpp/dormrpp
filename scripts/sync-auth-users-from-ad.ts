/**
 * สคริปต์ sync ผู้ใช้จาก AD group DromRpp เข้า auth_users + auth_user_roles (USER)
 * รันได้จาก cron โดยไม่ต้อง login หรือเปิดเว็บ
 *
 * วิธีรัน:
 *   npm run sync:ad
 *
 * ตั้ง cron (เช่น ทุกชั่วโมง):
 *   0 * * * * cd /path/to/DormRpp && npm run sync:ad
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// โหลด .env.local ก่อน import ใด ๆ ที่ใช้ process.env
function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch (e) {
    console.warn('Could not load .env.local:', (e as Error).message);
  }
}

loadEnvLocal();

async function main() {
  const { runSyncAuthUsersFromAd } = await import('../lib/auth/sync-auth-users-from-ad');

  console.log('[sync:ad] เริ่มดึงผู้ใช้จาก AD group DromRpp...');
  try {
    const result = await runSyncAuthUsersFromAd();
    console.log(
      `[sync:ad] เสร็จ: ดึงจาก AD ${result.totalFromAd} รายการ, อัปเดตในระบบ ${result.processed} รายการ`
    );
    process.exit(0);
  } catch (err: any) {
    console.error('[sync:ad] ข้อผิดพลาด:', err?.message || err);
    process.exit(1);
  }
}

main();
