// Database access layer — engine selector.
//
// This module hides which database engine is in use. The rest of the app only
// ever calls the functions exported here (getTasks, createTask, ...), and gets
// back the SAME normalized JSON shape regardless of engine:
//   { id, title, notes, due_date, priority, completed, created_at }
// where `completed` is a real boolean and dates are ISO strings (or null).
//
// Engine choice is made ONCE, lazily, based on the environment:
//   - DATABASE_URL is set  -> Postgres  (used in the cloud, e.g. Neon)
//   - otherwise            -> SQLite    (zero-setup local dev, a file on disk)
//
// We `require` the chosen implementation lazily so the native `better-sqlite3`
// module is never loaded in the Postgres/serverless path (and vice versa).

let impl = null;

// Resolve the Postgres connection string from any of the common env var names.
// Neon's direct string and Vercel's newer integration use DATABASE_URL; older
// Vercel Postgres uses POSTGRES_URL / POSTGRES_PRISMA_URL. Accepting all of them
// means the deploy works no matter how the database was attached.
function postgresUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  );
}

// Resolve and cache the active engine implementation.
function getImpl() {
  if (impl) return impl;

  if (postgresUrl()) {
    impl = require('./postgres');
  } else {
    impl = require('./sqlite');
  }
  return impl;
}

// Which engine is active — handy for logging/health checks.
function engineName() {
  return postgresUrl() ? 'postgres' : 'sqlite';
}

// Create the tasks table if it does not exist yet. Called once on startup.
async function init() {
  return getImpl().init();
}

// Return all tasks (ordering is done client-side, so this just returns them).
async function getTasks() {
  return getImpl().getTasks();
}

// Insert a new task. `data` = { title, notes?, due_date?, priority? }.
async function createTask(data) {
  return getImpl().createTask(data);
}

// Partially update a task by id. `fields` may include any of:
// title, notes, due_date, priority, completed. Returns the updated task,
// or null if no task with that id exists.
async function updateTask(id, fields) {
  return getImpl().updateTask(id, fields);
}

// Delete a task by id. Returns true if a row was deleted, false otherwise.
async function deleteTask(id) {
  return getImpl().deleteTask(id);
}

// Delete every completed task. Returns the number of tasks removed.
async function clearCompleted() {
  return getImpl().clearCompleted();
}

module.exports = {
  engineName,
  init,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  clearCompleted,
};
