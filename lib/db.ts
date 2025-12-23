// lib/db.ts
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rpp_dorm',
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 100), // เพิ่ม connection limit เป็น 100
  queueLimit: 0, // ไม่จำกัด queue
  enableKeepAlive: true, // เปิด keep-alive
  keepAliveInitialDelay: 0, // keep-alive delay
  waitForConnections: true, // รอ connection ที่ว่าง
});

// ตรวจสอบและ log connection pool status
pool.on('connection', () => {
  // Connection established
});

// หมายเหตุ: type definition ของ mysql2/promise ไม่ได้ประกาศ event 'error' บน pool โดยตรง
// แต่ runtime รองรับ event นี้ เราจึงต้อง cast pool เป็น any เฉพาะจุดนี้
(pool as any).on('error', (err: NodeJS.ErrnoException & { code?: string }) => {
  console.error('Database pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection was closed.');
  }
  if (err.code === 'ER_CON_COUNT_ERROR') {
    console.error('Database has too many connections.');
  }
  if (err.code === 'ECONNREFUSED') {
    console.error('Database connection was refused.');
  }
});

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  let retryCount = 0;
  const maxRetries = 5; // เพิ่ม retry เป็น 5 ครั้ง
  const baseRetryDelay = 200; // ลด base delay เป็น 200ms

  while (retryCount <= maxRetries) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    } catch (error: any) {
      // ถ้าเป็น error "Too many connections" ให้ retry
      if ((error.code === 'ER_CON_COUNT_ERROR' || error.message?.includes('Too many connections')) && retryCount < maxRetries) {
        retryCount++;
        // ใช้ exponential backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms
        const delay = baseRetryDelay * Math.pow(2, retryCount - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // retry
      }
      
      // ถ้าไม่ใช่ connection error หรือ retry หมดแล้ว ให้ throw error
      console.error('SQL Error:', error.message);
      console.error('SQL Query:', sql);
      console.error('SQL Params:', params);
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

