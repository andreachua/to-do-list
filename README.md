# My To-Do List

A simple, clean personal to-do list app with a real backend and database — your
tasks are saved on the server, not in the browser, so they survive clearing your
browser and can later be reached from other devices.

- **Frontend:** plain HTML/CSS/JS (no build step), responsive, light/dark theme,
  with a distinctive risograph-inspired design. Uses the Space Grotesk + Space
  Mono web fonts (loaded from Google Fonts when online, with system-font
  fallbacks offline).
- **Backend:** Node + Express JSON API.
- **Database:** SQLite locally (zero setup), Postgres in the cloud (auto-selected).

Each task has a title, optional notes, an optional due date, and a priority
(Low/Medium/High). You can filter (All/Active/Done), sort (Newest/Due date/
Priority), see how many tasks are left, and clear completed tasks in one click.

---

## 1. Run it locally

**Prerequisites:** [Node.js](https://nodejs.org) 18 or newer.

```bash
# 1. Install dependencies
npm install

# 2. Start the app
npm start
#   (or `npm run dev` to auto-restart when you edit files)
```

Then open **http://localhost:3000** in your browser.

That's it — no database setup needed. A SQLite file is created automatically at
`data/todo.db`. Your tasks live there and persist between restarts.

> Want a different port? Copy `.env.example` to `.env` and set `PORT=...`.

---

## 2. Deploy it online (Vercel + Neon Postgres)

Vercel hosts the app; Neon provides a free serverless Postgres database. The code
switches from SQLite to Postgres automatically whenever a `DATABASE_URL` is set —
no code changes needed.

### Step A — Create a free Postgres database (Neon)

1. Sign up at **https://neon.tech** and create a new project.
2. On the project dashboard, copy the **connection string**. It looks like:
   ```
   postgresql://user:password@your-host.neon.tech/dbname?sslmode=require
   ```

### Step B — Push this project to GitHub

Create a repo and push (the `.gitignore` already excludes `node_modules`, `.env`,
and the local database file):

```bash
git init
git add .
git commit -m "Initial commit"
# then create a repo on GitHub and follow its "push existing repo" instructions
```

### Step C — Deploy on Vercel

1. Sign in at **https://vercel.com** with your GitHub account.
2. Click **Add New… → Project** and import your repo.
3. Before deploying, open **Environment Variables** and add:
   - **Name:** `DATABASE_URL`
   - **Value:** the Neon connection string from Step A
4. Click **Deploy**.

Vercel serves the frontend from its CDN and runs the API as a serverless
function (`api/index.js`). The `tasks` table is created automatically on the
first request. Because `DATABASE_URL` is set, the app uses Postgres in the cloud
while still using SQLite on your machine.

> **Never commit real secrets.** The connection string lives only in Vercel's
> environment variables (and optionally your local, gitignored `.env`).

---

## 3. How the code is organized

```
to-do-list/
├── public/              # Frontend (served locally by Express, on Vercel by CDN)
│   ├── index.html       #   Markup + structure
│   ├── styles.css       #   Styling + light/dark theme (CSS variables)
│   └── app.js           #   All UI logic: fetch, render, filter, sort, theme
├── src/
│   ├── app.js           # Builds & exports the Express app (shared by both entries)
│   ├── routes/tasks.js  # The CRUD endpoints + input validation
│   └── db/
│       ├── index.js     #   Picks the engine by env, exposes one clean interface
│       ├── sqlite.js    #   SQLite implementation (local)
│       └── postgres.js  #   Postgres implementation (cloud)
├── server.js            # Local entry point: serves the frontend + listens
├── api/index.js         # Vercel serverless entry point
├── vercel.json          # Routes /api/* to the function; serves public/ statically
├── .env.example         # Documented environment variables (copy to .env)
└── package.json
```

### Where to change things

- **Add a task field** (e.g. a tag): update the table in both `src/db/sqlite.js`
  and `src/db/postgres.js`, add validation in `src/routes/tasks.js`, then show it
  in `public/app.js` (`renderTask`) and the form in `public/index.html`.
- **Change styling/colors:** edit the design tokens (the two-ink palette, fonts,
  spacing) in the `:root` / `[data-theme]` blocks at the top of
  `public/styles.css`.
- **Change validation limits** (max length, allowed priorities): see the top of
  `src/routes/tasks.js`.

---

## API reference

All endpoints return JSON.

| Method | Path                        | Purpose                              |
|--------|-----------------------------|--------------------------------------|
| GET    | `/api/tasks`                | List all tasks                       |
| POST   | `/api/tasks`                | Create a task                        |
| PATCH  | `/api/tasks/:id`            | Update any field of a task           |
| DELETE | `/api/tasks/:id`            | Delete a task                        |
| POST   | `/api/tasks/clear-completed`| Delete all completed tasks           |
| GET    | `/api/health`               | Health check (`{ ok, engine }`)      |

A task looks like:

```json
{
  "id": 1,
  "title": "Buy groceries",
  "notes": "milk, eggs",
  "due_date": "2026-07-10",
  "priority": "high",
  "completed": false,
  "created_at": "2026-07-07T12:00:00.000Z"
}
```
