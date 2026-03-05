/**
 * Logic ร่วม: ดึงสมาชิก AD group DromRpp เข้า auth_users + auth_user_roles (USER)
 * ใช้ได้ทั้งจาก API และจากสคริปต์ cron (ไม่ต้อง login)
 */

import { createLDAPService } from '@/lib/auth/ldap';
import {
  ALLOWED_GROUP_DN,
  ALLOWED_GROUP_DN_FALLBACK,
} from '@/lib/auth/roles';
import { upsertAuthUser, ensureUserRoleForNewUser } from '@/lib/auth/app-roles';

export interface SyncAuthUsersResult {
  totalFromAd: number;
  processed: number;
  /** DN ที่ใช้ดึงสำเร็จ (กรณีมี fallback) */
  usedGroupDn?: string;
}

/**
 * ดึงผู้ใช้ทั้งหมดใน group DromRpp จาก AD แล้ว sync เข้า auth_users
 * และให้สิทธิ์ USER อัตโนมัติ (ไม่ต้องให้ user login ก่อน)
 * ลอง DN หลัก (OU=Users-RPP) ก่อน ถ้าได้ 0 คนจะลอง DN fallback (CN=Users-RPP)
 */
export async function runSyncAuthUsersFromAd(): Promise<SyncAuthUsersResult> {
  const ldapService = createLDAPService();

  try {
    let adUsers = await ldapService.getUsersInGroup(ALLOWED_GROUP_DN);
    let usedGroupDn = ALLOWED_GROUP_DN;

    if (!adUsers || adUsers.length === 0) {
      adUsers = await ldapService.getUsersInGroup(ALLOWED_GROUP_DN_FALLBACK);
      usedGroupDn = ALLOWED_GROUP_DN_FALLBACK;
    }

    let processed = 0;
    for (const user of adUsers) {
      if (!user.id || !user.name) continue;

      await upsertAuthUser(user.id, user.name, user.department || null);
      await ensureUserRoleForNewUser(user.id);
      processed += 1;
    }

    return {
      totalFromAd: adUsers.length,
      processed,
      usedGroupDn,
    };
  } finally {
    await ldapService.disconnect();
  }
}
