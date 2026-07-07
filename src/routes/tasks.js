// CRUD routes for /api/tasks.
//
// Each handler validates input, calls the database layer, and returns JSON.
// Validation errors return 400 with a friendly { error } message; missing
// records return 404. Unexpected errors bubble to the central error handler
// in src/app.js so the client always gets JSON, never an HTML stack trace.

const express = require('express');
const db = require('../db');

const router = express.Router();

// --- Validation rules --------------------------------------------------------
const PRIORITIES = ['low', 'medium', 'high'];
const MAX_TITLE = 500;
const MAX_NOTES = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // 'YYYY-MM-DD'

// Small async wrapper so thrown errors reach Express's error handler.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Validate/normalize a title. Returns { value } or { error }.
function cleanTitle(raw) {
  if (typeof raw !== 'string') return { error: 'Title is required.' };
  const value = raw.trim();
  if (!value) return { error: 'Task title cannot be empty.' };
  if (value.length > MAX_TITLE) {
    return { error: `Task title is too long (max ${MAX_TITLE} characters).` };
  }
  return { value };
}

// Validate optional notes. Returns { value } (string|null) or { error }.
function cleanNotes(raw) {
  if (raw == null || raw === '') return { value: null };
  if (typeof raw !== 'string') return { error: 'Notes must be text.' };
  const value = raw.trim();
  if (value.length > MAX_NOTES) {
    return { error: `Notes are too long (max ${MAX_NOTES} characters).` };
  }
  return { value: value || null };
}

// Validate optional due date. Returns { value } (string|null) or { error }.
function cleanDueDate(raw) {
  if (raw == null || raw === '') return { value: null };
  if (typeof raw !== 'string' || !DATE_RE.test(raw)) {
    return { error: 'Due date must be in YYYY-MM-DD format.' };
  }
  return { value: raw };
}

// Validate optional priority. Returns { value } or { error }.
function cleanPriority(raw) {
  if (raw == null || raw === '') return { value: 'medium' };
  if (!PRIORITIES.includes(raw)) {
    return { error: `Priority must be one of: ${PRIORITIES.join(', ')}.` };
  }
  return { value: raw };
}

// GET /api/tasks — return all tasks.
router.get(
  '/',
  wrap(async (req, res) => {
    const tasks = await db.getTasks();
    res.json(tasks);
  })
);

// POST /api/tasks — create a task.
router.post(
  '/',
  wrap(async (req, res) => {
    const body = req.body || {};

    const title = cleanTitle(body.title);
    if (title.error) return res.status(400).json({ error: title.error });

    const notes = cleanNotes(body.notes);
    if (notes.error) return res.status(400).json({ error: notes.error });

    const due = cleanDueDate(body.due_date);
    if (due.error) return res.status(400).json({ error: due.error });

    const priority = cleanPriority(body.priority);
    if (priority.error) return res.status(400).json({ error: priority.error });

    const task = await db.createTask({
      title: title.value,
      notes: notes.value,
      due_date: due.value,
      priority: priority.value,
    });
    res.status(201).json(task);
  })
);

// POST /api/tasks/clear-completed — delete all completed tasks.
// Declared before "/:id" so it isn't captured as an id.
router.post(
  '/clear-completed',
  wrap(async (req, res) => {
    const removed = await db.clearCompleted();
    res.json({ removed });
  })
);

// PATCH /api/tasks/:id — partial update of a task.
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const body = req.body || {};
    const fields = {};

    if ('title' in body) {
      const title = cleanTitle(body.title);
      if (title.error) return res.status(400).json({ error: title.error });
      fields.title = title.value;
    }
    if ('notes' in body) {
      const notes = cleanNotes(body.notes);
      if (notes.error) return res.status(400).json({ error: notes.error });
      fields.notes = notes.value;
    }
    if ('due_date' in body) {
      const due = cleanDueDate(body.due_date);
      if (due.error) return res.status(400).json({ error: due.error });
      fields.due_date = due.value;
    }
    if ('priority' in body) {
      const priority = cleanPriority(body.priority);
      if (priority.error) return res.status(400).json({ error: priority.error });
      fields.priority = priority.value;
    }
    if ('completed' in body) {
      fields.completed = !!body.completed;
    }

    const updated = await db.updateTask(req.params.id, fields);
    if (!updated) return res.status(404).json({ error: 'Task not found.' });
    res.json(updated);
  })
);

// DELETE /api/tasks/:id — delete one task.
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const ok = await db.deleteTask(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Task not found.' });
    res.status(204).end();
  })
);

module.exports = router;
