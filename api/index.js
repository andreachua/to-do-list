// Vercel serverless entry point.
//
// Vercel serves the static frontend (./public) from its CDN, and routes every
// /api/* request to this function (see vercel.json). We reuse the same Express
// app as local dev, and ensure the database table exists on the first request
// of each cold start.

require('dotenv').config();

const app = require('../src/app');
const db = require('../src/db');

// Run init() once per cold start; cache the promise so concurrent requests wait
// on the same initialization rather than racing to create the table.
let ready;
function ensureReady() {
  if (!ready) ready = db.init();
  return ready;
}

module.exports = async (req, res) => {
  await ensureReady();
  return app(req, res);
};
