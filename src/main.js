const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { writeText } = window.__TAURI__.clipboardManager;
const { getCurrentWindow } = window.__TAURI__.window;

const appWindow = getCurrentWindow();

document.getElementById('btn-minimize').addEventListener('click', () => appWindow.minimize());
document.getElementById('btn-maximize').addEventListener('click', async () => {
  const maximized = await appWindow.isMaximized();
  maximized ? appWindow.unmaximize() : appWindow.maximize();
});
document.getElementById('btn-close').addEventListener('click', () => appWindow.close());

document.getElementById('titlebar').addEventListener('mousedown', (e) => {
  if (e.target.closest('#titlebar-controls')) return;
  appWindow.startDragging();
});

appWindow.onResized(async () => {
  const maximized = await appWindow.isMaximized();
  const btn = document.getElementById('btn-maximize');
  const L = LANGS[currentLang];
  btn.innerHTML = maximized ? '&#10066;' : '&#9633;';
  btn.title = maximized ? L.titleRestore : L.titleMaximize;
});

const FOLDER_KEY = 'snippets_folder';
const LANG_KEY = 'snippets_lang';

let folder = localStorage.getItem(FOLDER_KEY) || '';
let snippets = [];
let editingFilename = '';
let activeTagFilter = null;
let currentLang = localStorage.getItem(LANG_KEY) || 'en';

const searchEl = document.getElementById('search');
const tbody = document.getElementById('snippets-body');
const emptyState = document.getElementById('empty-state');
const folderDisplay = document.getElementById('folder-display');
const overlay = document.getElementById('modal-overlay');
const mTitle = document.getElementById('m-title');
const mTag = document.getElementById('m-tag');
const mContent = document.getElementById('m-content');
const modalTitle = document.getElementById('modal-title');
const toast = document.getElementById('toast');
const tagBar = document.getElementById('tag-bar');
const aboutOverlay = document.getElementById('about-overlay');
const aboutAuthor = document.getElementById('about-author');
const aboutKofiLabel = document.getElementById('about-kofi-label');

const LANGS = {
  en: {
    noFolder: 'No folder',
    searchPlaceholder: 'Search…',
    colTag: 'Tag',
    colName: 'Name',
    colContent: 'Content',
    emptyState: 'No snippets.',
    newRecord: 'New snippet',
    editRecord: 'Edit snippet',
    labelName: 'Name',
    labelTag: 'Tag',
    labelContent: 'Content',
    btnCancel: 'Cancel',
    btnSave: 'Save',
    copied: 'Copied!',
    titleDelete: 'Delete',
    titlePickFolder: 'Select folder',
    titleNew: 'New snippet',
    titleMinimize: 'Minimize',
    titleMaximize: 'Maximize',
    titleRestore: 'Restore',
    titleClose: 'Close',
    alertNoFolder: 'Select a folder first.',
    confirmDelete: (t) => `Delete snippet "${t}"?`,
    aboutClose: 'Close',
    author: 'Created by',
    authorLink: 'Luko Karavan',
    authorHref: 'https://ko-fi.com/karavan/shop',
    kofiLabel: 'Buy him a coffee:',
    kofiHref: 'https://ko-fi.com/karavan',
    desc: 'Click content to copy · Click name to edit',
  },
  cz: {
    noFolder: 'Žádná složka',
    searchPlaceholder: 'Hledat…',
    colTag: 'Tag',
    colName: 'Název',
    colContent: 'Obsah',
    emptyState: 'Žádné záznamy.',
    newRecord: 'Nový záznam',
    editRecord: 'Upravit záznam',
    labelName: 'Název',
    labelTag: 'Tag',
    labelContent: 'Obsah',
    btnCancel: 'Zrušit',
    btnSave: 'Uložit',
    copied: 'Zkopírováno!',
    titleDelete: 'Smazat',
    titlePickFolder: 'Vybrat složku',
    titleNew: 'Nový záznam',
    titleMinimize: 'Minimalizovat',
    titleMaximize: 'Maximalizovat',
    titleRestore: 'Obnovit',
    titleClose: 'Zavřít',
    alertNoFolder: 'Nejprve vyber složku.',
    confirmDelete: (t) => `Smazat záznam "${t}"?`,
    aboutClose: 'Zrušit',
    author: 'Vytvořil',
    authorLink: 'Luko Karavan',
    authorHref: 'https://www.lukokaravan.cz/',
    kofiLabel: 'Můžete mu koupit kafe:',
    kofiHref: 'https://ko-fi.com/karavan',
    desc: 'Klik na obsah = kopírovat · Klik na název = upravit',
  },
};

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  const L = LANGS[lang];

  searchEl.placeholder = L.searchPlaceholder;
  document.getElementById('th-tag').textContent = L.colTag;
  document.getElementById('th-name').textContent = L.colName;
  document.getElementById('th-content').textContent = L.colContent;
  emptyState.textContent = L.emptyState;
  document.getElementById('lbl-name').textContent = L.labelName;
  document.getElementById('lbl-tag').textContent = L.labelTag;
  document.getElementById('lbl-content').textContent = L.labelContent;
  document.getElementById('btn-cancel').textContent = L.btnCancel;
  document.getElementById('btn-save').textContent = L.btnSave;
  document.getElementById('btn-pick-folder').title = L.titlePickFolder;
  document.getElementById('btn-new').title = L.titleNew;
  document.getElementById('btn-minimize').title = L.titleMinimize;
  document.getElementById('btn-close').title = L.titleClose;
  document.getElementById('btn-about-close').title = L.aboutClose;
  document.getElementById('about-desc').textContent = L.desc;

  aboutAuthor.innerHTML = '';
  aboutAuthor.appendChild(document.createTextNode(L.author + '\u00a0'));
  const a = document.createElement('a');
  a.href = '#';
  a.textContent = L.authorLink;
  a.addEventListener('click', (e) => { e.preventDefault(); openExternal(L.authorHref); });
  aboutAuthor.appendChild(a);

  aboutKofiLabel.textContent = L.kofiLabel;

  document.querySelectorAll('.lang-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.lang === lang);
  });

  updateFolderDisplay();
  renderTable();
}

function updateFolderDisplay() {
  const L = LANGS[currentLang];
  if (folder) {
    folderDisplay.textContent = folder;
    folderDisplay.classList.add('has-folder');
  } else {
    folderDisplay.textContent = L.noFolder;
    folderDisplay.classList.remove('has-folder');
  }
}

async function loadSnippets() {
  if (!folder) return;
  try {
    snippets = await invoke('list_snippets', { folder });
    renderTagBar();
    renderTable();
  } catch (e) {
    console.error(e);
  }
}

function getTagTree() {
  const roots = new Map();
  for (const s of snippets) {
    if (!s.tag) continue;
    const parts = s.tag.split('/');
    const root = parts[0];
    if (!roots.has(root)) roots.set(root, new Set());
    if (parts.length > 1) roots.get(root).add(parts.slice(1).join('/'));
  }
  return roots;
}

function renderTagBar() {
  tagBar.innerHTML = '';
  const tree = getTagTree();
  if (tree.size === 0) return;

  for (const [root, children] of tree) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = root;
    chip.dataset.tag = root;

    if (activeTagFilter === root) chip.classList.add('active');
    else if (activeTagFilter && activeTagFilter.startsWith(root + '/')) chip.classList.add('parent-active');

    chip.addEventListener('click', () => {
      activeTagFilter = activeTagFilter === root ? null : root;
      renderTagBar();
      renderTable();
    });
    tagBar.appendChild(chip);

    if (children.size > 0 && (activeTagFilter === root || (activeTagFilter && activeTagFilter.startsWith(root + '/')))) {
      for (const child of children) {
        const fullTag = root + '/' + child;
        const sub = document.createElement('span');
        sub.className = 'tag-chip';
        sub.textContent = '  /' + child;
        sub.dataset.tag = fullTag;
        if (activeTagFilter === fullTag) sub.classList.add('active');
        sub.addEventListener('click', (e) => {
          e.stopPropagation();
          activeTagFilter = activeTagFilter === fullTag ? root : fullTag;
          renderTagBar();
          renderTable();
        });
        tagBar.appendChild(sub);
      }
    }
  }
}

function renderTable() {
  tbody.innerHTML = '';
  const L = LANGS[currentLang];
  const query = searchEl.value.toLowerCase().trim();

  let filtered = snippets;

  if (activeTagFilter) {
    filtered = filtered.filter(s =>
      s.tag === activeTagFilter || s.tag.startsWith(activeTagFilter + '/')
    );
  }

  if (query) {
    filtered = filtered.filter(s =>
      s.title.toLowerCase().includes(query) ||
      s.tag.toLowerCase().includes(query) ||
      s.content.toLowerCase().includes(query)
    );
  }

  emptyState.style.display = filtered.length === 0 ? 'block' : 'none';

  for (const s of filtered) {
    const tr = document.createElement('tr');

    const tagParts = s.tag ? s.tag.split('/') : [];
    const tagHtml = tagParts.length > 1
      ? `<span class="tag-badge">${esc(tagParts[0])}<span class="tag-badge-leaf">/${esc(tagParts.slice(1).join('/'))}</span></span>`
      : s.tag ? `<span class="tag-badge">${esc(s.tag)}</span>` : '';

    const tdTag = document.createElement('td');
    tdTag.className = 'col-tag';
    tdTag.innerHTML = tagHtml;
    if (s.tag) {
      tdTag.style.cursor = 'pointer';
      tdTag.addEventListener('click', () => {
        activeTagFilter = activeTagFilter === s.tag ? null : s.tag;
        renderTagBar();
        renderTable();
      });
    }

    const tdTitle = document.createElement('td');
    tdTitle.className = 'col-name';
    tdTitle.textContent = s.title;
    tdTitle.style.cursor = 'pointer';
    tdTitle.addEventListener('click', () => openModal(s));

    const tdContent = document.createElement('td');
    tdContent.className = 'col-content';
    tdContent.textContent = s.content.replace(/\n/g, ' ');
    tdContent.style.cursor = 'pointer';
    tdContent.addEventListener('click', async () => {
      await writeText(s.content);
      showToast();
    });

    const tdActions = document.createElement('td');
    tdActions.className = 'col-actions';

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-icon btn-delete';
    btnDelete.title = L.titleDelete;
    btnDelete.innerHTML = '&#10005;';
    btnDelete.addEventListener('click', async () => {
      if (!confirm(L.confirmDelete(s.title))) return;
      await invoke('delete_snippet', { folder, filename: s.filename });
      await loadSnippets();
    });

    tdActions.append(btnDelete);
    tr.append(tdTag, tdTitle, tdContent, tdActions);
    tbody.appendChild(tr);
  }
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast() {
  toast.textContent = LANGS[currentLang].copied;
  toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add('hidden'), 1600);
}

function openModal(snippet = null) {
  const L = LANGS[currentLang];
  if (snippet) {
    modalTitle.textContent = L.editRecord;
    mTitle.value = snippet.title;
    mTag.value = snippet.tag;
    mContent.value = snippet.content;
    editingFilename = snippet.filename;
  } else {
    modalTitle.textContent = L.newRecord;
    mTitle.value = '';
    mTag.value = activeTagFilter || '';
    mContent.value = '';
    editingFilename = '';
  }
  overlay.classList.remove('hidden');
  mTitle.focus();
}

function closeModal() {
  overlay.classList.add('hidden');
}

async function openExternal(url) {
  try {
    await invoke('plugin:opener|open_url', { url });
  } catch (e) {
    console.error('openExternal failed:', e);
  }
}

document.getElementById('btn-pick-folder').addEventListener('click', async () => {
  const selected = await open({ directory: true, multiple: false });
  if (selected) {
    folder = selected;
    localStorage.setItem(FOLDER_KEY, folder);
    updateFolderDisplay();
    await loadSnippets();
  }
});

document.getElementById('btn-new').addEventListener('click', () => {
  if (!folder) { alert(LANGS[currentLang].alertNoFolder); return; }
  openModal();
});

searchEl.addEventListener('input', () => renderTable());

document.getElementById('btn-save').addEventListener('click', async () => {
  const title = mTitle.value.trim();
  const tag = mTag.value.trim();
  const content = mContent.value;
  if (!title) { mTitle.focus(); return; }
  await invoke('save_snippet', {
    folder,
    oldFilename: editingFilename,
    title,
    tag,
    content,
  });
  closeModal();
  await loadSnippets();
});

document.getElementById('btn-cancel').addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    aboutOverlay.classList.add('hidden');
  }
});

document.getElementById('btn-about').addEventListener('click', () => {
  aboutOverlay.classList.remove('hidden');
});

document.getElementById('btn-about-close').addEventListener('click', () => {
  aboutOverlay.classList.add('hidden');
});

aboutOverlay.addEventListener('click', (e) => {
  if (e.target === aboutOverlay) aboutOverlay.classList.add('hidden');
});

document.getElementById('btn-kofi').addEventListener('click', () => {
  openExternal(LANGS[currentLang].kofiHref);
});

document.querySelectorAll('.lang-opt').forEach(el => {
  el.addEventListener('click', () => setLang(el.dataset.lang));
});

setLang(currentLang);
loadSnippets();