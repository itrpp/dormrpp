import type {
  LDAPConfig,
  LDAPUserData,
  LDAPAuthResult,
  LDAPSearchResult,
} from "@/types/ldap";

import { Client } from "ldapts";

import { validateEnvironment } from "@/lib/auth/env";

/**
 * LDAP Service Class สำหรับจัดการการเชื่อมต่อและ authentication
 */
export class LDAPService {
  private config: LDAPConfig;
  private client: Client | null = null;

  constructor(config: LDAPConfig) {
    this.config = config;
  }

  /**
   * สร้าง LDAP client connection
   */
  private async createClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    this.client = new Client({
      url: this.config.url,
      timeout: this.config.timeout,
      connectTimeout: this.config.connectTimeout,
      tlsOptions: {
        rejectUnauthorized: false, // ปิดการตรวจสอบ certificate สำหรับ self-signed certificates
      },
    });

    return this.client;
  }

  /**
   * ปิดการเชื่อมต่อ LDAP
   */
  private async closeClient(): Promise<void> {
    if (this.client) {
      try {
        await this.client.unbind();
      } catch (error) {
        console.warn("LDAP unbind warning:", error);
      }
      this.client = null;
    }
  }

  /**
   * ตรวจสอบว่า error เป็นปัญหาการเชื่อมต่อเครือข่ายหรือไม่
   */
  private isConnectionError(error: unknown): boolean {
    if (!error) return false;

    const messageRaw = (error as Error)?.message || "";
    const nameRaw = (error as Error)?.name || "";
    const message = messageRaw.toString();
    const name = nameRaw.toString();
    const lower = `${name} ${message}`.toLowerCase();

    // ครอบคลุมกรณี timeout, DNS, refuse, reset, unreachable และข้อผิดพลาดของ ldapts ที่เกี่ยวกับ network
    const networkKeywords = [
      "econnrefused",
      "etimedout",
      "econnreset",
      "ehostunreach",
      "enetunreach",
      "enotfound",
      "eai_again",
      "server down",
      "code 81", // LDAP serverDown
      "protocol error",
      "ldaperror: 81",
      "socket",
      "timeout",
      "timed out",
      "connect",
      "network",
      "client network socket disconnected",
    ];

    return networkKeywords.some((k) => lower.includes(k));
  }

  /**
   * ค้นหาผู้ใช้ใน LDAP Directory
   */
  private async searchUser(username: string): Promise<LDAPSearchResult | null> {
    const client = await this.createClient();

    try {
      // Bind ด้วย service account
      await client.bind(this.config.bindDN, this.config.bindPassword);

      // สร้าง search filter
      const searchFilter = this.config.searchFilter.replace(
        /{{username}}/g,
        username,
      );

      // ค้นหาผู้ใช้
      const { searchEntries } = await client.search(this.config.baseDN, {
        scope: "sub",
        filter: searchFilter,
      });

      if (searchEntries.length === 0) {
        return null;
      }

      // แปลงข้อมูลเป็นรูปแบบที่ต้องการ
      const entry = searchEntries[0];

      // console.log(entry);

      return {
        objectName: entry.dn,
        attributes: Object.entries(entry)
          .map(([type, values]) => {
            const toGuidString = (buf: Buffer): string => {
              // Active Directory GUID จัดเก็บแบบ little-endian ใน 3 กลุ่มแรก
              const h = (i: number) => buf[i]!.toString(16).padStart(2, "0");

              return `${h(3)}${h(2)}${h(1)}${h(0)}-${h(5)}${h(4)}-${h(7)}${h(6)}-${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`;
            };

            const convertValue = (val: unknown): string => {
              if (type === "objectGUID") {
                let buf: Buffer;
                if (Buffer.isBuffer(val)) {
                  buf = val;
                } else {
                  // Type guard สำหรับ Buffer.from()
                  if (typeof val === "string") {
                    buf = Buffer.from(val, "utf8");
                  } else if (val instanceof ArrayBuffer) {
                    buf = Buffer.from(val);
                  } else if (Array.isArray(val)) {
                    buf = Buffer.from(val);
                  } else {
                    // Fallback: แปลงเป็น string ก่อน
                    buf = Buffer.from(String(val), "utf8");
                  }
                }

                if (buf.length === 16) {
                  return toGuidString(buf);
                }
                // หากไม่ได้ความยาว 16 ไบต์ ให้ลองตีความจากสตริง hex ที่อาจถูกส่งมา
                const str = typeof val === "string" ? val : String(val);
                const cleaned = str.replace(/[^0-9a-fA-F]/g, "");

                if (cleaned.length === 32) {
                  const b = Buffer.from(cleaned, "hex");

                  return toGuidString(b);
                }

                return str;
              }

              if (Buffer.isBuffer(val)) {
                // สำหรับแอตทริบิวต์อื่น แปลงเป็น utf8 ปกติ
                return (val as Buffer).toString("utf8");
              }

              return typeof val === "string" ? val : String(val);
            };

            const convertedValues = Array.isArray(values)
              ? (values as unknown[]).map((v) => convertValue(v))
              : [convertValue(values)];

            return { type, values: convertedValues };
          })
          .filter((attr) => attr.type !== "dn"),
      };
    } catch (error) {
      console.error("LDAP search error:", error);

      // ถ้าเป็น error การเชื่อมต่อ ให้โยนต่อเพื่อให้ชั้นบนจัดการเป็นข้อความที่ถูกต้อง
      if (this.isConnectionError(error)) {
        throw new Error("LDAP_CONNECTION_ERROR");
      }

      // กรณีอื่น ๆ ให้ถือว่าไม่พบบัญชี (เช่น search ไม่อนุญาต/ไม่มีสิทธิ์)
      return null;
    }
  }

  /**
   * ทดสอบการ bind ด้วย user credentials
   */
  private async testUserBind(
    userDN: string,
    password: string,
  ): Promise<boolean> {
    const userClient = new Client({
      url: this.config.url,
      timeout: this.config.timeout,
      connectTimeout: this.config.connectTimeout,
      tlsOptions: {
        rejectUnauthorized: false, // ปิดการตรวจสอบ certificate สำหรับ self-signed certificates
      },
    });

    try {
      await userClient.bind(userDN, password);
      await userClient.unbind();

      return true;
    } catch (error) {
      console.error("User bind test failed:", error);

      return false;
    }
  }

  /**
   * ตรวจสอบว่า user account ถูก disable หรือไม่
   */
  private isAccountDisabled(
    attributes: Array<{ type: string; values: string[] }>,
  ): boolean {
    const userAccountControl = attributes.find(
      (a) => a.type === "userAccountControl",
    );

    if (!userAccountControl || !userAccountControl.values[0]) {
      return false; // ถ้าไม่มี userAccountControl ให้ผ่าน
    }

    const uac = parseInt(userAccountControl.values[0], 10);

    // ADS_UF_ACCOUNTDISABLE = 0x0002 (2 in decimal)
    return (uac & 2) === 2;
  }

  /**
   * ตรวจสอบว่า user อยู่ใน OU "rpp-user" หรือไม่
   */
  private isUserInRppUserOU(objectName: string): boolean {
    // ตรวจสอบว่า DN มี OU=rpp-user หรือไม่
    return /OU=rpp-user/i.test(objectName);
  }

  /**
   * แปลง LDAP search result เป็น user data
   */
  private parseUserData(
    searchResult: LDAPSearchResult,
  ): LDAPUserData {
    const { attributes } = searchResult;

    // Helper function สำหรับดึงค่า attribute
    const getAttribute = (attrName: string): string => {
      const attr = attributes.find((a) => a.type === attrName);

      return attr?.values[0] || "";
    };

    // Helper function สำหรับดึงค่าทั้งหมดของ attribute
    const getAttributeValues = (attrName: string): string[] => {
      const attr = attributes.find((a) => a.type === attrName);

      return attr?.values || [];
    };

    // ดึงข้อมูล groups
    const memberOfValues = getAttributeValues("memberOf");
    const groupsString = memberOfValues.join(";");

    // ตรวจสอบว่าเป็น admin หรือไม่
    const isAdmin = memberOfValues.some((dn: string) => {
      return (
        /(,|^)CN=(Domain Admins|Administrators)(,|$)/i.test(dn) ||
        /(Domain Admins|Administrators)/i.test(dn)
      );
    });

    return {
      id: getAttribute("objectGUID"),
      name: getAttribute("cn"),
      email: getAttribute("userPrincipalName"),
      department: getFirstOU(getAttribute("distinguishedName")) || "",
      title: getAttribute("title") || getAttribute("description") || "",
      groups: groupsString,
      role: isAdmin ? "admin" : "user",
    };
  }

  /**
   * Authenticate ผู้ใช้ผ่าน LDAP
   */
  async authenticate(
    username: string,
    password: string,
  ): Promise<LDAPAuthResult> {
    try {
      // ตรวจสอบ input parameters
      if (!username || !password) {
        return {
          success: false,
          // แสดงเฉพาะรหัสข้อผิดพลาด เพื่อให้ชั้นบน map ข้อความสำหรับผู้ใช้
          errorCode: "MISSING_CREDENTIALS",
        };
      }

      // ค้นหาผู้ใช้ใน LDAP
      const searchResult = await this.searchUser(username);

      if (!searchResult) {
        return {
          success: false,
          errorCode: "USER_NOT_FOUND",
        };
      }

      // ตรวจสอบว่า user account ถูก disable หรือไม่
      if (this.isAccountDisabled(searchResult.attributes)) {
        return {
          success: false,
          errorCode: "ACCOUNT_DISABLED",
        };
      }

      // ตรวจสอบว่า user อยู่ใน OU "rpp-user" หรือไม่
      if (!this.isUserInRppUserOU(searchResult.objectName)) {
        return {
          success: false,
          errorCode: "USER_NOT_AUTHORIZED",
        };
      }

      // ทดสอบการ bind ด้วย user credentials
      const bindCredentials = [
        searchResult.objectName, // DN ที่ได้จาก search
        `${username}@rpphosp.local`, // UserPrincipalName format
        username, // sAMAccountName
      ];

      let bindSuccess = false;

      for (const bindDN of bindCredentials) {
        try {
          bindSuccess = await this.testUserBind(bindDN, password);
          if (bindSuccess) {
            break;
          }
        } catch (error) {
          console.warn(`Bind failed with ${bindDN}:`, error);
        }
      }

      if (!bindSuccess) {
        return {
          success: false,
          errorCode: "INVALID_CREDENTIALS",
        };
      }

      // แปลงข้อมูลผู้ใช้
      const userData = this.parseUserData(searchResult);

      return {
        success: true,
        user: userData,
      };
    } catch (error) {
      console.error("LDAP authentication error:", error);

      // แยกกรณีเชื่อมต่อ LDAP ไม่ได้ ให้แจ้งผู้ใช้ด้วยข้อความที่ถูกต้อง
      if (
        error instanceof Error &&
        (error.message === "LDAP_CONNECTION_ERROR" ||
          this.isConnectionError(error))
      ) {
        return {
          success: false,
          errorCode: "CONNECTION_ERROR",
        };
      }

      return {
        success: false,
        errorCode: "INTERNAL_ERROR",
      };
    } finally {
      // ปิดการเชื่อมต่อ
      await this.closeClient();
    }
  }

  /**
   * ปิดการเชื่อมต่อทั้งหมด
   */
  async disconnect(): Promise<void> {
    await this.closeClient();
  }
}

/**
 * สร้าง LDAP Service instance จาก environment variables
 */
export function createLDAPService(): LDAPService {
  try {
    // ตรวจสอบ environment variables
    const { required, optional } = validateEnvironment();

    const config: LDAPConfig = {
      url: required.LDAP_URL,
      baseDN: required.LDAP_BASE_DN,
      bindDN: required.LDAP_BIND_DN,
      bindPassword: required.LDAP_BIND_PASSWORD,
      searchFilter:
        optional.LDAP_SEARCH_FILTER ||
        "(|(sAMAccountName={{username}})(userPrincipalName={{username}}))",
      timeout: parseInt(optional.LDAP_TIMEOUT || "5000"),
      connectTimeout: parseInt(optional.LDAP_CONNECT_TIMEOUT || "10000"),
      idleTimeout: parseInt(optional.LDAP_IDLE_TIMEOUT || "30000"),
      reconnect: optional.LDAP_RECONNECT === "true",
    };

    return new LDAPService(config);
  } catch (error) {
    console.error("Failed to create LDAP service:", error);
    throw new Error(
      "ไม่สามารถเริ่มต้น LDAP service ได้ กรุณาตรวจสอบ environment variables",
    );
  }
}

function getFirstOU(dn: string): string | null {
  const parts = dn.split(",").map((s) => s.trim());
  const firstOU = parts.find((p) => p.toUpperCase().startsWith("OU="));

  return firstOU ? firstOU.slice(3) : null; // ตัด "OU=" ออก
}
