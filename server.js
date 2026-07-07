// Local entry point.
//
// Loads environment variables, initializes the database, serves the static
// frontend from ./public, and starts listening. Run with `npm start` or
// `npm run dev` (auto-restart on file changes).

require('dotenv').config();

const path = require('path');
const express = require('express');
const app = require('./src/app');
const db = require('./src/db');

const PORT = process.env.PORT || 3000;

// Serve the frontend (index.html, styles.css, app.js) as static files.
app.use(express.static(path.join(__dirname, 'public')));

// Create the tasks table if needed, then start the server.
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`To-do app running at http://localhost:${PORT}`);
      console.log(`Using ${db.engineName()} database.`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize the database:', err);
    process.exit(1);
  });
