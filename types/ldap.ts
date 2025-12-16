/**
 * Type definitions สำหรับ LDAP Authentication
 */

export type LDAPErrorCode =
  | "MISSING_CREDENTIALS"
  | "USER_NOT_FOUND"
  | "ACCOUNT_DISABLED"
  | "USER_NOT_AUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "CONNECTION_ERROR"
  | "INTERNAL_ERROR";

export interface LDAPConfig {
  url: string;
  baseDN: string;
  bindDN: string;
  bindPassword: string;
  searchFilter: string;
  timeout: number;
  connectTimeout: number;
  idleTimeout: number;
  reconnect: boolean;
}

export interface LDAPUserData {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  groups: string;
  role: "admin" | "user";
}

export interface LDAPAuthResult {
  success: boolean;
  user?: LDAPUserData;
  errorCode?: LDAPErrorCode;
}

export interface LDAPSearchResult {
  objectName: string;
  attributes: Array<{
    type: string;
    values: string[];
  }>;
}

/**
 * Extended types สำหรับ NextAuth integration
 */
export interface ExtendedUser {
  id: string;
  name: string;
  email?: string;
  department?: string;
  title?: string;
  groups?: string;
  role?: "admin" | "user";
}

export interface ExtendedToken {
  sub?: string;
  department?: string;
  title?: string;
  groups?: string;
  role?: "admin" | "user";
  provider_type?: string;
  [key: string]: unknown;
}

export interface ExtendedSession {
  user: {
    id: string;
    name?: string;
    email?: string;
    department?: string;
    title?: string;
    groups?: string;
    role?: "admin" | "user";
    provider_type?: string;
  };
  [key: string]: unknown;
}

