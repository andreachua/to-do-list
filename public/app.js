// Frontend logic for the to-do app.
//
// Responsibilities:
//   - Talk to the /api/tasks endpoints (load, create, update, delete, clear)
//   - Keep a local copy of tasks and re-render on any change
//   - Apply the active filter (all/active/completed) and sort (newest/due/priority)
//   - Handle the theme toggle, the live counter, and friendly error messages
//
// Tasks are ALWAYS stored on the server. localStorage is used only to remember
// the light/dark theme preference.

// --- Local UI state ----------------------------------------------------------
const state = {
  tasks: [], // full list from the server
  filter: 'all', // 'all' | 'active' | 'completed'
  period: 'all', // 'all' | 'day' | 'week' | 'month' — filter by due date
  sort: 'newest', // 'newest' | 'due' | 'priority'
};

// --- Element references -------------------------------------------------------
const els = {
  dateline: document.getElementById('dateline'),
  form: document.getElementById('add-form'),
  title: document.getElementById('title-input'),
  due: document.getElementById('due-input'),
  priority: document.getElementById('priority-input'),
  notes: document.getElementById('notes-input'),
  addBtn: document.getElementById('add-btn'),
  list: document.getElementById('task-list'),
  empty: document.getElementById('empty-state'),
  counter: document.getElementById('counter'),
  clearCompleted: document.getElementById('clear-completed'),
  sortSelect: document.getElementById('sort-select'),
  periodSelect: document.getElementById('period-select'),
  filterButtons: document.querySelectorAll('.filter-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  themeIcon: document.querySelector('.theme-icon'),
  errorBanner: document.getElementById('error-banner'),
  errorText: document.getElementById('error-text'),
  errorDismiss: document.getElementById('error-dismiss'),
};

// --- Error banner -------------------------------------------------------------
function showError(message) {
  els.errorText.textContent = message;
  els.errorBanner.hidden = false;
}
function hideError() {
  els.errorBanner.hidden = true;
}

// --- API helper ---------------------------------------------------------------
// Wraps fetch: sends/receives JSON, throws a friendly Error on failure so every
// caller can show the same error banner. Network errors are caught too.
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // Server down / offline / DNS failure, etc.
    throw new Error('Could not reach the server. Is it running?');
  }

  if (res.status === 204) return null; // No Content (e.g. delete)

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* some responses have no JSON body */
  }

  if (!res.ok) {
    throw new Error((data && data.error) || 'Request failed. Please try again.');
  }
  return data;
}

// --- Sorting & filtering ------------------------------------------------------
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
// Short monospace labels shown on each task (the <select> uses these too).
const PRIORITY_LABEL = { low: 'low', medium: 'med', high: 'high' };

// id of the task just added, so it can animate in on the next render
let justAddedId = null;

// Return the inclusive [start, end] calendar range (local time) for the
// active period, or null when no period filter is applied ('all'). Dates are
// compared as 'YYYY-MM-DD' strings so a task's due_date can be tested directly.
function periodRange() {
  if (state.period === 'all') return null;

  const toStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (state.period === 'day') {
    return { start: toStr(now), end: toStr(now) };
  }

  if (state.period === 'week') {
    // Calendar week, Monday–Sunday, containing today.
    const dow = (now.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
    const start = new Date(now);
    start.setDate(now.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toStr(start), end: toStr(end) };
  }

  // 'month' — the calendar month containing today.
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toStr(start), end: toStr(end) };
}

function filteredSortedTasks() {
  let list = state.tasks.slice();

  // Filter
  if (state.filter === 'active') list = list.filter((t) => !t.completed);
  if (state.filter === 'completed') list = list.filter((t) => t.completed);

  // Period filter — keep tasks whose due date falls in the selected range.
  // Tasks without a due date don't belong to any period, so they're excluded.
  const range = periodRange();
  if (range) {
    list = list.filter(
      (t) => t.due_date && t.due_date >= range.start && t.due_date <= range.end
    );
  }

  // Sort
  if (state.sort === 'newest') {
    // Most recently created first (fall back to id for a stable order).
    list.sort(
      (a, b) =>
        new Date(b.created_at) - new Date(a.created_at) || b.id - a.id
    );
  } else if (state.sort === 'due') {
    // Soonest due first; tasks without a due date go to the bottom.
    list.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  } else if (state.sort === 'priority') {
    list.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );
  }

  return list;
}

// --- Rendering ----------------------------------------------------------------
// Format an ISO date ('YYYY-MM-DD') for display, and detect overdue dates.
function formatDue(dateStr) {
  // Compare by calendar day in the user's local time.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  const overdue = due < today;
  const label = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return { label, overdue };
}

// Build a single task <li>. We use textContent for user-supplied strings so
// there's no risk of HTML injection from task text.
function renderTask(task) {
  const li = document.createElement('li');
  li.className = 'task' + (task.completed ? ' completed' : '');
  // Animate only the task that was just added.
  if (task.id === justAddedId) li.classList.add('enter');
  li.dataset.priority = task.priority;
  li.dataset.id = task.id;

  // Checkbox — toggles completed
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'task-check';
  check.checked = task.completed;
  check.title = task.completed ? 'Mark as active' : 'Mark as complete';
  check.addEventListener('change', () =>
    toggleComplete(task, check.checked)
  );

  // Body: title (+ inline edit), notes, meta
  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'task-body';

  const titleEl = document.createElement('div');
  titleEl.className = 'task-title';
  titleEl.textContent = task.title;
  titleEl.title = 'Click to edit';
  titleEl.addEventListener('click', () => beginEditTitle(task, titleEl));
  bodyDiv.appendChild(titleEl);

  if (task.notes) {
    const notesEl = document.createElement('div');
    notesEl.className = 'task-notes';
    notesEl.textContent = task.notes;
    bodyDiv.appendChild(notesEl);
  }

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  // Priority as a monospace ink tag (color set by CSS per level).
  const prio = document.createElement('span');
  prio.className = 'tag-priority';
  prio.textContent = PRIORITY_LABEL[task.priority] || task.priority;
  meta.appendChild(prio);

  if (task.due_date) {
    const { label, overdue } = formatDue(task.due_date);
    const dueEl = document.createElement('span');
    const isOverdue = overdue && !task.completed;
    dueEl.className = 'tag-due' + (isOverdue ? ' overdue' : '');
    dueEl.textContent = 'due ' + label + (isOverdue ? ' · overdue' : '');
    meta.appendChild(dueEl);
  }
  bodyDiv.appendChild(meta);

  // Delete button
  const del = document.createElement('button');
  del.className = 'task-delete';
  del.type = 'button';
  del.title = 'Delete task';
  del.textContent = 'del';
  del.addEventListener('click', () => deleteTask(task));

  li.append(check, bodyDiv, del);
  return li;
}

function render() {
  const list = filteredSortedTasks();

  els.list.innerHTML = '';
  list.forEach((task) => els.list.appendChild(renderTask(task)));

  // Empty state — an invitation to act, not just "empty"
  els.empty.hidden = list.length > 0;
  if (list.length === 0) {
    els.empty.textContent =
      state.tasks.length === 0
        ? 'Nothing on the list. Write down the first thing you need to do.'
        : 'Nothing here — try a different filter.';
  }

  // Counter: number of active (not completed) tasks
  const left = state.tasks.filter((t) => !t.completed).length;
  els.counter.textContent = left === 0 ? 'all clear' : `${left} to go`;

  // Disable "clear completed" when there's nothing to clear
  const anyCompleted = state.tasks.some((t) => t.completed);
  els.clearCompleted.disabled = !anyCompleted;
  els.clearCompleted.style.visibility = anyCompleted ? 'visible' : 'hidden';
}

// --- Inline title editing -----------------------------------------------------
function beginEditTitle(task, titleEl) {
  const input = document.createElement('input');
  input.className = 'task-title-input';
  input.type = 'text';
  input.maxLength = 500;
  input.value = task.title;
  titleEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const newTitle = input.value.trim();
    if (!newTitle || newTitle === task.title) {
      render(); // no change (or empty) — just restore
      return;
    }
    await updateTask(task, { title: newTitle });
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      done = true;
      render(); // cancel
    }
  });
}

// --- Actions (each updates the server, then local state, then re-renders) -----
async function loadTasks() {
  try {
    hideError();
    state.tasks = await api('GET', '/api/tasks');
    render();
  } catch (err) {
    showError(err.message);
  }
}

async function addTask(e) {
  e.preventDefault();
  hideError();

  const title = els.title.value.trim();
  if (!title) {
    showError('Please enter a task before adding.');
    return;
  }

  const payload = {
    title,
    notes: els.notes.value.trim() || null,
    due_date: els.due.value || null,
    priority: els.priority.value,
  };

  els.addBtn.disabled = true;
  try {
    const created = await api('POST', '/api/tasks', payload);
    state.tasks.push(created);
    els.form.reset();
    els.priority.value = 'medium';
    els.title.focus();
    justAddedId = created.id; // triggers the slide-in on this row
    render();
    justAddedId = null;
  } catch (err) {
    showError(err.message);
  } finally {
    els.addBtn.disabled = false;
  }
}

async function toggleComplete(task, completed) {
  await updateTask(task, { completed });
}

// Shared update helper: PATCH the task, then merge the result into local state.
async function updateTask(task, fields) {
  try {
    hideError();
    const updated = await api('PATCH', `/api/tasks/${task.id}`, fields);
    const idx = state.tasks.findIndex((t) => t.id === task.id);
    if (idx !== -1) state.tasks[idx] = updated;
    render();
  } catch (err) {
    showError(err.message);
    render(); // revert any optimistic UI (e.g. checkbox)
  }
}

async function deleteTask(task) {
  try {
    hideError();
    await api('DELETE', `/api/tasks/${task.id}`);
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    render();
  } catch (err) {
    showError(err.message);
  }
}

async function clearCompleted() {
  try {
    hideError();
    await api('POST', '/api/tasks/clear-completed');
    state.tasks = state.tasks.filter((t) => !t.completed);
    render();
  } catch (err) {
    showError(err.message);
  }
}

// --- Theme --------------------------------------------------------------------
function applyThemeIcon() {
  // The stamp shows the theme you'd switch TO.
  const theme = document.documentElement.getAttribute('data-theme');
  els.themeIcon.textContent = theme === 'dark' ? 'light' : 'dark';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  applyThemeIcon();
}

// --- Wire up events -----------------------------------------------------------
els.form.addEventListener('submit', addTask);
els.clearCompleted.addEventListener('click', clearCompleted);
els.errorDismiss.addEventListener('click', hideError);
els.themeToggle.addEventListener('click', toggleTheme);

els.sortSelect.addEventListener('change', () => {
  state.sort = els.sortSelect.value;
  render();
});

els.periodSelect.addEventListener('change', () => {
  state.period = els.periodSelect.value;
  render();
});

els.filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    els.filterButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
    render();
  });
});

// --- Masthead dateline (today's date, monospace) ------------------------------
function renderDateline() {
  const now = new Date();
  const wd = now.toLocaleDateString(undefined, { weekday: 'short' });
  const day = String(now.getDate()).padStart(2, '0');
  const mon = now.toLocaleDateString(undefined, { month: 'short' });
  els.dateline.textContent = `${wd} · ${day} ${mon} ${now.getFullYear()}`;
}

// --- Start --------------------------------------------------------------------
renderDateline();
applyThemeIcon();
loadTasks();
