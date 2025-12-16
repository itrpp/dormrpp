/**
 * Type definitions สำหรับ Active Directory User
 */

export interface ActiveDirectoryUser {
  username: string;
  displayName: string;
  email?: string;
  distinguishedName: string;
  memberOf: string[];
}

