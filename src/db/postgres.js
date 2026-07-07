// Postgres implementation of the data layer (used in the cloud, e.g. Neon).
//
// Selected automatically when DATABASE_URL is set. Exposes the exact same async
// interface as the SQLite implementation and returns the same normalized shape.

const { Pool } = require('pg');

// A single shared connection pool. Most hosted Postgres (Neon, Supabase, etc.)
// require SSL; `ssl: { rejectUnauthorized: false }` is the standard setting for
// their managed certificates.
const pool = new Pool({
  // Accept whichever env var the host provides (see src/db/index.js).
  connectionString:
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL,
  ssl: { rejectUnauthorized: false },
});

// pg emits 'error' on idle clients that hit a network problem (e.g. the host
// closing a connection). Without a listener, that's an uncaught exception
// that crashes the whole process — so just log it and let the pool recover.
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

// Select columns with due_date/created_at pre-formatted so the API returns the
// same string shapes as SQLite ('YYYY-MM-DD' dates, ISO timestamps).
const SELECT_COLS = `
  id,
  title,
  notes,
  to_char(due_date, 'YYYY-MM-DD') AS due_date,
  priority,
  completed,
  created_at
`;

function normalize(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? null,
    due_date: row.due_date ?? null,
    priority: row.priority,
    completed: !!row.completed, // already boolean from pg, kept explicit
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title      TEXT        NOT NULL,
      notes      TEXT,
      due_date   DATE,
      priority   TEXT        NOT NULL DEFAULT 'medium',
      completed  BOOLEAN     NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getTasks() {
  const { rows } = await pool.query(`SELECT ${SELECT_COLS} FROM tasks`);
  return rows.map(normalize);
}

async function createTask({ title, notes = null, due_date = null, priority = 'medium' }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, notes, due_date, priority)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SELECT_COLS}`,
    [title, notes, due_date, priority]
  );
  return normalize(rows[0]);
}

async function updateTask(id, fields) {
  // Only update columns that were actually provided.
  const allowed = ['title', 'notes', 'due_date', 'priority', 'completed'];
  const sets = [];
  const values = [];
  let i = 1;

  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = $${i++}`);
      values.push(fields[key]);
    }
  }

  if (sets.length === 0) {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS} FROM tasks WHERE id = $1`,
      [id]
    );
    return normalize(rows[0]);
  }

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${SELECT_COLS}`,
    values
  );
  return normalize(rows[0]); // undefined -> null if id did not exist
}

async function deleteTask(id) {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function clearCompleted() {
  const result = await pool.query('DELETE FROM tasks WHERE completed = true');
  return result.rowCount;
}

module.exports = { init, getTasks, createTask, updateTask, deleteTask, clearCompleted };
