/* ============================================
   Personal Focus Board — App Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initGreeting();
  initClock();
  initFocus();
  initTasks();
  initSettings();
  initWallpaper();
  initShortcuts();
});

/* ============================================
   Greeting (P1-6, P1-7)
   ============================================ */

/**
 * Returns a time-based greeting string.
 * 05:00–11:59 → "Good Morning"
 * 12:00–16:59 → "Good Afternoon"
 * 17:00–04:59 → "Good Evening"
 */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/**
 * Extracts a display name from a Chrome profile email.
 * e.g. 'john.doe@gmail.com' → 'John Doe'
 *      'may_thu_han@company.com' → 'May Thu Han'
 */
function nameFromEmail(email) {
  if (!email) return null;
  const local = email.split('@')[0];
  // Replace dots, underscores, hyphens with spaces, then title-case
  return local
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Gets the default display name: tries Chrome profile first, falls back to 'User'.
 * @returns {Promise<string>}
 */
function getDefaultName() {
  return new Promise((resolve) => {
    if (chrome.identity && chrome.identity.getProfileUserInfo) {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
        const parsed = nameFromEmail(info && info.email);
        resolve(parsed || 'User');
      });
    } else {
      resolve('User');
    }
  });
}

/**
 * Loads displayName from storage (or auto-detects from Chrome profile)
 * and renders the greeting.
 */
async function initGreeting() {
  const greetingEl = document.getElementById('greeting');

  const result = await new Promise((r) => chrome.storage.local.get(['displayName'], r));
  let name = result.displayName;

  // First-time: auto-detect from Chrome profile and persist
  if (!name) {
    name = await getDefaultName();
    chrome.storage.local.set({ displayName: name });
  }

  greetingEl.textContent = `${getGreeting()}, ${name}`;
}

/* ============================================
   Live Clock (P1-10)
   ============================================ */

/**
 * Updates the clock element with current time in HH:MM:SS (24-hour)
 * and sets the current date display.
 */
function updateClock() {
  const clockEl = document.getElementById('clock');
  const dateEl = document.getElementById('current-date');
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  clockEl.textContent = `${hours}:${minutes}:${seconds}`;

  // Update date (only needs to change once per day, but cheap to set each tick)
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

function initClock() {
  updateClock(); // Render immediately to avoid 1s blank
  setInterval(updateClock, 1000);
}

/* ============================================
   Daily Focus Prompt (P1-14)
   ============================================ */

/* ============================================
   Focus Display (P1-13 revised)
   ============================================ */

/**
 * Shows the first incomplete task (highest priority) as the "main focus".
 * Called on init and after every task render.
 */
function updateFocusDisplay() {
  const el = document.getElementById('focus-display');
  if (!el) return;
  // Find first incomplete task — tasks are already sorted by priority
  const first = tasks.find((t) => !t.completed);
  if (first) {
    el.textContent = first.text;
    el.classList.remove('focus-display--empty');
  } else if (tasks.length > 0) {
    el.textContent = 'All done! 🎉';
    el.classList.add('focus-display--empty');
  } else {
    el.textContent = 'Add a task to get started';
    el.classList.add('focus-display--empty');
  }
}

/** Legacy stub — focus display is now driven by task data. */
function initFocus() {
  updateFocusDisplay();
}

/* ============================================
   Task List (Phase 2)
   ============================================ */

/** In-memory tasks array. */
let tasks = [];

/** Index of the task currently being dragged (-1 when idle). */
let dragSrcIndex = -1;

/**
 * Loads tasks from chrome.storage.local.
 * @returns {Promise<Array>} Array of task objects.
 */
function loadTasks() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tasks'], (result) => {
      resolve(result.tasks || []);
    });
  });
}

/**
 * Saves tasks array to chrome.storage.local.
 * @param {Array} taskList - The tasks array to persist.
 */
function saveTasks(taskList) {
  chrome.storage.local.set({ tasks: taskList });
}

/** Priority weight map — lower = higher priority. */
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };

/**
 * Sorts the tasks array in-place by priority (high → medium → low).
 * Within the same priority, original order is preserved (stable sort).
 */
function sortTasksByPriority() {
  tasks.sort((a, b) => {
    // Completed tasks always go to the bottom
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // Within the same completion state, sort by priority
    const wa = PRIORITY_WEIGHT[a.priority] ?? 1;
    const wb = PRIORITY_WEIGHT[b.priority] ?? 1;
    return wa - wb;
  });
}

/**
 * Adds a new task with the given priority.
 * @param {string} text - Task description (will be trimmed).
 * @param {string} priority - 'high', 'medium', or 'low'.
 */
function addTask(text, priority = 'medium') {
  const trimmed = text.trim();
  if (!trimmed) return;

  const task = {
    id: Date.now().toString(),
    text: trimmed,
    completed: false,
    priority: priority,
    createdAt: Date.now()
  };

  tasks.push(task);
  sortTasksByPriority();
  saveTasks(tasks);
  renderTasks();
}

/**
 * Toggles a task's completed state.
 * @param {string} id - Task ID.
 */
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.completed = !task.completed;
    // Record when the task was completed so the duration timer freezes
    if (task.completed) {
      task.completedAt = Date.now();
    } else {
      delete task.completedAt;
    }
    sortTasksByPriority();
    saveTasks(tasks);
    renderTasks();
  }
}

/**
 * Deletes a task by ID.
 * @param {string} id - Task ID.
 */
function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks(tasks);
  renderTasks();
}

/**
 * Formats a duration in ms into a human-readable short string.
 * <1m → 'just now', <1h → 'Xm', <1d → 'Xh', ≥1d → 'Xd Yh'
 */
function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return 'just now';
  const totalHrs = Math.floor(totalMin / 60);
  if (totalHrs < 1) return `${totalMin}m`;
  const totalDays = Math.floor(totalHrs / 24);
  if (totalDays < 1) return `${totalHrs}h`;
  const remainHrs = totalHrs % 24;
  return remainHrs > 0 ? `${totalDays}d ${remainHrs}h` : `${totalDays}d`;
}

/**
 * Enters inline-edit mode for a task.
 * Allows editing the text and priority while preserving createdAt.
 */
function editTask(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const li = document.querySelector(`.task-item[data-id="${taskId}"]`);
  if (!li) return;

  // Already editing? Don't double-fire
  if (li.querySelector('.edit-input')) return;

  // Replace text span with input
  const textSpan = li.querySelector('.task-text');
  const durationSpan = li.querySelector('.task-duration');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'edit-input';
  input.value = task.text;
  input.setAttribute('aria-label', 'Edit task text');

  // Replace priority badge with a select
  const badge = li.querySelector('.priority-badge');
  const select = document.createElement('select');
  select.className = 'edit-priority-select';
  select.innerHTML = `
    <option value="high"${task.priority === 'high' ? ' selected' : ''}>High</option>
    <option value="medium"${(task.priority || 'medium') === 'medium' ? ' selected' : ''}>Medium</option>
    <option value="low"${task.priority === 'low' ? ' selected' : ''}>Low</option>
  `;

  // Disable drag on this item so text selection works in the edit input
  li.setAttribute('draggable', 'false');

  // Hide original elements
  if (textSpan) textSpan.style.display = 'none';
  if (durationSpan) durationSpan.style.display = 'none';
  if (badge) badge.style.display = 'none';

  // Hide edit & delete buttons during edit
  const editBtn = li.querySelector('.task-edit-btn');
  const deleteBtn = li.querySelector('.task-delete-btn');
  if (editBtn) editBtn.style.display = 'none';
  if (deleteBtn) deleteBtn.style.display = 'none';

  // Insert editing elements
  li.insertBefore(select, textSpan);
  li.insertBefore(input, textSpan);

  // Add save/cancel buttons
  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-save-btn';
  saveBtn.textContent = '✓';
  saveBtn.setAttribute('aria-label', 'Save edit');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-cancel-btn';
  cancelBtn.textContent = '✕';
  cancelBtn.setAttribute('aria-label', 'Cancel edit');

  li.appendChild(saveBtn);
  li.appendChild(cancelBtn);

  input.focus();
  input.select();

  function commitEdit() {
    const newText = input.value.trim();
    if (newText) {
      task.text = newText;
      task.priority = select.value;
      sortTasksByPriority();
      saveTasks(tasks);
    }
    renderTasks();
  }

  function cancelEdit() {
    renderTasks();
  }

  saveBtn.addEventListener('click', commitEdit);
  cancelBtn.addEventListener('click', cancelEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  });
}

/**
 * Renders the task list to the DOM.
 */
function renderTasks() {
  const listEl = document.getElementById('task-list');
  listEl.innerHTML = '';

  if (tasks.length === 0) {
    const emptyEl = document.createElement('li');
    emptyEl.className = 'task-list-empty';
    emptyEl.textContent = 'No tasks yet. Add one above!';
    listEl.appendChild(emptyEl);
    updateTaskKPI();
    updateFocusDisplay();
    return;
  }

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.completed ? ' completed' : '');
    li.dataset.id = task.id;
    li.setAttribute('draggable', 'true');

    // --- Drag-and-drop (reorder) ---
    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = index;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => li.classList.add('dragging'), 0);
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      listEl.querySelectorAll('.task-item').forEach((el) => el.classList.remove('drag-over'));
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      listEl.querySelectorAll('.task-item').forEach((el) => el.classList.remove('drag-over'));
      li.classList.add('drag-over');
    });

    li.addEventListener('dragleave', () => {
      li.classList.remove('drag-over');
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const destIndex = index;
      if (dragSrcIndex === destIndex || dragSrcIndex === -1) return;

      const [moved] = tasks.splice(dragSrcIndex, 1);
      tasks.splice(destIndex, 0, moved);
      dragSrcIndex = -1;
      saveTasks(tasks);
      renderTasks();
    });

    // Drag handle icon
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.innerHTML = '&#8942;&#8942;';
    handle.setAttribute('aria-hidden', 'true');

    // Priority badge
    const priority = task.priority || 'medium';
    const badge = document.createElement('span');
    badge.className = `priority-badge priority-${priority}`;
    badge.textContent = priority.charAt(0).toUpperCase();
    badge.title = priority.charAt(0).toUpperCase() + priority.slice(1) + ' priority';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Mark "${task.text}" as ${task.completed ? 'incomplete' : 'complete'}`);
    checkbox.addEventListener('change', () => toggleTask(task.id));

    // Task text
    const span = document.createElement('span');
    span.className = 'task-text';
    span.textContent = task.text;

    // Duration label
    const durationSpan = document.createElement('span');
    durationSpan.className = 'task-duration';
    // Use completedAt if task is done so the timer doesn't keep ticking
    const endTime = task.completedAt || Date.now();
    durationSpan.textContent = `(${formatDuration(endTime - task.createdAt)})`;

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'task-edit-btn';
    editBtn.innerHTML = '&#x270E;'; // ✎
    editBtn.setAttribute('aria-label', `Edit "${task.text}"`);
    editBtn.addEventListener('click', () => editTask(task.id));

    // Delete button (with animated undo toast)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete-btn';
    deleteBtn.innerHTML = '&#x2715;';
    deleteBtn.setAttribute('aria-label', `Delete "${task.text}"`);
    deleteBtn.addEventListener('click', () => deleteTaskWithUndo(task.id, li));

    li.appendChild(handle);
    li.appendChild(badge);
    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(durationSpan);
    li.appendChild(editBtn);
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });

  updateTaskKPI();
  updateFocusDisplay();
}

/**
 * Updates the KPI counter and progress bar.
 */
function updateTaskKPI() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;

  // KPI spans
  const doneCountEl = document.getElementById('kpi-done-count');
  const totalCountEl = document.getElementById('kpi-total-count');
  if (doneCountEl) doneCountEl.textContent = done;
  if (totalCountEl) totalCountEl.textContent = total;

  // Progress bar
  const fillEl = document.getElementById('task-progress-fill');
  if (fillEl) {
    fillEl.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
  }

  // Clear completed footer (P4-5)
  const footer = document.getElementById('task-card-footer');
  if (footer) {
    if (done > 0) {
      footer.classList.remove('hidden');
    } else {
      footer.classList.add('hidden');
    }
  }
}

/**
 * Initializes the task list: loads from storage and wires events.
 */
async function initTasks() {
  const taskInput = document.getElementById('task-input');
  const addBtn = document.getElementById('task-add-btn');
  const clearBtn = document.getElementById('clear-completed-btn');
  const prioritySelect = document.getElementById('task-priority');

  // Load tasks from storage
  tasks = await loadTasks();
  // Ensure priority sort on load (handles legacy tasks without priority)
  sortTasksByPriority();
  renderTasks();

  // Refresh durations every 60s
  setInterval(() => renderTasks(), 60000);

  // Add task on button click
  addBtn.addEventListener('click', () => {
    addTask(taskInput.value, prioritySelect.value);
    taskInput.value = '';
    prioritySelect.value = 'medium'; // reset to default
    taskInput.focus();
  });

  // Add task on Enter key
  taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addTask(taskInput.value, prioritySelect.value);
      taskInput.value = '';
      prioritySelect.value = 'medium';
    }
  });

  // Clear all completed (P4-5)
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      tasks = tasks.filter((t) => !t.completed);
      saveTasks(tasks);
      renderTasks();
    });
  }
}

/* ============================================
   Toast + Undo (P4-6)
   ============================================ */

let toastTimeout = null;
let pendingDeleteId = null;
let pendingDeleteTask = null;

/**
 * Deletes a task with an animated fade-out and an undo toast.
 * @param {string} id - Task ID.
 * @param {HTMLElement} liEl - The list item element.
 */
function deleteTaskWithUndo(id, liEl) {
  // Cancel any previous pending delete (commit it)
  commitPendingDelete();

  // Save the task for potential undo
  pendingDeleteId = id;
  pendingDeleteTask = tasks.find((t) => t.id === id);

  // Animate out
  liEl.classList.add('removing');
  liEl.addEventListener('animationend', () => {
    // Remove from in-memory array and save immediately
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks(tasks);
    renderTasks();
  }, { once: true });

  // Show undo toast
  showToast(`Task deleted.`, () => {
    // Undo: re-insert task
    if (pendingDeleteTask) {
      tasks.push(pendingDeleteTask);
      sortTasksByPriority();
      saveTasks(tasks);
      renderTasks();
    }
    pendingDeleteId = null;
    pendingDeleteTask = null;
  });
}

/**
 * Commits the pending delete (clears undo state).
 */
function commitPendingDelete() {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
  pendingDeleteId = null;
  pendingDeleteTask = null;
  hideToast();
}

/**
 * Shows the toast notification with optional undo action.
 * @param {string} message - Toast message text.
 * @param {Function} undoFn - Called when user clicks Undo.
 */
function showToast(message, undoFn) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;

  // Clear existing timer
  if (toastTimeout) clearTimeout(toastTimeout);

  // Build toast content
  toastEl.innerHTML = '';
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  toastEl.appendChild(msgSpan);

  if (undoFn) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.setAttribute('aria-label', 'Undo delete');
    undoBtn.addEventListener('click', () => {
      if (toastTimeout) clearTimeout(toastTimeout);
      undoFn();
      hideToast();
    });
    toastEl.appendChild(undoBtn);
  }

  toastEl.classList.remove('hidden');

  toastTimeout = setTimeout(() => {
    hideToast();
    toastTimeout = null;
  }, 4000);
}

/** Hides the toast. */
function hideToast() {
  const toastEl = document.getElementById('toast');
  if (toastEl) toastEl.classList.add('hidden');
}

/* ============================================
   Settings Modal (Phase 3)
   ============================================ */

/**
 * Initializes the settings modal: open/close/escape wiring, name save.
 */
function initSettings() {
  const settingsBtn = document.getElementById('settings-btn');
  const modal = document.getElementById('settings-modal');
  const backdrop = document.getElementById('modal-backdrop');
  const closeBtn = document.getElementById('modal-close-btn');
  const saveNameBtn = document.getElementById('settings-name-save');
  const nameInput = document.getElementById('settings-name');
  const nameFeedback = document.getElementById('name-feedback');
  const exportBtn = document.getElementById('data-export-btn');
  const importBtn = document.getElementById('data-import-btn');
  const importInput = document.getElementById('data-import-file');
  const backupFeedback = document.getElementById('backup-feedback');

  // Open modal (P3-11)
  settingsBtn.addEventListener('click', () => openModal());

  // Close via ✕ button (P3-12)
  closeBtn.addEventListener('click', () => closeModal());

  // Close via backdrop click (P3-12)
  backdrop.addEventListener('click', () => closeModal());

  // Close via Escape key (P3-13)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Save name (P3-6)
  saveNameBtn.addEventListener('click', () => saveName());
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveName();
  });

  exportBtn?.addEventListener('click', exportBackupData);
  importBtn?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      importBackupData(file);
      e.target.value = '';
    }
  });

  function openModal() {
    // Pre-populate name field (P3-7)
    chrome.storage.local.get(['displayName'], async (result) => {
      if (result.displayName) {
        nameInput.value = result.displayName;
      } else {
        nameInput.value = await getDefaultName();
      }
    });
    if (nameFeedback) nameFeedback.classList.add('hidden');
    if (backupFeedback) backupFeedback.classList.add('hidden');
    modal.classList.remove('hidden');
    nameInput.focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  function saveName() {
    const newName = nameInput.value.trim();
    if (!newName) return;

    chrome.storage.local.set({ displayName: newName }, () => {
      // Update greeting immediately (P3-6)
      const greetingEl = document.getElementById('greeting');
      if (greetingEl) {
        greetingEl.textContent = `${getGreeting()}, ${newName}`;
      }

      // Show feedback
      if (nameFeedback) {
        nameFeedback.classList.remove('hidden');
        setTimeout(() => nameFeedback.classList.add('hidden'), 2000);
      }
    });
  }

  function showSettingsFeedback(message) {
    if (!backupFeedback) return;
    backupFeedback.textContent = message;
    backupFeedback.classList.remove('hidden');
    clearTimeout(backupFeedback._hideTimer);
    backupFeedback._hideTimer = setTimeout(() => backupFeedback.classList.add('hidden'), 2500);
  }

  function exportBackupData() {
    chrome.storage.local.get(['displayName', 'wallpaper', 'tasks', 'shortcuts'], (result) => {
      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        displayName: result.displayName || '',
        wallpaper: result.wallpaper || null,
        tasks: Array.isArray(result.tasks) ? result.tasks : [],
        shortcuts: Array.isArray(result.shortcuts) ? result.shortcuts : []
      };

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `personal-focus-board-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showSettingsFeedback('✓ Backup exported');
    });
  }

  function importBackupData(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const backup = parsed && typeof parsed === 'object' ? parsed : null;
        if (!backup) throw new Error('Invalid backup file');

        const payload = {};
        const nestedData = backup.data && typeof backup.data === 'object' ? backup.data : null;
        const source = nestedData || backup;

        if (typeof source.displayName === 'string') payload.displayName = source.displayName;
        if (typeof source.wallpaper === 'string') payload.wallpaper = source.wallpaper;
        if (Array.isArray(source.tasks)) payload.tasks = source.tasks;
        if (Array.isArray(source.shortcuts)) payload.shortcuts = source.shortcuts;

        if (Object.keys(payload).length === 0) {
          throw new Error('No supported backup data found');
        }

        chrome.storage.local.set(payload, () => {
          if (payload.displayName !== undefined) {
            const greetingEl = document.getElementById('greeting');
            if (greetingEl) {
              greetingEl.textContent = `${getGreeting()}, ${payload.displayName}`;
            }
          }

          if (payload.wallpaper !== undefined) {
            if (payload.wallpaper) {
              applyWallpaper(payload.wallpaper);
            } else {
              document.body.style.backgroundImage = "url('assets/default-wallpaper.jpg')";
            }
          }

          if (Array.isArray(payload.tasks)) {
            tasks = payload.tasks;
            sortTasksByPriority();
            renderTasks();
          }

          if (Array.isArray(payload.shortcuts)) {
            shortcuts = payload.shortcuts;
            renderShortcuts();
          }

          showSettingsFeedback('✓ Backup imported');
        });
      } catch (error) {
        showSettingsFeedback('✕ Invalid backup file');
      }
    };

    reader.onerror = () => {
      showSettingsFeedback('✕ Could not read backup file');
    };

    reader.readAsText(file);
  }
}

/* ============================================
   Wallpaper (Phase 3 — P3-9, P3-10)
   ============================================ */

/**
 * Initializes wallpaper on load and sets up upload + reset.
 */
function initWallpaper() {
  const uploadInput = document.getElementById('wallpaper-upload');
  const uploadArea = document.getElementById('wallpaper-upload-area');
  const previewWrap = document.getElementById('wallpaper-preview-wrap');
  const previewImg = document.getElementById('wallpaper-preview');
  const resetBtn = document.getElementById('wallpaper-reset-btn');
  const uploadLabelText = document.getElementById('upload-label-text');
  const wallpaperFeedback = document.getElementById('wallpaper-feedback');

  // Load saved wallpaper on page open (P3-10)
  chrome.storage.local.get(['wallpaper'], (result) => {
    if (result.wallpaper) {
      applyWallpaper(result.wallpaper);
    }
  });

  // Also show preview if modal opens while wallpaper is set
  chrome.storage.local.get(['wallpaper'], (result) => {
    if (result.wallpaper && previewImg && previewWrap) {
      previewImg.src = result.wallpaper;
      previewWrap.classList.remove('hidden');
      if (uploadLabelText) uploadLabelText.textContent = 'Change wallpaper';
    }
  });

  // Handle file selection (P3-9)
  if (uploadInput) {
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) processWallpaperFile(file);
    });
  }

  // Drag-over styling
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) processWallpaperFile(file);
    });
  }

  // Reset to default (P3-10)
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      chrome.storage.local.remove('wallpaper', () => {
        document.body.style.backgroundImage = "url('assets/default-wallpaper.jpg')";
        if (previewWrap) previewWrap.classList.add('hidden');
        if (uploadLabelText) uploadLabelText.textContent = 'Click or drag an image to upload';
        if (uploadInput) uploadInput.value = '';
        showWallpaperFeedback('✓ Reset to default wallpaper!');
      });
    });
  }

  function processWallpaperFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;

      // Save & apply
      chrome.storage.local.set({ wallpaper: dataUrl }, () => {
        applyWallpaper(dataUrl);

        // Update preview
        if (previewImg) previewImg.src = dataUrl;
        if (previewWrap) previewWrap.classList.remove('hidden');
        if (uploadLabelText) uploadLabelText.textContent = 'Change wallpaper';

        showWallpaperFeedback('✓ Wallpaper updated!');
      });
    };
    reader.readAsDataURL(file);
  }

  function showWallpaperFeedback(msg) {
    if (!wallpaperFeedback) return;
    wallpaperFeedback.textContent = msg;
    wallpaperFeedback.classList.remove('hidden');
    setTimeout(() => wallpaperFeedback.classList.add('hidden'), 2500);
  }
}

/**
 * Applies a wallpaper data URL or path to the body background.
 * @param {string} src - Data URL or file path.
 */
function applyWallpaper(src) {
  document.body.style.backgroundImage = `url('${src}')`;
}

/* ============================================
   Quick-launch Shortcuts (Phase 5)
   ============================================ */

/** Default empty shortcuts array (5 slots). */
const DEFAULT_SHORTCUTS = [
  null, null, null, null, null
];

/** In-memory shortcuts array. */
let shortcuts = [...DEFAULT_SHORTCUTS];

/** Currently open edit popup element (if any). */
let activeShortcutPopup = null;

/**
 * Returns a favicon URL for a given site URL.
 * Uses Google's public favicon service.
 */
function getFaviconUrl(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return null;
  }
}

/**
 * Normalizes a user-entered URL (adds https:// if missing).
 */
function normalizeUrl(input) {
  let url = input.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

/**
 * Extracts a short display name from a URL (e.g. "google.com" → "Google").
 */
function getShortcutName(url) {
  try {
    const u = new URL(url);
    // Remove www. prefix and get hostname
    const host = u.hostname.replace(/^www\./, '');
    // Take the first part before the TLD
    const parts = host.split('.');
    const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return 'Link';
  }
}

/**
 * Loads shortcuts from chrome.storage.local.
 */
function loadShortcuts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['shortcuts'], (result) => {
      resolve(result.shortcuts || [...DEFAULT_SHORTCUTS]);
    });
  });
}

/**
 * Saves shortcuts to chrome.storage.local.
 */
function saveShortcuts() {
  chrome.storage.local.set({ shortcuts });
}

/**
 * Renders all 5 shortcut circles based on current data.
 */
function renderShortcuts() {
  const circles = document.querySelectorAll('.shortcut-circle');
  circles.forEach((circle, i) => {
    const data = shortcuts[i];
    circle.innerHTML = '';

    if (data && data.url) {
      // Show favicon
      const favicon = document.createElement('img');
      favicon.className = 'shortcut-favicon';
      favicon.src = getFaviconUrl(data.url);
      favicon.alt = data.name || 'Shortcut';
      favicon.onerror = () => {
        // Fallback: show first letter
        favicon.style.display = 'none';
        const letter = document.createElement('span');
        letter.style.cssText = 'font-size:0.85rem;font-weight:600;color:rgba(255,255,255,0.7);';
        letter.textContent = (data.name || 'L').charAt(0).toUpperCase();
        circle.appendChild(letter);
      };
      circle.appendChild(favicon);

      // Hover label
      const label = document.createElement('span');
      label.className = 'shortcut-label';
      label.textContent = data.name || getShortcutName(data.url);
      circle.appendChild(label);

      circle.href = data.url;
      circle.title = data.name || data.url;
      circle.setAttribute('aria-label', `Open ${data.name || data.url}`);
    } else {
      // Empty slot — show +
      const plus = document.createElement('span');
      plus.className = 'shortcut-plus';
      plus.textContent = '+';
      circle.appendChild(plus);

      circle.href = '#';
      circle.title = 'Add shortcut';
      circle.setAttribute('aria-label', `Add shortcut ${i + 1}`);
    }
  });
}

/**
 * Shows the edit popup for a shortcut at the given index.
 */
function showShortcutEditPopup(index, anchorEl) {
  // Close any existing popup
  closeShortcutPopup();

  const data = shortcuts[index];
  const rect = anchorEl.getBoundingClientRect();

  const popup = document.createElement('div');
  popup.className = 'shortcut-edit-popup';

  // Position below the circle
  popup.style.top = `${rect.bottom + 8}px`;
  popup.style.left = `${Math.max(8, rect.left - 100)}px`;

  popup.innerHTML = `
    <label for="shortcut-name-input">Name</label>
    <input type="text" id="shortcut-name-input" placeholder="e.g. Google" value="${data ? (data.name || '') : ''}" autocomplete="off" spellcheck="false">
    <label for="shortcut-url-input">URL</label>
    <input type="text" id="shortcut-url-input" placeholder="e.g. google.com" value="${data ? (data.url || '') : ''}" autocomplete="off" spellcheck="false">
    <div class="shortcut-edit-actions">
      ${data && data.url ? '<button class="shortcut-remove-btn" type="button">Remove</button>' : ''}
      <button class="shortcut-cancel-btn" type="button">Cancel</button>
      <button class="shortcut-save-btn" type="button">Save</button>
    </div>
  `;

  document.body.appendChild(popup);
  activeShortcutPopup = popup;

  // Focus the URL input if empty, else name
  const urlInput = popup.querySelector('#shortcut-url-input');
  const nameInput = popup.querySelector('#shortcut-name-input');
  if (!urlInput.value) {
    urlInput.focus();
  } else {
    nameInput.focus();
    nameInput.select();
  }

  // Save handler
  popup.querySelector('.shortcut-save-btn').addEventListener('click', () => {
    const rawUrl = urlInput.value.trim();
    const url = normalizeUrl(rawUrl);
    const name = nameInput.value.trim() || getShortcutName(url);

    if (url) {
      shortcuts[index] = { url, name };
    } else {
      shortcuts[index] = null;
    }
    saveShortcuts();
    renderShortcuts();
    closeShortcutPopup();
  });

  // Cancel handler
  popup.querySelector('.shortcut-cancel-btn').addEventListener('click', () => {
    closeShortcutPopup();
  });

  // Remove handler
  const removeBtn = popup.querySelector('.shortcut-remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      shortcuts[index] = null;
      saveShortcuts();
      renderShortcuts();
      closeShortcutPopup();
    });
  }

  // Enter to save in either input
  [nameInput, urlInput].forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        popup.querySelector('.shortcut-save-btn').click();
      }
      if (e.key === 'Escape') {
        closeShortcutPopup();
      }
    });
  });

  // Close when clicking outside
  setTimeout(() => {
    document.addEventListener('mousedown', handleOutsideClick);
  }, 0);
}

/**
 * Closes the active shortcut edit popup.
 */
function closeShortcutPopup() {
  if (activeShortcutPopup) {
    activeShortcutPopup.remove();
    activeShortcutPopup = null;
  }
  document.removeEventListener('mousedown', handleOutsideClick);
}

/**
 * Handles clicks outside the shortcut popup to close it.
 */
function handleOutsideClick(e) {
  if (activeShortcutPopup && !activeShortcutPopup.contains(e.target)) {
    closeShortcutPopup();
  }
}

/**
 * Initializes shortcuts: loads from storage, renders, wires events.
 */
async function initShortcuts() {
  shortcuts = await loadShortcuts();
  renderShortcuts();

  // Wire click and right-click on each circle
  const circles = document.querySelectorAll('.shortcut-circle');
  circles.forEach((circle) => {
    // Left-click: open URL if configured, else show edit popup
    circle.addEventListener('click', (e) => {
      e.preventDefault();
      const idx = parseInt(circle.dataset.index, 10);
      const data = shortcuts[idx];
      if (data && data.url) {
        window.open(data.url, '_self');
      } else {
        showShortcutEditPopup(idx, circle);
      }
    });

    // Right-click: always show edit popup
    circle.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = parseInt(circle.dataset.index, 10);
      showShortcutEditPopup(idx, circle);
    });
  });
}
