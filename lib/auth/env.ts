/**
 * Environment Variables Validation สำหรับ LDAP Configuration
 */

interface RequiredEnvVars {
  LDAP_URL: string;
  LDAP_BASE_DN: string;
  LDAP_BIND_DN: string;
  LDAP_BIND_PASSWORD: string;
}

interface OptionalEnvVars {
  LDAP_SEARCH_FILTER?: string;
  LDAP_TIMEOUT?: string;
  LDAP_CONNECT_TIMEOUT?: string;
  LDAP_IDLE_TIMEOUT?: string;
  LDAP_RECONNECT?: string;
}

/**
 * ตรวจสอบและดึง environment variables ที่จำเป็นสำหรับ LDAP
 * @returns Object ที่มี required และ optional environment variables
 * @throws Error ถ้า required environment variables ไม่ครบ
 */
export function validateEnvironment(): {
  required: RequiredEnvVars;
  optional: OptionalEnvVars;
} {
  // Required environment variables
  const required: RequiredEnvVars = {
    LDAP_URL: process.env.LDAP_URL || process.env.AD_SERVER || 'ldaps://192.168.238.8',
    LDAP_BASE_DN: process.env.LDAP_BASE_DN || process.env.AD_BASE_DN || 'DC=rpphosp,DC=local',
    LDAP_BIND_DN: process.env.LDAP_BIND_DN || process.env.AD_ADMIN_DN || 'ldaprpp@rpphosp.local',
    LDAP_BIND_PASSWORD: process.env.LDAP_BIND_PASSWORD || process.env.AD_ADMIN_PASSWORD || 'rpp14641',
  };

  // Optional environment variables
  const optional: OptionalEnvVars = {
    LDAP_SEARCH_FILTER: process.env.LDAP_SEARCH_FILTER,
    LDAP_TIMEOUT: process.env.LDAP_TIMEOUT,
    LDAP_CONNECT_TIMEOUT: process.env.LDAP_CONNECT_TIMEOUT,
    LDAP_IDLE_TIMEOUT: process.env.LDAP_IDLE_TIMEOUT,
    LDAP_RECONNECT: process.env.LDAP_RECONNECT,
  };

  // ตรวจสอบว่าค่าที่ required ไม่ว่าง
  const missingVars: string[] = [];
  
  if (!required.LDAP_URL || required.LDAP_URL.trim() === '') {
    missingVars.push('LDAP_URL หรือ AD_SERVER');
  }
  
  if (!required.LDAP_BASE_DN || required.LDAP_BASE_DN.trim() === '') {
    missingVars.push('LDAP_BASE_DN หรือ AD_BASE_DN');
  }
  
  if (!required.LDAP_BIND_DN || required.LDAP_BIND_DN.trim() === '') {
    missingVars.push('LDAP_BIND_DN หรือ AD_ADMIN_DN');
  }
  
  if (!required.LDAP_BIND_PASSWORD || required.LDAP_BIND_PASSWORD.trim() === '') {
    missingVars.push('LDAP_BIND_PASSWORD หรือ AD_ADMIN_PASSWORD');
  }

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required LDAP environment variables: ${missingVars.join(', ')}`
    );
  }

  // Trim all string values
  required.LDAP_URL = required.LDAP_URL.trim();
  required.LDAP_BASE_DN = required.LDAP_BASE_DN.trim();
  required.LDAP_BIND_DN = required.LDAP_BIND_DN.trim();
  required.LDAP_BIND_PASSWORD = required.LDAP_BIND_PASSWORD.trim();

  return { required, optional };
}


