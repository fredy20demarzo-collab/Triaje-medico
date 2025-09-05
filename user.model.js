// server/src/models/user.model.js
import { pool } from '../db.js';

// Normaliza email a minúsculas para evitar problemas de mayúsculas
export async function findUserByEmail(email) {
  const [rows] = await pool.query(
    `SELECT id, email, full_name, role_id, is_active, password_hash
     FROM users
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}