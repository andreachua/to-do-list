// SQLite implementation of the data layer (used for local development).
//
// better-sqlite3 is synchronous; we wrap the calls in async functions so this
// module exposes the exact same async interface as the Postgres implementation.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Store the database file under ./data (gitignored). Allow an override via env.
const DB_FILE =
  process.env.DATABASE_FILE || path.join(process.cwd(), 'data', 'todo.db');

// Make sure the parent directory exists before opening the file.
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL'); // better concurrency + durability

// Convert a raw DB row into the normalized shape the API always returns.
function normalize(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? null,
    due_date: row.due_date ?? null, // stored as 'YYYY-MM-DD' or null
    priority: row.priority,
    completed: !!row.completed, // stored as 0/1 -> boolean
    // SQLite datetime('now') is 'YYYY-MM-DD HH:MM:SS' in UTC; make it ISO.
    created_at: row.created_at
      ? row.created_at.replace(' ', 'T') + 'Z'
      : null,
  };
}

async function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      notes      TEXT,
      due_date   TEXT,
      priority   TEXT    NOT NULL DEFAULT 'medium',
      completed  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function getTasks() {
  const rows = db.prepare('SELECT * FROM tasks').all();
  return rows.map(normalize);
}

async function createTask({ title, notes = null, due_date = null, priority = 'medium' }) {
  const info = db
    .prepare(
      `INSERT INTO tasks (title, notes, due_date, priority)
       VALUES (@title, @notes, @due_date, @priority)`
    )
    .run({ title, notes, due_date, priority });

  const row = db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(info.lastInsertRowid);
  return normalize(row);
}

async function updateTask(id, fields) {
  // Only update columns that were actually provided.
  const allowed = ['title', 'notes', 'due_date', 'priority', 'completed'];
  const sets = [];
  const params = { id };

  for (const key of allowed) {
    if (key in fields) {
      // Store booleans as 0/1 for the completed column.
      params[key] = key === 'completed' ? (fields[key] ? 1 : 0) : fields[key];
      sets.push(`${key} = @${key}`);
    }
  }

  if (sets.length === 0) {
    // Nothing to change — just return the current row.
    return normalize(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
  }

  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return normalize(row); // null if id did not exist
}

async function deleteTask(id) {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return info.changes > 0;
}

async function clearCompleted() {
  const info = db.prepare('DELETE FROM tasks WHERE completed = 1').run();
  return info.changes;
}

module.exports = { init, getTasks, createTask, updateTask, deleteTask, clearCompleted };
