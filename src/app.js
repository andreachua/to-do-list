// Builds and EXPORTS the Express app (without starting a server).
//
// This is shared by both entry points:
//   - server.js       (local: also serves the static frontend + listens)
//   - api/index.js     (Vercel serverless function)

const express = require('express');
const tasksRouter = require('./routes/tasks');

const app = express();

// Parse JSON request bodies.
app.use(express.json());

// Simple health check — useful for confirming the API + engine are up.
const db = require('./db');
app.get('/api/health', (req, res) => {
  res.json({ ok: true, engine: db.engineName() });
});

// All task CRUD lives under /api/tasks.
app.use('/api/tasks', tasksRouter);

// Central error handler — ensures the client always gets JSON, never HTML.
// (Express identifies this as an error handler by its 4 arguments.)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

module.exports = app;
