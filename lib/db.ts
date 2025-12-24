// lib/db.ts
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rpp_dorm',
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 20), // เพิ่ม connection limit เป็น 20
  queueLimit: 0, // ไม่จำกัด queue
  enableKeepAlive: true, // เปิด keep-alive
  keepAliveInitialDelay: 0, // keep-alive delay
  waitForConnections: true, // รอ connection ที่ว่าง
  idleTimeout: 600000, // ปิด connection ที่ idle 10 นาที
});

// ตรวจสอบและ log connection pool status
pool.on('connection', () => {
  // Connection established
});

// หมายเหตุ: type definition ของ mysql2/promise ไม่ได้ประกาศ event 'error' บน pool โดยตรง
// แต่ runtime รองรับ event นี้ เราจึงต้อง cast pool เป็น any เฉพาะจุดนี้
(pool as any).on('error', (err: NodeJS.ErrnoException & { code?: string }) => {
  // ลด log error ที่ไม่จำเป็น - log เฉพาะ error ที่สำคัญ
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection was closed.');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('Database connection was refused.');
  }
  // ไม่ log ER_CON_COUNT_ERROR ที่นี่ เพราะจะ log ใน query function แล้ว
});

// ฟังก์ชันสำหรับตรวจสอบสถานะ connection pool
function getPoolStatus() {
  try {
    const poolInternal = (pool as any).pool;
    return {
      totalConnections: poolInternal?._allConnections?.length || 0,
      freeConnections: poolInternal?._freeConnections?.length || 0,
      queueLength: poolInternal?._connectionQueue?.length || 0,
    };
  } catch {
    return {
      totalConnections: 0,
      freeConnections: 0,
      queueLength: 0,
    };
  }
}

// ฟังก์ชันสำหรับตรวจสอบว่า error เป็น "Too many connections" หรือไม่
export function isTooManyConnectionsError(error: any): boolean {
  return error?.code === 'ER_CON_COUNT_ERROR' || 
         error?.message?.includes('Too many connections') ||
         error?.errno === 1040;
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  let retryCount = 0;
  const maxRetries = 2; // retry 2 ครั้ง
  const baseRetryDelay = 500; // ลด delay เป็น 500ms

  while (retryCount <= maxRetries) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    } catch (error: any) {
      // ถ้าเป็น error "Too many connections" ให้ retry โดยไม่ log
      if (isTooManyConnectionsError(error) && retryCount < maxRetries) {
        retryCount++;
        // ใช้ exponential backoff: 500ms, 1000ms
        const delay = baseRetryDelay * retryCount;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // retry
      }
      
      // ถ้าไม่ใช่ connection error หรือ retry หมดแล้ว ให้ throw error
      // ไม่ log error ที่เป็น "Too many connections" เพราะจะทำให้ log เยอะเกินไป
      if (!isTooManyConnectionsError(error)) {
      console.error('SQL Error:', error.message);
        if (sql && sql.length < 500) {
      console.error('SQL Query:', sql);
        } else {
          console.error('SQL Query:', sql.substring(0, 200) + '...');
        }
        if (params && params.length > 0) {
      console.error('SQL Params:', params);
        }
      }
      throw error;
    }
  }
  
  // ไม่ควรมาถึงจุดนี้ แต่ถ้ามาให้ throw error
  throw new Error('Failed to execute query after retries');
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export { pool };

