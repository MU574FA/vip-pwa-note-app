// ── IndexedDB Setup ──────────────────────────────────────────────
const DB_NAME = 'NotesDB';
const DB_VERSION = 1;
const STORE = 'notes';
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs once when DB is created or version changes
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        // Create a "notes" store with auto-incrementing id
        const store = database.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror  = (e) => reject(e.target.error);
  });
}

// ── CRUD Operations ──────────────────────────────────────────────

function addNote(title, body) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const note = { title, body, createdAt: new Date().toISOString() };
    const req = store.add(note);
    req.onsuccess = () => resolve(req.result); // returns new id
    req.onerror   = () => reject(req.error);
  });
}

function getAllNotes() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.reverse()); // newest first
    req.onerror   = () => reject(req.error);
  });
}

function updateNote(id, title, body) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const note = req.result;
      note.title = title;
      note.body  = body;
      note.updatedAt = new Date().toISOString();
      const putReq = store.put(note);
      putReq.onsuccess = () => resolve();
      putReq.onerror   = () => reject(putReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function deleteNote(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── UI Helpers ───────────────────────────────────────────────────

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function renderNotes(notes) {
  const list = document.getElementById('notes-list');
  const count = document.getElementById('note-count');
  count.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;

  if (notes.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="icon">📝</span>
        <p>No notes yet.<br>Tap <strong>+</strong> to create your first one.</p>
      </div>`;
    return;
  }

  list.innerHTML = notes.map(note => `
    <div class="note-card" data-id="${note.id}">
      <div class="note-title">${escapeHtml(note.title || 'Untitled')}</div>
      <div class="note-preview">${escapeHtml(note.body || '')}</div>
      <div class="note-date">${formatDate(note.createdAt)}</div>
      <div class="note-actions">
        <button class="btn-edit" data-id="${note.id}">Edit</button>
        <button class="btn-delete" data-id="${note.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function refreshList(filter = '') {
  const notes = await getAllNotes();
  const filtered = filter
    ? notes.filter(n =>
        n.title.toLowerCase().includes(filter) ||
        n.body.toLowerCase().includes(filter))
    : notes;
  renderNotes(filtered);
}

// ── Modal ────────────────────────────────────────────────────────

let editingId = null;

function openModal(note = null) {
  editingId = note ? note.id : null;
  document.getElementById('modal-title').textContent = note ? 'EDIT NOTE' : 'NEW NOTE';
  document.getElementById('note-title-input').value = note ? note.title : '';
  document.getElementById('note-body-input').value  = note ? note.body  : '';
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('note-title-input').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}

// ── Event Listeners ──────────────────────────────────────────────

document.getElementById('fab').addEventListener('click', () => openModal());
document.getElementById('close-modal').addEventListener('click', closeModal);

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

document.getElementById('save-note').addEventListener('click', async () => {
  const title = document.getElementById('note-title-input').value.trim();
  const body  = document.getElementById('note-body-input').value.trim();

  if (!title && !body) {
    showToast('Write something first!');
    return;
  }

  if (editingId !== null) {
    await updateNote(editingId, title, body);
    showToast('Note updated ✓');
  } else {
    await addNote(title, body);
    showToast('Note saved ✓');
  }

  closeModal();
  refreshList(document.getElementById('search-input').value.toLowerCase());
});

// Delegate edit/delete button clicks
document.getElementById('notes-list').addEventListener('click', async (e) => {
  const id = parseInt(e.target.dataset.id);
  if (!id) return;

  if (e.target.classList.contains('btn-delete')) {
    if (confirm('Delete this note?')) {
      await deleteNote(id);
      showToast('Note deleted');
      refreshList(document.getElementById('search-input').value.toLowerCase());
    }
  }

  if (e.target.classList.contains('btn-edit')) {
    // Fetch the note to pre-fill the modal
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => openModal(req.result);
  }
});

// Search
document.getElementById('search-input').addEventListener('input', (e) => {
  refreshList(e.target.value.toLowerCase());
});

// ── Register Service Worker ──────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('Service Worker registered ✓'))
    .catch(err => console.warn('SW error:', err));
}

// ── Boot ─────────────────────────────────────────────────────────

openDB().then(database => {
  db = database;
  refreshList();
}).catch(err => {
  console.error('IndexedDB failed to open:', err);
});
