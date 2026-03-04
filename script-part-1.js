// ============================================================
// XCYBER SCRIPT PART 1 — Core, GitHub API, Token Manager, Editor
// https://kbsigmaboy67.github.io/xc/script-part-1.js
// ============================================================

'use strict';

// ============================================================
//  ██████╗ ███████╗███████╗ █████╗ ██╗   ██╗██╗  ████████╗
//  ██╔══██╗██╔════╝██╔════╝██╔══██╗██║   ██║██║  ╚══██╔══╝
//  ██║  ██║█████╗  █████╗  ███████║██║   ██║██║     ██║
//  ██║  ██║██╔══╝  ██╔══╝  ██╔══██║██║   ██║██║     ██║
//  ██████╔╝███████╗██║     ██║  ██║╚██████╔╝███████╗██║
//  ╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝
//
//  DEFAULT TOKENS — auto-load on page start
//  Paste your base64-encoded token(s) below.
//
//  How to encode:
//    btoa("github_pat_yourTokenHere")   ← run in browser console
//    btoa("ghp_yourClassicTokenHere")
//    or use xcyber_ format directly (no btoa needed for those)
//
//  One string per entry. All will be loaded automatically.
//  These are decoded client-side only — never stored or sent
//  anywhere except directly to api.github.com.
// ============================================================

const DEFAULT_TOKENS = [
  // Paste your base64-encoded token(s) here, e.g.:
  // "Z2hwX3h4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4",
  // "Z2l0aHViX3BhdF94eHh4eHh4eHh4eHh4eA==",
  // xcyber_ tokens can also go here WITHOUT btoa:
  // "xcyber_ab3cd:ef$gh/ij",
];

// ── AUTO-LOAD DEFAULT TOKENS ON STARTUP ──
async function loadDefaultTokens() {
  if (!DEFAULT_TOKENS.length) return;
  for (const entry of DEFAULT_TOKENS) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      // xcyber_ tokens are not base64 — load directly
      const raw = trimmed.startsWith('xcyber_') ? trimmed : atob(trimmed);
      await TOK._addToken(raw.trim());
    } catch (e) {
      console.warn('XCYBER: Failed to load default token:', e.message);
    }
  }
}
// ============================================================

// ── GLOBAL STATE ──
const STATE = {
  tokens: [],           // {raw, type, user, repos, scopes, id}
  activeTokenIdx: 0,
  repos: [],
  activeRepo: null,
  activeBranch: 'main',
  fileTree: [],
  openFiles: {},        // path → {content, sha, dirty, lang}
  activeFile: null,
  pendingCommits: {},   // path → content
  settings: {},
  veElements: [],
  veSelected: null,
  veIdCounter: 0,
};

// ── XCYBER TOKEN ENCODING/DECODING ──
const XCYBER_MAP = {
  encode: {'1':':','5':'/','2':'$','A':'@','_':'-','0':'!','3':'#','4':'%','6':'^','7':'&','8':'*','9':'(','B':')'},
  decode: {':':'1','/':'5','$':'2','@':'A','-':'_','!':'0','#':'3','%':'4','^':'6','&':'7','*':'8','(':'9',')':'B'},
};

function xcyberEncode(token) {
  // Strip prefix, encode substitutions
  let core = token.replace(/^github_pat_/, '').replace(/^ghp_/,'').replace(/^ghs_/,'');
  let encoded = '';
  for (const ch of core) {
    encoded += XCYBER_MAP.encode[ch] !== undefined ? XCYBER_MAP.encode[ch] : ch;
  }
  return 'xcyber_' + encoded;
}

function xcyberDecode(xcyberToken) {
  let core = xcyberToken.replace(/^xcyber_/, '');
  let decoded = '';
  for (const ch of core) {
    decoded += XCYBER_MAP.decode[ch] !== undefined ? XCYBER_MAP.decode[ch] : ch;
  }
  // Try to detect original prefix
  if (decoded.length === 40) return 'ghp_' + decoded;
  return 'github_pat_' + decoded;
}

function detectTokenType(raw) {
  if (!raw) return null;
  if (raw.startsWith('xcyber_')) return 'xcyber';
  if (raw.startsWith('github_pat_')) return 'fine-grain';
  if (raw.startsWith('ghp_')) return 'classic';
  if (raw.startsWith('ghs_')) return 'server-to-server';
  if (raw.startsWith('gho_')) return 'oauth';
  return 'unknown';
}

function resolveToken(raw) {
  // Returns the actual GitHub token string
  const t = detectTokenType(raw);
  if (t === 'xcyber') return xcyberDecode(raw);
  return raw;
}

// ── GITHUB API ──
const GH = {
  BASE: 'https://api.github.com',

  async req(path, opts = {}, tokenOverride = null) {
    const token = tokenOverride || STATE.tokens[STATE.activeTokenIdx]?.raw;
    if (!token) throw new Error('No token loaded');
    const resolved = resolveToken(token);
    const headers = {
      'Authorization': `Bearer ${resolved}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    };
    const res = await fetch(GH.BASE + path, { ...opts, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`GitHub ${res.status}: ${err.message}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  async getUser() { return GH.req('/user'); },
  async getRateLimit() { return GH.req('/rate_limit'); },

  async listRepos(page = 1) {
    return GH.req(`/user/repos?per_page=100&page=${page}&sort=updated&type=all`);
  },

  async getRepo(owner, repo) { return GH.req(`/repos/${owner}/${repo}`); },

  async listContents(owner, repo, path = '', branch = 'main') {
    return GH.req(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  },

  async getFile(owner, repo, path, branch = 'main') {
    return GH.req(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  },

  async createOrUpdateFile(owner, repo, path, content, message, sha = null, branch = 'main') {
    const body = {
      message, branch,
      content: btoa(unescape(encodeURIComponent(content))),
    };
    if (sha) body.sha = sha;
    const s = STATE.settings;
    if (s.gitName) body.committer = { name: s.gitName, email: s.gitEmail || 'xcyber@users.noreply.github.com' };
    return GH.req(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async deleteFile(owner, repo, path, sha, message, branch = 'main') {
    return GH.req(`/repos/${owner}/${repo}/contents/${path}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch }),
    });
  },

  async listBranches(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/branches?per_page=100`);
  },

  async createBranch(owner, repo, name, sha) {
    return GH.req(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha }),
    });
  },

  async getRef(owner, repo, branch) {
    return GH.req(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  },

  async listReleases(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/releases?per_page=20`);
  },

  async getPages(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/pages`).catch(() => null);
  },

  async enablePages(owner, repo, branch, path) {
    return GH.req(`/repos/${owner}/${repo}/pages`, {
      method: 'POST',
      body: JSON.stringify({ source: { branch, path: path === '/ (root)' ? '/' : path } }),
    });
  },

  async updatePages(owner, repo, branch, path) {
    return GH.req(`/repos/${owner}/${repo}/pages`, {
      method: 'PUT',
      body: JSON.stringify({ source: { branch, path: path === '/ (root)' ? '/' : path } }),
    });
  },

  async disablePages(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/pages`, { method: 'DELETE' });
  },

  async listWorkflows(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/actions/workflows?per_page=50`);
  },

  async listRuns(owner, repo, workflowId) {
    return GH.req(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=10`);
  },

  async triggerWorkflow(owner, repo, workflowId, branch) {
    return GH.req(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: branch }),
    });
  },

  async getRunLogs(owner, repo, runId) {
    // Returns a redirect to zip; we just return the URL
    const res = await fetch(`${GH.BASE}/repos/${owner}/${repo}/actions/runs/${runId}/logs`, {
      headers: { 'Authorization': `Bearer ${resolveToken(STATE.tokens[STATE.activeTokenIdx]?.raw)}` },
      redirect: 'follow',
    });
    return res.url;
  },

  async createRepo(name, desc, isPrivate, hasReadme, gitignore) {
    return GH.req('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name, description: desc, private: isPrivate,
        auto_init: hasReadme,
        gitignore_template: gitignore || undefined,
      }),
    });
  },

  async listDeployments(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/deployments?per_page=20`);
  },

  async getTokenInfo() {
    // Fine-grained token info
    return GH.req('/installation/token').catch(() => null);
  },

  async searchCode(owner, repo, query) {
    return GH.req(`/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}&per_page=30`);
  },

  async getCommits(owner, repo, branch, path = '') {
    let url = `/repos/${owner}/${repo}/commits?sha=${branch}&per_page=20`;
    if (path) url += `&path=${encodeURIComponent(path)}`;
    return GH.req(url);
  },

  async createPR(owner, repo, title, head, base, body = '') {
    return GH.req(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title, head, base, body }),
    });
  },

  async listCollaborators(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/collaborators`).catch(() => []);
  },

  async getRepoTraffic(owner, repo) {
    return GH.req(`/repos/${owner}/${repo}/traffic/views`).catch(() => null);
  },

  async listGists() {
    return GH.req('/gists?per_page=30').catch(() => []);
  },

  async getUserOrgs() {
    return GH.req('/user/orgs').catch(() => []);
  },
};

// ── TOKEN MANAGER ──
const TOK = {
  detectTokenType(val) {
    const t = detectTokenType(val);
    const badge = document.getElementById('token-type-badge');
    if (!badge) return;
    const map = {
      'fine-grain': ['fine-grain', '✓ FINE-GRAINED PAT'],
      'classic': ['classic', '✓ CLASSIC PAT'],
      'xcyber': ['xcyber', '⚡ XCYBER ENCODED'],
      'oauth': ['classic', '✓ OAUTH TOKEN'],
      'unknown': ['', '? UNKNOWN FORMAT'],
    };
    const [cls, label] = map[t] || ['', ''];
    badge.innerHTML = cls ? `<span class="token-badge ${cls}">${label}</span>` : '';
  },

  async loadB64Tokens() {
    const raw = document.getElementById('b64-token-input').value.trim();
    if (!raw) return notify('Paste base64 token(s)', 'warn');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    let loaded = 0;
    for (const line of lines) {
      try {
        const decoded = atob(line);
        await TOK._addToken(decoded.trim());
        loaded++;
      } catch {
        notify(`Invalid base64 on line ${loaded + 1}`, 'error');
      }
    }
    if (loaded) notify(`Loaded ${loaded} token(s)`, 'success');
  },

  async addManualToken() {
    const val = document.getElementById('manual-token-input').value.trim();
    if (!val) return notify('Enter a token', 'warn');
    await TOK._addToken(val);
    document.getElementById('manual-token-input').value = '';
  },

  async _addToken(raw) {
    showProgress();
    try {
      const resolved = resolveToken(raw);
      const user = await GH.getUser(resolved).catch(() => null);
      if (!user) { notify('Invalid token or no user access', 'error'); hideProgress(); return; }

      // Fetch repos for this token
      let repos = [];
      try {
        repos = await GH.listRepos(1);
      } catch {}

      const t = detectTokenType(raw);
      const entry = {
        raw, resolved, type: t,
        user: user.login, avatar: user.avatar_url,
        name: user.name || user.login,
        repos: repos.map(r => r.full_name),
        scopes: [],
        id: Date.now() + Math.random(),
      };

      STATE.tokens.push(entry);
      if (STATE.tokens.length === 1) STATE.activeTokenIdx = 0;

      // Add repos to STATE.repos
      for (const r of repos) {
        if (!STATE.repos.find(x => x.full_name === r.full_name)) STATE.repos.push(r);
      }

      TOK.renderTokens();
      XC.renderRepoList();
      XC.updateStatus();
      notify(`Token loaded: ${user.login} (${repos.length} repos)`, 'success');
    } catch (e) {
      notify('Token error: ' + e.message, 'error');
    }
    hideProgress();
  },

  renderTokens() {
    const el = document.getElementById('active-tokens-list');
    if (!el) return;
    if (!STATE.tokens.length) { el.innerHTML = '<div class="text-muted" style="font-size:12px;">No tokens loaded</div>'; return; }
    el.innerHTML = STATE.tokens.map((t, i) => `
      <div class="repo-item ${i === STATE.activeTokenIdx ? 'active' : ''}" onclick="TOK.setActive(${i})">
        <img src="${t.avatar}" style="width:24px;height:24px;border-radius:50%;border:1px solid var(--border2);" onerror="this.style.display='none'">
        <div class="flex flex-col gap-4" style="flex:1">
          <div class="repo-name">${t.user}</div>
          <div class="repo-meta">${t.type} · ${t.repos.length} repos</div>
        </div>
        <span class="token-badge ${t.type === 'fine-grain' ? 'fine-grain' : t.type === 'xcyber' ? 'xcyber' : 'classic'}">${t.type.toUpperCase()}</span>
        <button class="btn sm danger" onclick="TOK.remove(${i},event)">✕</button>
      </div>`).join('');

    const active = STATE.tokens[STATE.activeTokenIdx];
    if (active) TOK.renderTokenInfo(active);
  },

  async renderTokenInfo(t) {
    const el = document.getElementById('token-info-display');
    if (!el) return;
    showProgress();
    try {
      const rate = await GH.getRateLimit().catch(() => null);
      const orgs = await GH.getUserOrgs().catch(() => []);
      el.innerHTML = `
        <div class="flex gap-8 flex-wrap">
          <div class="border-box p-8 flex flex-col gap-4" style="min-width:160px">
            <div class="lbl">USER</div>
            <div class="text-accent bold">${t.user}</div>
            <div class="text-muted mono" style="font-size:10px">${t.name}</div>
          </div>
          <div class="border-box p-8 flex flex-col gap-4" style="min-width:160px">
            <div class="lbl">TOKEN TYPE</div>
            <span class="token-badge ${t.type === 'fine-grain' ? 'fine-grain' : t.type === 'xcyber' ? 'xcyber' : 'classic'}">${t.type.toUpperCase()}</span>
          </div>
          ${rate ? `<div class="border-box p-8 flex flex-col gap-4" style="min-width:160px">
            <div class="lbl">API RATE LIMIT</div>
            <div class="text-accent bold">${rate.rate.remaining} / ${rate.rate.limit}</div>
            <div class="text-muted mono" style="font-size:10px">Resets ${new Date(rate.rate.reset*1000).toLocaleTimeString()}</div>
          </div>` : ''}
          ${orgs.length ? `<div class="border-box p-8 flex flex-col gap-4"><div class="lbl">ORGS</div><div class="mono" style="font-size:11px">${orgs.map(o=>o.login).join(', ')}</div></div>` : ''}
          <div class="border-box p-8 flex flex-col gap-4" style="min-width:200px">
            <div class="lbl">ACCESSIBLE REPOS</div>
            <div class="mono" style="font-size:10px;max-height:80px;overflow-y:auto">${t.repos.slice(0,20).join('<br>') + (t.repos.length > 20 ? `<br>+${t.repos.length-20} more` : '')}</div>
          </div>
        </div>
        <div class="lbl mt-8">SCOPES / PERMISSIONS</div>
        <div class="mono text-muted" style="font-size:11px;">Fine-grained PATs have per-repo permissions. Classic tokens show scopes in the X-OAuth-Scopes header. XCYBER decodes to fine-grained.</div>
      `;
    } catch {}
    hideProgress();
  },

  setActive(i) {
    STATE.activeTokenIdx = i;
    TOK.renderTokens();
    XC.updateStatus();
    notify(`Switched to token: ${STATE.tokens[i].user}`, 'success');
  },

  remove(i, e) {
    e && e.stopPropagation();
    STATE.tokens.splice(i, 1);
    if (STATE.activeTokenIdx >= STATE.tokens.length) STATE.activeTokenIdx = Math.max(0, STATE.tokens.length - 1);
    TOK.renderTokens();
    XC.updateStatus();
    notify('Token removed', 'warn');
  },

  toggleShow(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  },

  encodeToken() {
    const raw = document.getElementById('encode-input').value.trim();
    if (!raw) return notify('Enter a token to encode', 'warn');
    const encoded = xcyberEncode(raw);
    document.getElementById('encoded-output').textContent = encoded;
    notify('Encoded! Copy and store safely.', 'success');
  },

  copyEncoded() {
    const text = document.getElementById('encoded-output').textContent;
    if (!text) return notify('Nothing to copy', 'warn');
    navigator.clipboard.writeText(text).then(() => notify('Copied!', 'success'));
  },
};

// ── MAIN XC APP ──
const XC = {
  monacoEditor: null,

  init() {
    XC.loadSettings();
    XC.bindTopbarTabs();
    XC.bindKeys();
    XC.initMonaco();
    XC.setupDropZones();
    XC.openWelcomeTab();
    XC.autoSaveLoop();
    TERM.init();
    XC.renderRepoList();
    setInterval(XC.updateStatus, 10000);
    XC.updateStatus();
    // Auto-load default tokens defined at top of file
    loadDefaultTokens();
  },

  loadSettings() {
    try { STATE.settings = JSON.parse(localStorage.getItem('xcyber_settings') || '{}'); } catch {}
    STATE.settings = Object.assign({
      fontSize: 14, theme: 'xcyber-dark', tabSize: 2,
      minimap: true, wordWrap: true, autosave: 3000,
      gitName: '', gitEmail: '',
    }, STATE.settings);
  },

  saveSettings() {
    STATE.settings.fontSize = +document.getElementById('set-font-size').value;
    STATE.settings.theme = document.getElementById('set-theme').value;
    STATE.settings.tabSize = +document.getElementById('set-tab').value;
    STATE.settings.minimap = document.getElementById('set-minimap').checked;
    STATE.settings.wordWrap = document.getElementById('set-wordwrap').checked;
    STATE.settings.autosave = +document.getElementById('set-autosave').value;
    STATE.settings.gitName = document.getElementById('set-git-name').value;
    STATE.settings.gitEmail = document.getElementById('set-git-email').value;
    localStorage.setItem('xcyber_settings', JSON.stringify(STATE.settings));
    // Apply to Monaco
    if (XC.monacoEditor) {
      XC.monacoEditor.updateOptions({
        fontSize: STATE.settings.fontSize,
        tabSize: STATE.settings.tabSize,
        minimap: { enabled: STATE.settings.minimap },
        wordWrap: STATE.settings.wordWrap ? 'on' : 'off',
      });
      if (STATE.settings.theme !== 'xcyber-dark') {
        window.monaco && monaco.editor.setTheme(STATE.settings.theme);
      }
    }
    XC.closeModal('settings-modal');
    notify('Settings saved', 'success');
  },

  bindTopbarTabs() {
    document.querySelectorAll('.topbar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.topbar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(tab.dataset.panel);
        if (panel) panel.classList.add('active');
      });
    });
  },

  bindKeys() {
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); XC.saveCurrentFile(); }
      if (ctrl && e.key === 'p') { e.preventDefault(); XC.commitPush(); }
      if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); TERM.focus(); }
      if (ctrl && e.key === 'f') { e.preventDefault(); XC.switchPanel('search-panel'); }
    });
  },

  switchPanel(id) {
    document.querySelectorAll('.topbar-tab').forEach(t => {
      if (t.dataset.panel === id) t.click();
    });
  },

  setupDropZones() {
    ['image-editor-container', 'audio-editor-container', 'video-editor-container'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      el.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (id === 'image-editor-container') IMG.loadFile(file);
        else if (id === 'audio-editor-container') AUD.loadFile(file);
        else if (id === 'video-editor-container') VID.loadFile(file);
      });
    });
    // Editor drop
    document.getElementById('monaco-editor-container')?.addEventListener('drop', e => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) XC.openFileFromDisk(file);
    });
    document.getElementById('monaco-editor-container')?.addEventListener('dragover', e => e.preventDefault());
  },

  initMonaco() {
    require(['vs/editor/editor.main'], function(monaco) {
      window.monaco = monaco;

      // Define XCYBER dark theme
      monaco.editor.defineTheme('xcyber-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '3d6080', fontStyle: 'italic' },
          { token: 'keyword', foreground: '0af', fontStyle: 'bold' },
          { token: 'string', foreground: '0ff' },
          { token: 'number', foreground: 'fa0' },
          { token: 'type', foreground: '06f' },
          { token: 'identifier', foreground: 'c8e0ff' },
          { token: 'delimiter', foreground: '7aafd4' },
          { token: 'operator', foreground: '0af' },
        ],
        colors: {
          'editor.background': '#000000',
          'editor.foreground': '#c8e0ff',
          'editor.lineHighlightBackground': '#0a1220',
          'editorCursor.foreground': '#0af',
          'editor.selectionBackground': '#1a4a9060',
          'editor.inactiveSelectionBackground': '#0d306040',
          'editorLineNumber.foreground': '#3d6080',
          'editorLineNumber.activeForeground': '#0af',
          'scrollbarSlider.background': '#0d3060',
          'scrollbarSlider.hoverBackground': '#1a4a90',
          'editorWidget.background': '#050a0f',
          'editorSuggestWidget.background': '#0a1220',
          'editorSuggestWidget.border': '#0d3060',
          'editorSuggestWidget.selectedBackground': '#0d1828',
          'minimap.background': '#050a0f',
          'statusBar.background': '#0a1220',
          'sideBar.background': '#050a0f',
        },
      });
      monaco.editor.setTheme('xcyber-dark');

      XC.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor-container'), {
        value: WELCOME_CONTENT,
        language: 'markdown',
        theme: 'xcyber-dark',
        fontSize: STATE.settings.fontSize,
        fontFamily: "'Share Tech Mono', monospace",
        lineHeight: 20,
        tabSize: STATE.settings.tabSize,
        minimap: { enabled: STATE.settings.minimap },
        wordWrap: STATE.settings.wordWrap ? 'on' : 'off',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'phase',
        cursorSmoothCaretAnimation: 'on',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        formatOnType: true,
        formatOnPaste: true,
        suggest: { showKeywords: true },
        quickSuggestions: true,
        folding: true,
        lightbulb: { enabled: 'on' },
      });

      XC.monacoEditor.onDidChangeCursorPosition(e => {
        const pos = e.position;
        document.getElementById('status-cursor').textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
      });

      XC.monacoEditor.onDidChangeModelContent(() => {
        if (STATE.activeFile && STATE.openFiles[STATE.activeFile]) {
          STATE.openFiles[STATE.activeFile].dirty = true;
          XC.updateTabDirty(STATE.activeFile);
        }
      });

      // Populate language selector
      const langs = monaco.languages.getLanguages().map(l => l.id).sort();
      const sel = document.getElementById('editor-lang-select');
      langs.forEach(l => { const o = document.createElement('option'); o.value = o.textContent = l; sel.appendChild(o); });
      sel.value = 'markdown';

      XC.openWelcomeTab();
    });
  },

  openWelcomeTab() {
    STATE.openFiles['welcome'] = { content: WELCOME_CONTENT, sha: null, dirty: false, lang: 'markdown' };
    STATE.activeFile = 'welcome';
  },

  openFileFromDisk(file) {
    const MAX = 5 * 1024 * 1024; // 5 MB display limit
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target.result;
      const path = file.name;
      STATE.openFiles[path] = { content, sha: null, dirty: false, lang: XC.langFromExt(path) };
      XC.openTab(path);
      if (content.length > MAX) {
        notify(`File >5MB — displaying truncated`, 'warn');
        XC.setEditorContent(content.slice(0, MAX) + '\n\n[... TRUNCATED — FILE TOO LARGE TO DISPLAY FULLY ...]');
      } else {
        XC.setEditorContent(content, path);
      }
    };
    reader.readAsText(file);
  },

  langFromExt(path) {
    const ext = path.split('.').pop().toLowerCase();
    const MAP = {
      js:'javascript', ts:'typescript', jsx:'javascript', tsx:'typescript',
      html:'html', css:'css', scss:'scss', less:'less',
      py:'python', rb:'ruby', go:'go', rs:'rust', cpp:'cpp', c:'c', cs:'csharp',
      java:'java', kt:'kotlin', swift:'swift', sh:'shell', bash:'shell',
      json:'json', yaml:'yaml', yml:'yaml', md:'markdown', txt:'plaintext',
      sql:'sql', xml:'xml', php:'php', r:'r', lua:'lua', dart:'dart',
      vue:'html', svelte:'html', astro:'html', toml:'ini', env:'ini',
    };
    return MAP[ext] || 'plaintext';
  },

  setEditorContent(content, path) {
    if (!XC.monacoEditor || !window.monaco) return;
    const lang = path ? XC.langFromExt(path) : 'plaintext';
    const model = monaco.editor.createModel(content, lang);
    XC.monacoEditor.setModel(model);
    document.getElementById('editor-lang-select').value = lang;
    const bytes = new TextEncoder().encode(content).length;
    document.getElementById('file-size-label').textContent = XC.fmtBytes(bytes);
  },

  fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(1) + ' MB';
  },

  openTab(path) {
    if (!document.querySelector(`.editor-tab[data-file="${CSS.escape(path)}"]`)) {
      const tab = document.createElement('div');
      tab.className = 'editor-tab';
      tab.dataset.file = path;
      const name = path.split('/').pop();
      tab.innerHTML = `<span>${name}</span><span class="close-tab" onclick="XC.closeTab('${path.replace(/'/g,"\\'")}',event)">✕</span>`;
      tab.onclick = (e) => { if (!e.target.classList.contains('close-tab')) XC.activateTab(path); };
      document.getElementById('editor-tabs').appendChild(tab);
    }
    XC.activateTab(path);
  },

  activateTab(path) {
    document.querySelectorAll('.editor-tab').forEach(t => t.classList.toggle('active', t.dataset.file === path));
    STATE.activeFile = path;
    const f = STATE.openFiles[path];
    if (f && XC.monacoEditor) {
      XC.setEditorContent(f.content, path);
      document.getElementById('status-file').textContent = path.split('/').pop();
    }
    XC.switchPanel('editor-panel');
  },

  closeTab(path, e) {
    e && e.stopPropagation();
    const f = STATE.openFiles[path];
    if (f?.dirty && !confirm('Unsaved changes. Close anyway?')) return;
    delete STATE.openFiles[path];
    const tab = document.querySelector(`.editor-tab[data-file="${CSS.escape(path)}"]`);
    tab?.remove();
    // Activate another tab
    const tabs = document.querySelectorAll('.editor-tab');
    if (tabs.length) XC.activateTab(tabs[tabs.length - 1].dataset.file);
    else { STATE.activeFile = null; XC.monacoEditor?.setValue(''); }
  },

  updateTabDirty(path) {
    const tab = document.querySelector(`.editor-tab[data-file="${CSS.escape(path)}"]`);
    if (!tab) return;
    const name = path.split('/').pop();
    const isDirty = STATE.openFiles[path]?.dirty;
    const span = tab.querySelector('span');
    if (span) span.textContent = (isDirty ? '● ' : '') + name;
  },

  setEditorLanguage(lang) {
    if (!XC.monacoEditor || !window.monaco) return;
    const model = XC.monacoEditor.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang);
  },

  editorAction(action) {
    if (!XC.monacoEditor) return;
    if (action === 'format') XC.monacoEditor.getAction('editor.action.formatDocument')?.run();
    if (action === 'copy') {
      const sel = XC.monacoEditor.getSelection();
      const model = XC.monacoEditor.getModel();
      const text = model?.getValueInRange(sel) || XC.monacoEditor.getValue();
      navigator.clipboard.writeText(text).then(() => notify('Copied!', 'success'));
    }
  },

  async saveCurrentFile() {
    if (!STATE.activeFile || !STATE.activeRepo) return notify('Select a repo and file first', 'warn');
    if (STATE.activeFile === 'welcome') return;
    showProgress();
    try {
      const content = XC.monacoEditor.getValue();
      STATE.openFiles[STATE.activeFile].content = content;
      STATE.pendingCommits[STATE.activeFile] = content;
      STATE.openFiles[STATE.activeFile].dirty = false;
      XC.updateTabDirty(STATE.activeFile);
      notify('Staged for commit (use PUSH to upload)', 'success');
    } catch (e) { notify('Save error: ' + e.message, 'error'); }
    hideProgress();
  },

  async loadFileFromGitHub(path) {
    const r = STATE.activeRepo;
    if (!r) return notify('No repo selected', 'warn');
    showProgress();
    try {
      const MAX = 5 * 1024 * 1024;
      const data = await GH.getFile(r.owner.login, r.name, path, STATE.activeBranch);
      // GitHub returns base64-encoded content
      const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
      if (decoded.length > MAX) {
        STATE.openFiles[path] = { content: decoded.slice(0, MAX) + '\n\n[... TRUNCATED ...]', sha: data.sha, dirty: false, lang: XC.langFromExt(path) };
        notify('File >5MB — truncated display', 'warn');
      } else {
        STATE.openFiles[path] = { content: decoded, sha: data.sha, dirty: false, lang: XC.langFromExt(path) };
      }
      XC.openTab(path);
      XC.setEditorContent(STATE.openFiles[path].content, path);
    } catch (e) { notify('Load error: ' + e.message, 'error'); }
    hideProgress();
  },

  exportCurrentFile() {
    if (!XC.monacoEditor) return;
    const content = XC.monacoEditor.getValue();
    const name = STATE.activeFile?.split('/').pop() || 'file.txt';
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = name; a.click();
    notify('Exported: ' + name, 'success');
  },

  importFile() {
    const inp = document.createElement('input'); inp.type = 'file';
    inp.onchange = e => { const f = e.target.files[0]; if (f) XC.openFileFromDisk(f); };
    inp.click();
  },

  previewCurrentFile() {
    if (!XC.monacoEditor) return;
    const content = XC.monacoEditor.getValue();
    const path = STATE.activeFile || '';
    const ext = path.split('.').pop().toLowerCase();
    const overlay = document.getElementById('preview-overlay');
    const container = document.getElementById('preview-content');
    overlay.classList.remove('hidden');
    if (ext === 'md') {
      container.innerHTML = DOMPurify.sanitize(marked.parse(content));
    } else if (ext === 'html') {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:calc(100vh - 80px);border:none;background:#fff';
      iframe.srcdoc = content;
      container.innerHTML = '';
      container.style.padding = '0';
      container.appendChild(iframe);
    } else {
      container.innerHTML = `<pre style="font-family:var(--mono);font-size:12px;white-space:pre-wrap">${content.replace(/</g,'&lt;')}</pre>`;
    }
  },

  closePreview() {
    document.getElementById('preview-overlay').classList.add('hidden');
  },

  async deleteCurrentFile() {
    if (!STATE.activeFile || STATE.activeFile === 'welcome') return notify('No file selected', 'warn');
    if (!confirm(`Delete ${STATE.activeFile}?`)) return;
    const f = STATE.openFiles[STATE.activeFile];
    const r = STATE.activeRepo;
    if (f?.sha && r) {
      showProgress();
      try {
        await GH.deleteFile(r.owner.login, r.name, STATE.activeFile, f.sha, `Delete ${STATE.activeFile} via XCYBER`, STATE.activeBranch);
        notify('File deleted', 'success');
        XC.closeTab(STATE.activeFile);
        XC.loadFileTree();
      } catch (e) { notify('Delete error: ' + e.message, 'error'); }
      hideProgress();
    } else {
      XC.closeTab(STATE.activeFile);
      notify('Local file removed', 'success');
    }
  },

  openModal(id) {
    document.getElementById(id)?.classList.add('open');
    if (id === 'settings-modal') XC.populateSettings();
    if (id === 'commit-modal') XC.populateCommitFiles();
    if (id === 'new-branch-modal') XC.populateBranchFrom();
  },

  closeModal(id) { document.getElementById(id)?.classList.remove('open'); },

  populateSettings() {
    const s = STATE.settings;
    document.getElementById('set-font-size').value = s.fontSize;
    document.getElementById('set-theme').value = s.theme;
    document.getElementById('set-tab').value = s.tabSize;
    document.getElementById('set-minimap').checked = s.minimap;
    document.getElementById('set-wordwrap').checked = s.wordWrap;
    document.getElementById('set-autosave').value = s.autosave;
    document.getElementById('set-git-name').value = s.gitName || '';
    document.getElementById('set-git-email').value = s.gitEmail || '';
  },

  populateCommitFiles() {
    const list = document.getElementById('commit-files-list');
    const pending = Object.keys(STATE.pendingCommits);
    const dirty = Object.entries(STATE.openFiles).filter(([,v]) => v.dirty).map(([k]) => k);
    const all = [...new Set([...pending, ...dirty])];
    if (!all.length) { list.innerHTML = '<span class="text-muted">No staged changes</span>'; return; }
    list.innerHTML = all.map(p => `<div class="text-accent">M&nbsp;${p}</div>`).join('');
  },

  populateBranchFrom() {
    const sel = document.getElementById('branch-from');
    sel.innerHTML = '';
    document.querySelectorAll('#branch-select option').forEach(o => {
      const opt = document.createElement('option'); opt.value = opt.textContent = o.value; sel.appendChild(opt);
    });
  },

  renderRepoList() {
    const el = document.getElementById('repo-list-sidebar');
    if (!el) return;
    if (!STATE.repos.length) { el.innerHTML = '<div class="text-muted" style="font-size:11px;padding:4px;">No repos. Add a token.</div>'; return; }
    el.innerHTML = STATE.repos.slice(0, 30).map(r => `
      <div class="tree-item ${STATE.activeRepo?.full_name === r.full_name ? 'active' : ''}" onclick="XC.selectRepo('${r.full_name}')">
        <span class="icon">${r.private ? '🔒' : '📦'}</span>
        <span style="overflow:hidden;text-overflow:ellipsis">${r.name}</span>
      </div>`).join('');
  },

  async selectRepo(fullName) {
    const repo = STATE.repos.find(r => r.full_name === fullName);
    if (!repo) return;
    STATE.activeRepo = repo;
    STATE.activeFile = null;
    showProgress();
    try {
      // Load branches
      const branches = await GH.listBranches(repo.owner.login, repo.name);
      const sel = document.getElementById('branch-select');
      sel.innerHTML = '';
      branches.forEach(b => {
        const o = document.createElement('option'); o.value = o.textContent = b.name;
        if (b.name === (repo.default_branch || 'main')) o.selected = true;
        sel.appendChild(o);
      });
      STATE.activeBranch = sel.value;
      await XC.loadFileTree();
      XC.renderRepoList();
      XC.updateStatus();
      notify(`Repo: ${fullName}`, 'success');
    } catch (e) { notify('Repo error: ' + e.message, 'error'); }
    hideProgress();
  },

  async loadFileTree(path = '') {
    const r = STATE.activeRepo;
    if (!r) return;
    showProgress();
    try {
      const items = await GH.listContents(r.owner.login, r.name, path, STATE.activeBranch);
      if (!path) {
        // Full tree root
        document.getElementById('file-tree').innerHTML = '';
        XC.renderTreeItems(items, document.getElementById('file-tree'), 0, '');
      }
    } catch (e) { notify('Tree error: ' + e.message, 'error'); }
    hideProgress();
    // Update git status
    XC.updateGitStatus();
  },

  renderTreeItems(items, container, depth, parentPath) {
    if (!Array.isArray(items)) return;
    items.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (b.type === 'dir' && a.type !== 'dir') return 1;
      return a.name.localeCompare(b.name);
    });
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'tree-item' + (depth > 0 ? ' tree-indent' : '');
      el.style.paddingLeft = (10 + depth * 14) + 'px';
      const fullPath = parentPath ? parentPath + '/' + item.name : item.name;
      const icon = item.type === 'dir' ? '📁' : XC.fileIcon(item.name);
      el.innerHTML = `<span class="icon">${icon}</span><span>${item.name}</span>`;
      if (item.type === 'dir') {
        el.classList.add('folder');
        let open = false;
        el.onclick = async () => {
          if (!open) {
            open = true; el.querySelector('.icon').textContent = '📂';
            try {
              const children = await GH.listContents(STATE.activeRepo.owner.login, STATE.activeRepo.name, fullPath, STATE.activeBranch);
              const sub = document.createElement('div');
              el.after(sub);
              XC.renderTreeItems(children, sub, depth + 1, fullPath);
            } catch {}
          } else {
            open = false; el.querySelector('.icon').textContent = '📁';
            let next = el.nextElementSibling;
            while (next && next.style.paddingLeft > el.style.paddingLeft) {
              const rem = next.nextElementSibling; next.remove(); next = rem;
            }
          }
        };
      } else {
        el.onclick = () => XC.loadFileFromGitHub(fullPath);
      }
      container.appendChild(el);
    });
  },

  fileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const m = { js:'🟨', ts:'🔷', jsx:'🟨', tsx:'🔷', html:'🟧', css:'🟦', scss:'🟣', py:'🐍', md:'📝', json:'📋', yml:'⚙', yaml:'⚙', sh:'💲', png:'🖼', jpg:'🖼', jpeg:'🖼', gif:'🎞', mp3:'🎵', mp4:'🎬', pdf:'📄', svg:'🖌', lock:'🔒', env:'🔐' };
    return m[ext] || '📄';
  },

  async switchBranch(branch) {
    STATE.activeBranch = branch;
    await XC.loadFileTree();
    XC.updateStatus();
    notify('Branch: ' + branch, 'success');
  },

  async pullBranch() {
    notify('Refreshing from remote...', 'success');
    await XC.loadFileTree();
  },

  async createNewFile() {
    const name = document.getElementById('new-file-name').value.trim();
    const tmpl = document.getElementById('new-file-template').value;
    if (!name) return notify('Enter file name', 'warn');
    const content = TEMPLATES[tmpl] || '';
    STATE.openFiles[name] = { content, sha: null, dirty: true, lang: XC.langFromExt(name) };
    STATE.pendingCommits[name] = content;
    XC.openTab(name);
    XC.setEditorContent(content, name);
    XC.closeModal('new-file-modal');
    notify('New file: ' + name, 'success');
  },

  async createRepo() {
    const name = document.getElementById('new-repo-name').value.trim();
    const desc = document.getElementById('new-repo-desc').value.trim();
    const isPrivate = document.getElementById('new-repo-vis').value === 'private';
    const readme = document.getElementById('new-repo-readme').checked;
    const gitignore = document.getElementById('new-repo-gitignore').value;
    if (!name) return notify('Enter repo name', 'warn');
    showProgress();
    try {
      const repo = await GH.createRepo(name, desc, isPrivate, readme, gitignore);
      STATE.repos.unshift(repo);
      XC.renderRepoList();
      XC.closeModal('new-repo-modal');
      notify('Repo created: ' + repo.full_name, 'success');
    } catch (e) { notify('Create repo error: ' + e.message, 'error'); }
    hideProgress();
  },

  async createBranch() {
    const name = document.getElementById('new-branch-name').value.trim();
    const from = document.getElementById('branch-from').value;
    const r = STATE.activeRepo;
    if (!name || !r) return notify('Enter branch name and select a repo', 'warn');
    showProgress();
    try {
      const ref = await GH.getRef(r.owner.login, r.name, from);
      const sha = ref.object.sha;
      await GH.createBranch(r.owner.login, r.name, name, sha);
      // Add to branch selector
      const sel = document.getElementById('branch-select');
      const o = document.createElement('option'); o.value = o.textContent = name; sel.appendChild(o);
      sel.value = name;
      STATE.activeBranch = name;
      XC.closeModal('new-branch-modal');
      notify('Branch created: ' + name, 'success');
    } catch (e) { notify('Branch error: ' + e.message, 'error'); }
    hideProgress();
  },

  commitPush() {
    const pending = Object.keys(STATE.pendingCommits);
    const dirty = Object.entries(STATE.openFiles).filter(([,v]) => v.dirty).map(([k]) => k);
    const all = [...new Set([...pending, ...dirty])];
    if (!all.length) return notify('No changes to push', 'warn');
    if (!STATE.activeRepo) return notify('Select a repo first', 'warn');
    XC.openModal('commit-modal');
  },

  async doCommitPush() {
    const msg = document.getElementById('commit-msg').value.trim() || 'Update via XCYBER IDE';
    const r = STATE.activeRepo;
    if (!r) return;
    // Collect all dirty files
    const toCommit = { ...STATE.pendingCommits };
    Object.entries(STATE.openFiles).forEach(([path, f]) => {
      if (f.dirty && path !== 'welcome') toCommit[path] = XC.monacoEditor && STATE.activeFile === path ? XC.monacoEditor.getValue() : f.content;
    });
    if (!Object.keys(toCommit).length) return notify('Nothing to commit', 'warn');
    showProgress();
    XC.closeModal('commit-modal');
    TERM.log(`Committing ${Object.keys(toCommit).length} file(s)...`, 'info');
    let ok = 0, fail = 0;
    for (const [path, content] of Object.entries(toCommit)) {
      try {
        const sha = STATE.openFiles[path]?.sha || null;
        const res = await GH.createOrUpdateFile(r.owner.login, r.name, path, content, msg, sha, STATE.activeBranch);
        if (STATE.openFiles[path]) {
          STATE.openFiles[path].sha = res.content.sha;
          STATE.openFiles[path].dirty = false;
          XC.updateTabDirty(path);
        }
        delete STATE.pendingCommits[path];
        TERM.log(`  ✓ ${path}`, 'success');
        ok++;
      } catch (e) { TERM.log(`  ✗ ${path}: ${e.message}`, 'error'); fail++; }
    }
    TERM.log(`Push complete: ${ok} ok, ${fail} failed`, ok && !fail ? 'success' : 'warn');
    notify(`Pushed ${ok}/${ok+fail} files`, ok ? 'success' : 'error');
    await XC.loadFileTree();
    XC.updateGitStatus();
    hideProgress();
  },

  updateGitStatus() {
    const dirty = Object.entries(STATE.openFiles).filter(([k,v]) => v.dirty && k !== 'welcome').map(([k]) => k);
    const pending = Object.keys(STATE.pendingCommits);
    const all = [...new Set([...dirty, ...pending])];
    const el = document.getElementById('git-status-sidebar');
    if (!el) return;
    if (!all.length) { el.innerHTML = '<span class="text-success">✓ Clean</span>'; return; }
    el.innerHTML = all.map(p => `<div class="text-warn">M ${p.split('/').pop()}</div>`).join('') +
      `<div class="text-muted" style="margin-top:4px;font-size:10px">${all.length} modified</div>`;
  },

  updateStatus() {
    const t = STATE.tokens[STATE.activeTokenIdx];
    document.getElementById('status-token').textContent = t ? `🔑 ${t.user}` : 'No token';
    document.getElementById('status-repo').textContent = STATE.activeRepo ? STATE.activeRepo.name : 'No repo';
    document.getElementById('status-branch').textContent = STATE.activeBranch || 'No branch';
    document.getElementById('status-file').textContent = STATE.activeFile || 'No file';
    document.getElementById('status-net').textContent = navigator.onLine ? '● ONLINE' : '● OFFLINE';
    document.getElementById('status-net').style.color = navigator.onLine ? 'var(--success)' : 'var(--danger)';
    const prompt = STATE.activeRepo ? `xcyber@${STATE.activeRepo.name}[${STATE.activeBranch}]$` : 'xcyber@git:~$';
    document.getElementById('terminal-prompt').textContent = prompt;
  },

  autoSaveLoop() {
    setInterval(() => {
      if (!STATE.settings.autosave || STATE.settings.autosave === 'off') return;
      if (!XC.monacoEditor || !STATE.activeFile || STATE.activeFile === 'welcome') return;
      const content = XC.monacoEditor.getValue();
      if (STATE.openFiles[STATE.activeFile]) {
        const prev = STATE.openFiles[STATE.activeFile].content;
        if (content !== prev) {
          STATE.openFiles[STATE.activeFile].content = content;
          STATE.openFiles[STATE.activeFile].dirty = true;
          XC.updateTabDirty(STATE.activeFile);
        }
      }
    }, STATE.settings.autosave || 3000);
  },
};

// ── TEMPLATES ──
const TEMPLATES = {
  blank: '',
  html: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>`,
  css: `/* Stylesheet */\n:root {\n  --primary: #0af;\n  --bg: #000;\n}\n\n* {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n}\n`,
  js: `// Module\n'use strict';\n\nexport function main() {\n  \n}\n`,
  md: `# Title\n\nDescription here.\n\n## Section\n\nContent.\n`,
  json: `{\n  "name": "",\n  "version": "1.0.0"\n}\n`,
  gitignore: `node_modules/\n.env\n.DS_Store\ndist/\nbuild/\n*.log\n`,
  workflow: `name: CI\n\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Run\n        run: echo "Hello XCYBER"\n`,
};

// ── WELCOME CONTENT ──
const WELCOME_CONTENT = `# ⚡ XCYBER IDE

Welcome to the XCyber GitHub IDE.

## Getting Started

1. Go to the **TOKENS** tab and add your GitHub token
2. Tokens can be:
   - \`github_pat_...\` (fine-grained PAT)
   - \`ghp_...\` (classic PAT)
   - \`xcyber_...\` (XCYBER encoded)
   - Base64-encoded (paste in the pre-load slot)
3. Select a repo from the sidebar
4. Browse and edit files with Monaco Editor
5. Use **PUSH** to commit changes

## Features

- 🔑 Multi-token support (fine-grain & classic)
- ⌨ Monaco Editor (same as VS Code)
- 🖼 Image Editor with filters & drawing
- 🎵 Audio Editor with waveform
- 🎞 Video/GIF Editor
- 🧱 Visual HTML Editor with z-index control
- 🚀 Deploy manager (GitHub Pages, Vercel, Netlify)
- ⬛ Git Terminal
- 🔍 File search & replace
- ⚙ GitHub Actions viewer

---

*XCYBER IDE — Hacker Edition*
`;

// ── UTILS ──
function notify(msg, type = 'info') {
  const c = document.getElementById('notif-container');
  const n = document.createElement('div');
  n.className = `notif ${type}`;
  n.textContent = msg;
  c.appendChild(n);
  setTimeout(() => { n.style.animation = 'notifOut 0.3s ease forwards'; setTimeout(() => n.remove(), 300); }, 3500);
}

function showProgress() {
  const p = document.getElementById('global-progress');
  if (p) p.style.display = 'block';
}

function hideProgress() {
  const p = document.getElementById('global-progress');
  if (p) p.style.display = 'none';
}

// ── SEARCH ──
const SRCH = {
  search(query) {
    if (!query) { document.getElementById('search-results').innerHTML = ''; return; }
    const results = document.getElementById('search-results');
    const caseSens = document.getElementById('search-case').checked;
    const type = document.getElementById('search-type').value;
    let matches = [];
    const q = caseSens ? query : query.toLowerCase();
    for (const [path, f] of Object.entries(STATE.openFiles)) {
      if (type === 'filename') {
        const n = caseSens ? path : path.toLowerCase();
        if (n.includes(q)) matches.push({ path, line: 0, text: path, match: path });
        continue;
      }
      const lines = f.content.split('\n');
      lines.forEach((line, i) => {
        const l = caseSens ? line : line.toLowerCase();
        let test = type === 'regex' ? (() => { try { return new RegExp(query, caseSens ? '' : 'i').test(line); } catch { return false; } })() : l.includes(q);
        if (test) matches.push({ path, line: i + 1, text: line.trim(), match: line });
      });
    }
    results.innerHTML = matches.slice(0, 200).map(m => `
      <div class="search-result-item" onclick="XC.activateTab('${m.path.replace(/'/g,"\\'")}')">
        <div class="sr-file">${m.path}${m.line ? ':' + m.line : ''}</div>
        <div class="sr-line">${m.text.replace(/</g,'&lt;').slice(0, 120)}</div>
      </div>`).join('') +
      (matches.length > 200 ? `<div class="search-result-item text-muted">${matches.length - 200} more results...</div>` : '');
  },

  replaceAll() {
    const query = document.getElementById('search-input').value;
    const replace = document.getElementById('replace-input').value;
    if (!query) return notify('Enter search term', 'warn');
    let count = 0;
    const caseSens = document.getElementById('search-case').checked;
    for (const [path, f] of Object.entries(STATE.openFiles)) {
      const flags = caseSens ? 'g' : 'gi';
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const newContent = f.content.replace(regex, () => { count++; return replace; });
      if (newContent !== f.content) {
        STATE.openFiles[path].content = newContent;
        STATE.openFiles[path].dirty = true;
        if (STATE.activeFile === path && XC.monacoEditor) XC.monacoEditor.setValue(newContent);
        XC.updateTabDirty(path);
      }
    }
    notify(`Replaced ${count} occurrence(s)`, 'success');
  },
};

// ── DEPLOY PANEL ──
const DEP = {
  async refresh() {
    const r = STATE.activeRepo;
    if (!r) return notify('Select a repo', 'warn');
    showProgress();
    try {
      const grid = document.getElementById('deploy-grid');
      const cards = [];

      // GitHub Pages
      const pages = await GH.getPages(r.owner.login, r.name);
      if (pages) {
        cards.push(`<div class="deploy-card">
          <div class="flex gap-8" style="align-items:center;margin-bottom:8px">
            <span style="font-weight:700;color:var(--accent)">📄 GitHub Pages</span>
            <span class="deploy-status live">LIVE</span>
          </div>
          <a class="deploy-url" href="${pages.html_url}" target="_blank">${pages.html_url}</a>
          <div class="text-muted mono" style="font-size:10px;margin-top:4px">Branch: ${pages.source?.branch || '?'} / ${pages.source?.path || '/'}</div>
          <div class="flex gap-6 mt-8">
            <button class="btn sm" onclick="window.open('${pages.html_url}','_blank')">↗ OPEN</button>
            <button class="btn sm" onclick="navigator.clipboard.writeText('${pages.html_url}').then(()=>notify('Copied!','success'))">COPY URL</button>
          </div>
        </div>`);
      } else {
        cards.push(`<div class="deploy-card">
          <div style="font-weight:700;color:var(--text2);margin-bottom:8px">📄 GitHub Pages</div>
          <div class="text-muted" style="font-size:12px">Not enabled</div>
          <button class="btn sm primary mt-8" onclick="DEP.deployGHPages()">ENABLE PAGES</button>
        </div>`);
      }

      // Deployments
      const deps = await GH.listDeployments(r.owner.login, r.name).catch(() => []);
      if (deps.length) {
        cards.push(`<div class="deploy-card">
          <div style="font-weight:700;color:var(--accent);margin-bottom:8px">🚀 Deployments (${deps.length})</div>
          ${deps.slice(0,5).map(d => `
            <div class="flex gap-6" style="margin-bottom:4px;font-size:11px">
              <span class="mono text-accent">${d.environment}</span>
              <span class="text-muted">${new Date(d.created_at).toLocaleDateString()}</span>
              <span class="text-muted">${d.creator?.login || '?'}</span>
            </div>`).join('')}
        </div>`);
      }

      // Releases
      const releases = await GH.listReleases(r.owner.login, r.name).catch(() => []);
      if (releases.length) {
        const rel = releases[0];
        cards.push(`<div class="deploy-card">
          <div style="font-weight:700;color:var(--accent);margin-bottom:8px">🏷 Latest Release</div>
          <div class="repo-name">${rel.tag_name}</div>
          <div class="text-muted mono" style="font-size:11px">${rel.name || ''}</div>
          <a class="deploy-url" href="${rel.html_url}" target="_blank" style="font-size:10px;">${rel.html_url}</a>
        </div>`);
      }

      // Vercel / Netlify hints
      cards.push(`<div class="deploy-card">
        <div style="font-weight:700;color:var(--text2);margin-bottom:8px">▲ Vercel</div>
        <div class="text-muted" style="font-size:11px">Connect this repo at vercel.com for instant deploys.</div>
        <button class="btn sm mt-8" onclick="DEP.openVercel()">↗ OPEN VERCEL</button>
      </div>`);
      cards.push(`<div class="deploy-card">
        <div style="font-weight:700;color:var(--text2);margin-bottom:8px">◆ Netlify</div>
        <div class="text-muted" style="font-size:11px">Connect this repo at netlify.com.</div>
        <button class="btn sm mt-8" onclick="DEP.openNetlify()">↗ OPEN NETLIFY</button>
      </div>`);

      grid.innerHTML = cards.join('');
    } catch (e) { notify('Deploy refresh error: ' + e.message, 'error'); }
    hideProgress();
  },

  async deployGHPages() {
    const r = STATE.activeRepo;
    if (!r) return notify('Select a repo', 'warn');
    const branch = document.getElementById('pages-branch').value;
    const path = document.getElementById('pages-folder').value;
    showProgress();
    try {
      await GH.enablePages(r.owner.login, r.name, branch, path).catch(() =>
        GH.updatePages(r.owner.login, r.name, branch, path)
      );
      notify('GitHub Pages deployed!', 'success');
      await DEP.refresh();
    } catch (e) { notify('Pages error: ' + e.message, 'error'); }
    hideProgress();
  },

  async savePages() { return DEP.deployGHPages(); },

  async disablePages() {
    const r = STATE.activeRepo;
    if (!r || !confirm('Disable GitHub Pages?')) return;
    showProgress();
    try { await GH.disablePages(r.owner.login, r.name); notify('Pages disabled', 'warn'); } catch (e) { notify(e.message, 'error'); }
    hideProgress();
  },

  openVercel() { window.open(`https://vercel.com/new/git/external?repository-url=https://github.com/${STATE.activeRepo?.full_name || ''}`, '_blank'); },
  openNetlify() { window.open('https://app.netlify.com/start', '_blank'); },
};

// ── ACTIONS PANEL ──
const ACT = {
  async refresh() {
    const r = STATE.activeRepo;
    if (!r) return notify('Select a repo', 'warn');
    showProgress();
    try {
      const wf = await GH.listWorkflows(r.owner.login, r.name);
      const list = document.getElementById('actions-list');
      if (!wf.workflows?.length) { list.innerHTML = '<div class="text-muted">No workflows found</div>'; return; }
      list.innerHTML = await Promise.all(wf.workflows.map(async w => {
        const runs = await GH.listRuns(r.owner.login, r.name, w.id).catch(() => ({ workflow_runs: [] }));
        const lastRun = runs.workflow_runs?.[0];
        return `<div class="action-card">
          <div class="flex gap-8" style="align-items:center;margin-bottom:6px">
            <div class="action-name">${w.name}</div>
            ${lastRun ? `<span class="deploy-status ${lastRun.conclusion === 'success' ? 'live' : lastRun.status === 'in_progress' ? 'building' : 'error'}">${lastRun.conclusion || lastRun.status}</span>` : ''}
          </div>
          <div class="action-trigger text-muted">${w.path}</div>
          ${lastRun ? `<div class="text-muted mono" style="font-size:10px;margin-top:4px">Last: ${new Date(lastRun.created_at).toLocaleString()} · ${lastRun.actor?.login}</div>` : ''}
          <div class="flex gap-6 mt-8">
            <button class="btn sm primary" onclick="ACT.trigger(${w.id})">▶ RUN</button>
            <button class="btn sm" onclick="window.open('${w.html_url}','_blank')">↗ VIEW</button>
          </div>
        </div>`;
      })).then(cards => cards.join(''));
    } catch (e) { notify('Actions error: ' + e.message, 'error'); }
    hideProgress();
  },

  async trigger(workflowId) {
    const r = STATE.activeRepo;
    if (!r) return;
    showProgress();
    try {
      await GH.triggerWorkflow(r.owner.login, r.name, workflowId, STATE.activeBranch);
      notify('Workflow triggered!', 'success');
      document.getElementById('run-log').innerHTML = '<span class="t-success">Workflow dispatched. Refresh to see run status.</span>';
    } catch (e) { notify('Trigger error: ' + e.message, 'error'); }
    hideProgress();
  },

  async newWorkflow() {
    const content = TEMPLATES.workflow;
    const name = '.github/workflows/ci.yml';
    STATE.openFiles[name] = { content, sha: null, dirty: true, lang: 'yaml' };
    STATE.pendingCommits[name] = content;
    XC.openTab(name);
    XC.setEditorContent(content, name);
    XC.switchPanel('editor-panel');
  },

  async exportWorkflows() {
    const r = STATE.activeRepo;
    if (!r) return notify('Select a repo', 'warn');
    try {
      const wf = await GH.listWorkflows(r.owner.login, r.name);
      const data = JSON.stringify(wf, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${r.name}-workflows.json`; a.click();
    } catch (e) { notify(e.message, 'error'); }
  },
};

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
  XC.init();
  // Modal close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });
  // Escape key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  });
});