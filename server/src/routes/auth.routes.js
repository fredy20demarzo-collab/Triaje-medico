// server/src/routes/auth.routes.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { findUserByEmail } from '../models/user.model.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Email y contraseña requeridos.' });
    }

    const user = await findUserByEmail(email);

    // ---- DEBUG MÍNIMO ----
    console.log('[LOGIN] email:', email);
    console.log('[LOGIN] user found?:', !!user);
    if (user) {
      console.log('[LOGIN] user.id:', user.id, 'is_active:', user.is_active, 'hash_len:', (user.password_hash || '').length);
    }
    // ----------------------

    if (!user) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
    }
    if (Number(user.is_active) === 0) {
      return res.status(403).json({ ok: false, message: 'Usuario inactivo.' });
    }

    // IMPORTANTE: comparar SIEMPRE con bcryptjs.compare
    const match = await bcrypt.compare(password, user.password_hash || '');

    // ---- DEBUG MÍNIMO ----
    console.log('[LOGIN] compare result:', match);
    // ----------------------

    if (!match) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
    }

    // Generar tokens
    const payload = { sub: user.id, email: user.email, role_id: user.role_id };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES || '1h',
    });
    const refreshToken = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      expiresIn: `${process.env.REFRESH_EXPIRES_DAYS || 30}d`,
    });

    delete user.password_hash;

    return res.json({ ok: true, user, accessToken, refreshToken });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return res.status(500).json({ ok: false, message: 'Error interno al iniciar sesión.' });
  }
});

export default router;