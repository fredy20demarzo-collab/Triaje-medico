// server/src/db.js
import mysql from 'mysql2/promise';
import 'dotenv/config';

const sslMode = (process.env.MYSQL_SSL || 'false').toLowerCase();
let ssl;
if (sslMode === 'false') ssl = undefined;
else if (sslMode === 'relaxed') ssl = { rejectUnauthorized: false };
else ssl = {};

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  ssl,
});
