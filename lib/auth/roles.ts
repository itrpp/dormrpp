import type { ActiveDirectoryUser } from './active-directory';

/**
 * User roles ที่มีในระบบ
 */
export type UserRole = 'admin' | 'superUser' | 'regular';

/**
 * Safe utility function สำหรับแปลง string เป็น lowercase
 * ป้องกัน error เมื่อค่าที่ส่งเข้ามาเป็น undefined หรือ null
 * @param value - ค่าที่ต้องการแปลง
 * @returns string ที่เป็น lowercase หรือ empty string ถ้า value ไม่ใช่ string
 */
function safeLower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * Safe utility function สำหรับ trim string
 * @param value - ค่าที่ต้องการ trim
 * @returns string ที่ trim แล้ว หรือ empty string ถ้า value ไม่ใช่ string
 */
function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Safe utility function สำหรับแปลง string เป็น lowercase และ trim
 * @param value - ค่าที่ต้องการแปลง
 * @returns string ที่เป็น lowercase และ trim แล้ว หรือ empty string ถ้า value ไม่ใช่ string
 */
function safeLowerTrim(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

/**
 * AD Group paths ที่ใช้สำหรับกำหนด role
 */
const AD_GROUP_PATHS = {
  ADMIN: 'CN=manage Ad_admin,CN=User,DC=rpphosp,DC=local',
  IT: 'CN=manage Ad_it,CN=Users-RPP,DC=rpphosp,DC=local',
  USER: 'CN=DromRpp,CN=Users-RPP,DC=rpphosp,DC=local',
} as const;

/**
 * Group ที่อนุญาตให้เข้าถึงระบบได้ (เฉพาะ group นี้เท่านั้น)
 */
export const ALLOWED_GROUP_DN = 'CN=DromRpp,CN=Users-RPP,DC=rpphosp,DC=local';

/**
 * Group names ที่ใช้สำหรับตรวจสอบ (เพื่อรองรับ format ที่แตกต่างกัน)
 */
const GROUP_NAMES = {
  ADMIN: ['manage Ad_admin', 'Ad_admin', 'manageAd_admin'],
  IT: ['manage Ad_it', 'Ad_it', 'manageAd_it'],
  USER: ['DromRpp'],
} as const;

/**
 * ตรวจสอบว่า user เป็น member ของ AD Group หรือไม่
 * @param user - ข้อมูลผู้ใช้จาก Active Directory
 * @param groupDn - Distinguished Name ของ group ที่ต้องการตรวจสอบ
 * @param groupNames - Array ของ group names ที่ใช้สำหรับตรวจสอบ
 * @returns true ถ้า user เป็น member ของ group, false ถ้าไม่
 */
function isMemberOfGroup(
  user: ActiveDirectoryUser, 
  groupDn: string,
  groupNames: readonly string[]
): boolean {
  try {
    if (!user || !user.memberOf || user.memberOf.length === 0) {
      return false;
    }

    // ตรวจสอบว่า groupDn เป็น string และไม่ว่าง
    if (!groupDn || typeof groupDn !== 'string' || groupDn.trim() === '') {
      return false;
    }

    // ตรวจสอบว่า memberOf array มี groupDn หรือไม่
    // ใช้ case-insensitive comparison เพื่อความปลอดภัย
    // ใช้ safeLowerTrim เพื่อป้องกัน error เมื่อ groupDn เป็น undefined
    const normalizedGroupDn = safeLowerTrim(groupDn);
    if (!normalizedGroupDn) {
      return false;
    }
    
    // Extract CN name จาก groupDn
    let groupCnFromDn: string | null = null;
    try {
      const groupCnMatch = normalizedGroupDn.match(/cn=([^,]+)/i);
      if (groupCnMatch && 
          Array.isArray(groupCnMatch) && 
          groupCnMatch.length > 1 && 
          groupCnMatch[1] !== null && 
          groupCnMatch[1] !== undefined && 
          typeof groupCnMatch[1] === 'string' && 
          groupCnMatch[1].trim() !== '') {
        const cnValue = safeTrim(groupCnMatch[1]);
        if (cnValue) {
          groupCnFromDn = safeLower(cnValue);
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Role Debug] Error extracting CN from groupDn:', e);
      }
      groupCnFromDn = null;
    }
    
    // Normalize group names (กรองค่าที่ไม่ใช่ string ออก)
    const normalizedGroupNames: string[] = [];
    for (const name of groupNames) {
      if (name && typeof name === 'string' && name.trim() !== '') {
        const normalized = safeLowerTrim(name);
        if (normalized) {
          normalizedGroupNames.push(normalized);
        }
      }
    }
    
    // กรอง memberOf ให้เหลือเฉพาะ string ที่ไม่ว่าง
    const safeMemberOf = user.memberOf.filter((group): group is string => 
      group !== null && group !== undefined && typeof group === 'string' && group.trim() !== ''
    );
    
    return safeMemberOf.some((group) => {
      try {
        // ตรวจสอบว่า group เป็น string และไม่ว่าง (ตรวจสอบอีกครั้ง)
        if (!group || typeof group !== 'string' || group.trim() === '') {
          return false;
        }
        
        // ใช้ safeLowerTrim เพื่อป้องกัน error เมื่อ group เป็น undefined
        const normalizedMemberGroup = safeLowerTrim(group);
        if (!normalizedMemberGroup) {
          return false;
        }
        
        // 1. ตรวจสอบ full DN match (exact match)
        if (normalizedMemberGroup === normalizedGroupDn) {
          return true;
        }
        
        // 2. ตรวจสอบ CN name match (extract CN จาก memberOf และเปรียบเทียบ)
        let memberCn: string | null = null;
        try {
          const memberCnMatch = normalizedMemberGroup.match(/cn=([^,]+)/i);
          if (memberCnMatch && 
              Array.isArray(memberCnMatch) && 
              memberCnMatch.length > 1 && 
              memberCnMatch[1] !== null && 
              memberCnMatch[1] !== undefined && 
              typeof memberCnMatch[1] === 'string' && 
              memberCnMatch[1].trim() !== '') {
            const cnValue = safeTrim(memberCnMatch[1]);
            if (cnValue) {
              memberCn = safeLower(cnValue);
            }
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[Role Debug] Error extracting CN from member group:', e, 'group:', group);
          }
          memberCn = null;
        }
        
        if (memberCn) {
          // เปรียบเทียบกับ CN จาก groupDn
          if (groupCnFromDn && memberCn === groupCnFromDn) {
            return true;
          }
          
          // เปรียบเทียบกับ group names ที่กำหนดไว้
          for (const name of normalizedGroupNames) {
            if (name && (memberCn === name || memberCn.includes(name) || name.includes(memberCn))) {
              return true;
            }
          }
        }
        
        // 3. ตรวจสอบ partial match (กรณีที่ memberOf มี format ที่แตกต่าง)
        // ตรวจสอบว่ามี group name อยู่ใน memberOf หรือไม่
        for (const name of normalizedGroupNames) {
          if (name && normalizedMemberGroup.includes(name)) {
            return true;
          }
        }
        
        // 4. ตรวจสอบ reverse partial match
        if (normalizedMemberGroup.includes(normalizedGroupDn) || 
            normalizedGroupDn.includes(normalizedMemberGroup)) {
          return true;
        }
        
        return false;
      } catch (error) {
        // ถ้าเกิด error ในการตรวจสอบ group นี้ ให้ข้ามไป
        if (process.env.NODE_ENV === 'development') {
          console.error('[Role Debug] Error checking group:', error, 'group:', group);
        }
        return false;
      }
    });
  } catch (error) {
    // ถ้าเกิด error ในการตรวจสอบทั้งหมด ให้ return false
    if (process.env.NODE_ENV === 'development') {
      console.error('[Role Debug] Error in isMemberOfGroup:', error);
    }
    return false;
  }
}

/**
 * กำหนด role ของ user จาก AD Groups
 * ตามกฎ:
 * - manage Ad_admin → admin
 * - manage Ad_it → admin
 * - manage Ad_user → superUser
 * - อื่นๆ → regular user
 * 
 * @param user - ข้อมูลผู้ใช้จาก Active Directory
 * @returns role ของ user
 */
export function determineUserRole(user: ActiveDirectoryUser): UserRole {
  try {
    // ตรวจสอบว่า user มีข้อมูลครบถ้วน
    if (!user || typeof user !== 'object') {
      return 'regular';
    }
    
    // กรอง memberOf ให้เหลือเฉพาะ string ที่ไม่ว่าง
    // เพิ่มการตรวจสอบที่เข้มงวดมากขึ้น
    const safeMemberOf: string[] = [];
    if (user.memberOf && Array.isArray(user.memberOf)) {
      for (const group of user.memberOf) {
        if (group !== null && group !== undefined && typeof group === 'string' && group.trim() !== '') {
          safeMemberOf.push(group.trim());
        }
      }
    }
    
    // สร้าง user object ใหม่ที่มี memberOf ที่กรองแล้ว
    // Email ไม่ใช้เป็นเงื่อนไขในการตรวจสอบ authentication
    const safeUser: ActiveDirectoryUser = {
      username: user.username || '',
      displayName: user.displayName || '',
      email: user.email, // Email เป็น optional
      distinguishedName: user.distinguishedName || '',
      memberOf: safeMemberOf,
    };
    
    // Log memberOf สำหรับ debugging (เฉพาะใน development)
    if (process.env.NODE_ENV === 'development' && safeMemberOf.length > 0) {
      console.log('[Role Debug] User memberOf:', safeMemberOf);
    }
    
    // ตรวจสอบ admin groups (Ad_admin หรือ Ad_it)
    let isAdminGroup = false;
    try {
      isAdminGroup = isMemberOfGroup(safeUser, AD_GROUP_PATHS.ADMIN, GROUP_NAMES.ADMIN) ||
                     isMemberOfGroup(safeUser, AD_GROUP_PATHS.IT, GROUP_NAMES.IT);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Role Debug] Error checking admin groups:', error);
      }
    }
    
    if (isAdminGroup) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Role Debug] User assigned role: admin');
      }
      return 'admin';
    }

    // ตรวจสอบ superUser group (Ad_user)
    let isSuperUserGroup = false;
    try {
      isSuperUserGroup = isMemberOfGroup(safeUser, AD_GROUP_PATHS.USER, GROUP_NAMES.USER);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Role Debug] Error checking superUser group:', error);
      }
    }
    
    if (isSuperUserGroup) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Role Debug] User assigned role: superUser');
      }
      return 'superUser';
    }

    // default: regular user
    if (process.env.NODE_ENV === 'development') {
      console.log('[Role Debug] User assigned role: regular (default)');
    }
    return 'regular';
  } catch (error) {
    // ถ้าเกิด error ใดๆ ให้ return regular role
    if (process.env.NODE_ENV === 'development') {
      console.error('[Role Debug] Error in determineUserRole:', error);
    }
    return 'regular';
  }
}

/**
 * ตรวจสอบว่า user มี role ที่ต้องการหรือไม่
 * @param userRole - role ของ user
 * @param requiredRole - role ที่ต้องการ
 * @returns true ถ้า user มี role ที่ต้องการ, false ถ้าไม่
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  // Role hierarchy: admin > superUser > regular
  const roleHierarchy: Record<UserRole, number> = {
    admin: 3,
    superUser: 2,
    regular: 1,
  };

  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * ตรวจสอบว่า user เป็น admin หรือไม่
 * @param userRole - role ของ user
 * @returns true ถ้า user เป็น admin, false ถ้าไม่
 */
export function isAdmin(userRole: UserRole): boolean {
  return userRole === 'admin';
}

/**
 * ตรวจสอบว่า user เป็น superUser หรือไม่
 * @param userRole - role ของ user
 * @returns true ถ้า user เป็น superUser หรือ admin, false ถ้าไม่
 */
export function isSuperUser(userRole: UserRole): boolean {
  return userRole === 'superUser' || userRole === 'admin';
}

/**
 * ตรวจสอบว่า user เป็น regular user หรือไม่
 * @param userRole - role ของ user
 * @returns true ถ้า user เป็น regular user, false ถ้าไม่
 */
export function isRegularUser(userRole: UserRole): boolean {
  return userRole === 'regular';
}

/**
 * ตรวจสอบว่า user อยู่ใน allowed group หรือไม่
 * เฉพาะ user ที่อยู่ใน group 'CN=DromRpp,CN=Users-RPP,DC=rpphosp,DC=local' เท่านั้นที่สามารถใช้ระบบได้
 * @param user - ข้อมูลผู้ใช้จาก Active Directory
 * @returns true ถ้า user อยู่ใน allowed group, false ถ้าไม่
 */
export function isUserAllowed(user: ActiveDirectoryUser): boolean {
  try {
    if (!user || typeof user !== 'object') {
      if (process.env.NODE_ENV === 'development') {
        console.log('[isUserAllowed] User is invalid:', user);
      }
      return false;
    }

    // Log สำหรับ debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[isUserAllowed] Checking user:', {
        username: user.username,
        memberOf: user.memberOf,
        memberOfLength: user.memberOf?.length || 0,
      });
      console.log('[isUserAllowed] Allowed group DN:', ALLOWED_GROUP_DN);
      console.log('[isUserAllowed] Group names:', GROUP_NAMES.USER);
    }

    // ตรวจสอบว่า user อยู่ใน allowed group หรือไม่
    const result = isMemberOfGroup(user, ALLOWED_GROUP_DN, GROUP_NAMES.USER);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[isUserAllowed] Result:', result);
    }
    
    return result;
  } catch (error) {
    console.error('[isUserAllowed] Error checking allowed group:', error);
    return false;
  }
}

