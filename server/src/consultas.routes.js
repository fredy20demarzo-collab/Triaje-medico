
// server/src/consultas.routes.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  ssl: process.env.MYSQL_SSL === 'true',
});

// Middleware mínimo (ya tienes el real en tu server; mantenlo si prefieres)
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  next();
}

/* --------------------------------------------------------------------------------
   Detección de columnas (soporta attended_at / atendido_at, comentario_ia / etc.)
---------------------------------------------------------------------------------*/
let schemaCache = null;

async function getSchema() {
  if (schemaCache) return schemaCache;

  const [cols] = await db.query('SHOW COLUMNS FROM consultas');
  const names = cols.map(c => c.Field.toLowerCase());
  const has = (n) => names.includes(n);
  const pick = (arr, def=null) => arr.find(n => has(n)) || def;

  const schema = {
    id:        pick(['id']),
    paciente:  pick(['paciente']),
    telefono:  pick(['telefono','teléfono','telefono_paciente']),
    sintomas:  pick(['sintomas','síntomas']),
    urgencia:  pick(['urgencia','nivel_urgencia']),
    comentario:pick(['comentario_ia','comentarios_ia','comentarios','comentario','comentarios_ai']),
    estado:    pick(['estado','estatus']),
    createdAt: pick(['created_at','fecha','fecha_hora','fecha_ingreso']),
    // 👇 importante: reconocer ambos
    atendidoAt:pick(['attended_at','atendido_at','fecha_atendido']),
  };

  for (const k of ['paciente','sintomas','urgencia']) {
    if (!schema[k]) throw new Error(`Columna requerida no encontrada: ${k}`);
  }

  schemaCache = schema;
  return schemaCache;
}

function sqlSelect(schema) {
  const parts = [
    `${schema.id || 'id'} AS id`,
    `${schema.createdAt || 'NULL'} AS created_at`,
    `${schema.paciente} AS paciente`,
    `${schema.telefono || 'NULL'} AS telefono`,
    `${schema.sintomas} AS sintomas`,
    `${schema.urgencia} AS urgencia`,
    `${schema.comentario || 'NULL'} AS comentario_ia`,
    `${schema.estado || 'NULL'} AS estado`,
    // devolvemos siempre con alias atendido_at
    `${schema.atendidoAt || 'NULL'} AS atendido_at`,
  ];
  return `SELECT ${parts.join(', ')} FROM consultas`;
}

/* --------------------------------------------------------------------------------
   GET /api/consultas
---------------------------------------------------------------------------------*/
router.get('/consultas', auth, async (req, res) => {
  try {
    const schema = await getSchema();
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const sort  = (req.query.sort || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const q        = (req.query.q || '').trim();
    const estado   = (req.query.estado || '').trim();   // 'pendiente' | 'atendido'
    const urgencia = (req.query.urgencia || '').trim(); // 'Alta'|'Media'|'Baja'

    const where = [];
    const args  = [];

    if (q) {
      where.push(
        `(${schema.paciente} LIKE ? OR ${schema.telefono || schema.paciente} LIKE ? OR ${schema.sintomas} LIKE ? OR ${(schema.comentario || schema.sintomas)} LIKE ?)`
      );
      args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
    }
    if (estado && schema.estado) { where.push(`${schema.estado} = ?`); args.push(estado); }
    if (urgencia) { where.push(`${schema.urgencia} = ?`); args.push(urgencia); }

    const sql = `
      ${sqlSelect(schema)}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${schema.createdAt || schema.id || 'id'} ${sort}
      LIMIT ${limit}
    `;
    const [rows] = await db.query(sql, args);
    res.json(rows || []);
  } catch (e) {
    console.error('GET /api/consultas error:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/* --------------------------------------------------------------------------------
   POST /api/consultas   (guarda nueva consulta)
---------------------------------------------------------------------------------*/
router.post('/consultas', auth, async (req, res) => {
  try {
    const schema = await getSchema();
    const {
      paciente = '',
      telefono = '',
      sintomas = '',
      urgencia = '',
      comentario_ia = '',
    } = req.body || {};

    if (!paciente.trim() || !sintomas.trim() || !urgencia.trim()) {
      return res.status(400).json({ error: 'Paciente, síntomas y urgencia son obligatorios.' });
    }

    const cols = [schema.paciente, schema.telefono, schema.sintomas, schema.urgencia];
    const vals = [paciente.trim(), telefono.trim(), sintomas.trim(), urgencia.trim()];
    if (schema.comentario) { cols.push(schema.comentario); vals.push((comentario_ia || '').trim()); }
    if (schema.estado)     { cols.push(schema.estado);     vals.push('pendiente'); }

    const placeholders = cols.map(() => '?').join(', ');
    const sqlIns = `INSERT INTO consultas (${cols.join(', ')}) VALUES (${placeholders})`;
    const [ins] = await db.query(sqlIns, vals);

    const sqlSel = `${sqlSelect(schema)} WHERE ${(schema.id || 'id')} = ?`;
    const [row]  = await db.query(sqlSel, [ins.insertId]);
    res.json(row[0]);
  } catch (e) {
    console.error('POST /api/consultas error:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/* --------------------------------------------------------------------------------
   PATCH /api/consultas/:id/estado
   - Si estado='atendido' => pone estado y attended_at = NOW(6)
   - Si estado='pendiente' => pone estado y attended_at = NULL
---------------------------------------------------------------------------------*/
router.patch('/consultas/:id/estado', auth, async (req, res) => {
  try {
    const schema = await getSchema();
    const id     = Number(req.params.id);
    const body   = String(req.body?.estado || '').toLowerCase();
    const estado = body === 'atendido' ? 'atendido' : 'pendiente';

    if (!schema.estado) {
      return res.status(400).json({ error: 'No existe columna de estado en la tabla.' });
    }

    if (schema.atendidoAt) {
      // ✅ escribimos la fecha/hora directamente en MySQL
      const sqlUpd = `
        UPDATE consultas
        SET ${schema.estado} = ?,
            ${schema.atendidoAt} = ${estado === 'atendido' ? 'NOW(6)' : 'NULL'}
        WHERE ${(schema.id || 'id')} = ?
      `;
      await db.query(sqlUpd, [estado, id]);
    } else {
      await db.query(
        `UPDATE consultas SET ${schema.estado} = ? WHERE ${(schema.id || 'id')} = ?`,
        [estado, id]
      );
    }

    // devolvemos la fila normalizada (incluye atendido_at)
    const sqlSel = `${sqlSelect(schema)} WHERE ${(schema.id || 'id')} = ?`;
    const [row]  = await db.query(sqlSel, [id]);
    res.json(row[0] || { ok: true });
  } catch (e) {
    console.error('PATCH /api/consultas/:id/estado error:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
