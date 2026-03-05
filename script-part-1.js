// ============================================================
// XCYBER SCRIPT PART 1 — Core, GitHub API, Token Manager, Editor
// https://kbsigmaboy67.github.io/xc/script-part-1.js
// ============================================================

'use strict';

// ============================================================
//  DEFAULT TOKENS — auto-load on page start
//
//  How to encode your token for this array:
//    Run in browser console:  btoa("github_pat_yourTokenHere")
//    or:                       btoa("ghp_yourClassicToken")
//
//  xcyber_ tokens can go here WITHOUT btoa wrapping.
//  One string per line. All load automatically at startup.
//  Decoded client-side only — never sent anywhere except api.github.com
// ============================================================
const DEFAULT_TOKENS = [
  // "Z2hwX3h4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eA==",
  // "xcyber_ab3cd:ef$gh/ij",
    "xcyber_::)U@KG&I!vtoiWx&TJV!%-yCLzIY(yIVpewTV&j^gS^Tx(YDmbC*vIgysIsmYj)ReFW%Y^P@RGh!Q/*dK"
];
// ============================================================

// ── GLOBAL STATE ──
const STATE = {
  tokens: [],
  activeTokenIdx: 0,
  repos: [],
  activeRepo: null,
  activeBranch: 'main',
  openFiles: {},        // path -> {content, sha, dirty, lang}
  activeFile: null,
  pendingCommits: {},
  settings: {},
};

// ── XCYBER TOKEN ENCODING/DECODING ──
const XC_ENC = {'1':':','5':'/','2':'$','A':'@','_':'-','0':'!','3':'#','4':'%','6':'^','7':'&','8':'*','9':'(','B':')'};
const XC_DEC = Object.fromEntries(Object.entries(XC_ENC).map(([k,v])=>[v,k]));

function xcyberEncode(token) {
  const core = token.replace(/^github_pat_/,'').replace(/^ghp_/,'').replace(/^ghs_/,'');
  return 'xcyber_' + [...core].map(c => XC_ENC[c] !== undefined ? XC_ENC[c] : c).join('');
}

function xcyberDecode(tok) {
  const core = tok.replace(/^xcyber_/,'');
  const decoded = [...core].map(c => XC_DEC[c] !== undefined ? XC_DEC[c] : c).join('');
  return decoded.length <= 40 ? 'ghp_' + decoded : 'github_pat_' + decoded;
}

function detectTokenType(raw) {
  if (!raw) return 'unknown';
  if (raw.startsWith('xcyber_'))     return 'xcyber';
  if (raw.startsWith('github_pat_')) return 'fine-grain';
  if (raw.startsWith('ghp_'))        return 'classic';
  if (raw.startsWith('ghs_'))        return 'server';
  if (raw.startsWith('gho_'))        return 'oauth';
  return 'unknown';
}

function resolveToken(raw) {
  return raw.startsWith('xcyber_') ? xcyberDecode(raw) : raw;
}

// Safe UTF-8 decode of GitHub base64 content
function ghBase64Decode(b64) {
  const clean = b64.replace(/\s/g, '');
  try {
    const bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    try { return atob(clean); } catch { return ''; }
  }
}

// ── GITHUB API ──
const GH = {
  BASE: 'https://api.github.com',

  _tok() {
    const t = STATE.tokens[STATE.activeTokenIdx];
    if (!t) throw new Error('No token loaded — add one in the TOKENS tab');
    return resolveToken(t.raw);
  },

  async req(path, opts) {
    opts = opts || {};
    const tok = GH._tok();
    const res = await fetch(GH.BASE + path, {
      method: opts.method || 'GET',
      body: opts.body,
      headers: Object.assign({
        'Authorization': 'Bearer ' + tok,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }, opts.headers || {}),
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + (data.message || res.statusText));
    return data;
  },

  // Verify a token before adding it to STATE — reads response headers too
  async verifyToken(rawToken) {
    const tok = resolveToken(rawToken);
    const res = await fetch(GH.BASE + '/user', {
      headers: {
        'Authorization': 'Bearer ' + tok,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    // Read body ONCE — cannot call res.json() twice
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error('GitHub ' + res.status + ': ' + (body.message || res.statusText));
    }
    const scopes = res.headers.get('X-OAuth-Scopes') || '';
    return { user: body, scopes: scopes };
  },

  async getUser()      { return GH.req('/user'); },
  async getRateLimit() { return GH.req('/rate_limit'); },
  async getUserOrgs()  { return GH.req('/user/orgs').catch(() => []); },

  async listRepos() {
    let all = [], page = 1;
    while (true) {
      const batch = await GH.req('/user/repos?per_page=100&page=' + page + '&sort=updated&type=all');
      if (!batch || !batch.length) break;
      all = all.concat(batch);
      if (batch.length < 100) break;
      page++;
      if (page > 5) break; // cap at 500 repos
    }
    return all;
  },

  async listContents(owner, repo, path, branch) {
    path = path || '';
    branch = branch || STATE.activeBranch || 'main';
    const url = '/repos/' + owner + '/' + repo + '/contents/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(branch);
    return GH.req(url);
  },

  async getFile(owner, repo, path, branch) {
    branch = branch || STATE.activeBranch || 'main';
    return GH.req('/repos/' + owner + '/' + repo + '/contents/' + encodeURIComponent(path) + '?ref=' + encodeURIComponent(branch));
  },

  async createOrUpdateFile(owner, repo, path, content, message, sha, branch) {
    branch = branch || STATE.activeBranch;
    const body = { message: message, branch: branch, content: btoa(unescape(encodeURIComponent(content))) };
    if (sha) body.sha = sha;
    const s = STATE.settings;
    if (s.gitName) body.committer = { name: s.gitName, email: s.gitEmail || s.gitName + '@users.noreply.github.com' };
    return GH.req('/repos/' + owner + '/' + repo + '/contents/' + encodeURIComponent(path), {
      method: 'PUT', body: JSON.stringify(body),
    });
  },

  async deleteFile(owner, repo, path, sha, message, branch) {
    return GH.req('/repos/' + owner + '/' + repo + '/contents/' + encodeURIComponent(path), {
      method: 'DELETE',
      body: JSON.stringify({ message: message, sha: sha, branch: branch || STATE.activeBranch }),
    });
  },

  async listBranches(owner, repo) {
    return GH.req('/repos/' + owner + '/' + repo + '/branches?per_page=100');
  },

  async createBranch(owner, repo, name, sha) {
    return GH.req('/repos/' + owner + '/' + repo + '/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/' + name, sha: sha }),
    });
  },

  async getRef(owner, repo, branch) {
    return GH.req('/repos/' + owner + '/' + repo + '/git/ref/heads/' + encodeURIComponent(branch));
  },

  async listReleases(owner, repo) {
    return GH.req('/repos/' + owner + '/' + repo + '/releases?per_page=20').catch(() => []);
  },

  async getPages(owner, repo) {
    return GH.req('/repos/' + owner + '/' + repo + '/pages').catch(() => null);
  },

  async enablePages(owner, repo, branch, path) {
    return GH.req('/repos/' + owner + '/' + repo + '/pages', {
      method: 'POST',
      body: JSON.stringify({ source: { branch: branch, path: path === '/ (root)' ? '/' : path } }),
    });
  },

  async updatePages(owner, repo, branch, path) {
    return GH.req('/repos/' + owner + '/' + repo + '/pages', {
      method: 'PUT',
      body: JSON.stringify({ source: { branch: branch, path: path === '/ (root)' ? '/' : path } }),
    });
  },

  async disablePages(owner, repo) {
    return GH.req('/repos/' + owner + '/' + repo + '/pages', { method: 'DELETE' });
  },

  async listWorkflows(owner, repo) {
    return GH.req('/repos/' + owner + '/' + repo + '/actions/workflows?per_page=50').catch(() => ({ workflows: [] }));
  },

  async listRuns(owner, repo, wfId) {
    return GH.req('/repos/' + owner + '/' + repo + '/actions/workflows/' + wfId + '/runs?per_page=10').catch(() => ({ workflow_runs: [] }));
  },

  async triggerWorkflow(owner, repo, wfId, branch) {
    return GH.req('/repos/' + owner + '/' + repo + '/actions/workflows/' + wfId + '/dispatches', {
      method: 'POST', body: JSON.stringify({ ref: branch }),
    });
  },

  async createRepo(name, desc, isPrivate, hasReadme, gitignore) {
    return GH.req('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: name, description: desc, private: isPrivate, auto_init: hasReadme, gitignore_template: gitignore || undefined }),
    });
  },

  async listDeployments(owner, repo) {
    return GH.req('/repos/' + owner + '/' + repo + '/deployments?per_page=20').catch(() => []);
  },

  async getCommits(owner, repo, branch, path) {
    let url = '/repos/' + owner + '/' + repo + '/commits?sha=' + encodeURIComponent(branch) + '&per_page=20';
    if (path) url += '&path=' + encodeURIComponent(path);
    return GH.req(url);
  },
};

// ── TOKEN MANAGER ──
const TOK = {
  detectTokenType(val) {
    const badge = document.getElementById('token-type-badge');
    if (!badge) return;
    const t = detectTokenType(val);
    const MAP = { 'fine-grain':['fine-grain','FINE-GRAINED PAT'], 'classic':['classic','CLASSIC PAT'], 'xcyber':['xcyber','XCYBER ENCODED'], 'oauth':['classic','OAUTH TOKEN'], 'server':['classic','SERVER TOKEN'] };
    const [cls, lbl] = MAP[t] || ['','UNKNOWN FORMAT'];
    badge.innerHTML = '<span class="token-badge ' + cls + '">' + (cls ? '✓ ' : '? ') + lbl + '</span>';
  },

  async loadB64Tokens() {
    const raw = document.getElementById('b64-token-input');
    if (!raw || !raw.value.trim()) return notify('Paste base64 token(s)', 'warn');
    const lines = raw.value.trim().split('\n').map(l => l.trim()).filter(Boolean);
    let loaded = 0;
    for (const line of lines) {
      try {
        const decoded = atob(line);
        await TOK._addToken(decoded.trim());
        loaded++;
      } catch (e) {
        notify('Line ' + (loaded + 1) + ': ' + e.message, 'error');
      }
    }
    if (loaded) notify('Loaded ' + loaded + ' token(s)', 'success');
  },

  async addManualToken() {
    const inp = document.getElementById('manual-token-input');
    if (!inp || !inp.value.trim()) return notify('Enter a token', 'warn');
    await TOK._addToken(inp.value.trim());
    inp.value = '';
  },

  async _addToken(raw) {
    if (!raw || raw.length < 8) { notify('Token too short or empty', 'error'); return; }
    if (STATE.tokens.find(t => t.raw === raw)) { notify('Token already loaded', 'warn'); return; }
    showProgress();
    try {
      const resolved = resolveToken(raw);
      const tokenType = detectTokenType(raw);
      console.log('[XCYBER] Token type:', tokenType, '| Resolved prefix:', resolved.slice(0, 14) + '...' + resolved.slice(-4));

      // Verify with GitHub — body read only once inside verifyToken
      const { user, scopes } = await GH.verifyToken(raw);
      if (!user || !user.login) { notify('GitHub returned no user — check token has read:user permission', 'error'); hideProgress(); return; }

      const entry = { raw: raw, resolved: resolved, type: tokenType, user: user.login, avatar: user.avatar_url || '', name: user.name || user.login, repos: [], scopes: scopes, id: Date.now() };
      STATE.tokens.push(entry);
      STATE.activeTokenIdx = STATE.tokens.length - 1;

      let repos = [];
      try { repos = await GH.listRepos(); } catch(e) { console.warn('[XCYBER] listRepos failed (token may have limited repo scope):', e.message); }
      entry.repos = repos.map(r => r.full_name);

      for (const r of repos) {
        if (!STATE.repos.find(x => x.full_name === r.full_name)) STATE.repos.push(r);
      }

      TOK.renderTokens();
      XC.renderRepoList();
      XC.updateStatus();
      notify('Token loaded: ' + user.login + ' — ' + repos.length + ' repo(s)', 'success');
    } catch (e) {
      console.error('[XCYBER] Token add failed:', e);
      STATE.tokens = STATE.tokens.filter(t => t.raw !== raw);
      STATE.activeTokenIdx = Math.max(0, Math.min(STATE.activeTokenIdx, STATE.tokens.length - 1));
      notify('Token error: ' + e.message, 'error');
    }
    hideProgress();
  },

  renderTokens() {
    const el = document.getElementById('active-tokens-list');
    if (!el) return;
    if (!STATE.tokens.length) {
      el.innerHTML = '<div class="text-muted" style="font-size:12px;">No tokens loaded</div>';
      const info = document.getElementById('token-info-display');
      if (info) info.innerHTML = '<div class="text-muted" style="font-size:12px;">Load a token to see info</div>';
      return;
    }
    el.innerHTML = STATE.tokens.map(function(t, i) {
      const cls = t.type === 'fine-grain' ? 'fine-grain' : t.type === 'xcyber' ? 'xcyber' : 'classic';
      return '<div class="repo-item ' + (i === STATE.activeTokenIdx ? 'active' : '') + '" onclick="TOK.setActive(' + i + ')" style="cursor:pointer">' +
        '<img src="' + t.avatar + '" style="width:24px;height:24px;border-radius:50%;border:1px solid var(--border2);" onerror="this.style.display=\'none\'">' +
        '<div class="flex flex-col gap-4" style="flex:1;min-width:0"><div class="repo-name">' + t.user + '</div><div class="repo-meta">' + t.type + ' · ' + t.repos.length + ' repo(s)</div></div>' +
        '<span class="token-badge ' + cls + '" style="font-size:9px">' + t.type.toUpperCase() + '</span>' +
        '<button class="btn sm danger" onclick="TOK.remove(' + i + ',event)" style="flex-shrink:0">✕</button></div>';
    }).join('');
    TOK.renderTokenInfo(STATE.tokens[STATE.activeTokenIdx]);
  },

  async renderTokenInfo(t) {
    const el = document.getElementById('token-info-display');
    if (!el || !t) return;
    try {
      const rate = await GH.getRateLimit().catch(() => null);
      const orgs = await GH.getUserOrgs().catch(() => []);
      const cls = t.type === 'fine-grain' ? 'fine-grain' : t.type === 'xcyber' ? 'xcyber' : 'classic';
      el.innerHTML =
        '<div class="flex gap-8 flex-wrap">' +
          '<div class="border-box p-8 flex flex-col gap-4" style="min-width:130px"><div class="lbl">USER</div><div class="text-accent bold">' + t.user + '</div><div class="text-muted mono" style="font-size:10px">' + t.name + '</div></div>' +
          '<div class="border-box p-8 flex flex-col gap-4" style="min-width:130px"><div class="lbl">TYPE</div><span class="token-badge ' + cls + '">' + t.type.toUpperCase() + '</span>' + (t.scopes ? '<div class="mono text-muted" style="font-size:9px;margin-top:4px">' + t.scopes + '</div>' : '') + '</div>' +
          (rate ? '<div class="border-box p-8 flex flex-col gap-4" style="min-width:130px"><div class="lbl">RATE LIMIT</div><div class="text-accent bold">' + rate.rate.remaining + ' / ' + rate.rate.limit + '</div><div class="text-muted mono" style="font-size:10px">Resets ' + new Date(rate.rate.reset * 1000).toLocaleTimeString() + '</div></div>' : '') +
          (orgs.length ? '<div class="border-box p-8 flex flex-col gap-4"><div class="lbl">ORGS</div><div class="mono" style="font-size:11px">' + orgs.map(function(o){return o.login;}).join(', ') + '</div></div>' : '') +
          '<div class="border-box p-8 flex flex-col gap-4" style="min-width:180px;max-width:280px"><div class="lbl">REPOS (' + t.repos.length + ')</div><div class="mono" style="font-size:10px;max-height:90px;overflow-y:auto;line-height:1.6">' + (t.repos.slice(0, 30).join('<br>') || 'None accessible') + (t.repos.length > 30 ? '<br><span class="text-muted">+' + (t.repos.length - 30) + ' more</span>' : '') + '</div></div>' +
        '</div>';
    } catch(e) {
      el.innerHTML = '<div class="text-danger">Info error: ' + e.message + '</div>';
    }
  },

  setActive(i) {
    STATE.activeTokenIdx = i;
    TOK.renderTokens();
    XC.updateStatus();
    notify('Active: ' + STATE.tokens[i].user, 'success');
  },

  remove(i, e) {
    e && e.stopPropagation();
    STATE.tokens.splice(i, 1);
    STATE.activeTokenIdx = Math.max(0, Math.min(STATE.activeTokenIdx, STATE.tokens.length - 1));
    TOK.renderTokens();
    XC.updateStatus();
    notify('Token removed', 'warn');
  },

  toggleShow(id) {
    var el = document.getElementById(id);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
  },

  encodeToken() {
    var raw = document.getElementById('encode-input');
    if (!raw || !raw.value.trim()) return notify('Enter a token to encode', 'warn');
    var encoded = xcyberEncode(raw.value.trim());
    document.getElementById('encoded-output').textContent = encoded;
    notify('Encoded! Store this safely.', 'success');
  },

  copyEncoded() {
    var text = document.getElementById('encoded-output');
    if (!text || !text.textContent) return notify('Nothing to copy', 'warn');
    navigator.clipboard.writeText(text.textContent).then(function(){ notify('Copied!', 'success'); });
  },
};

// ── AUTO-LOAD DEFAULT TOKENS ──
async function loadDefaultTokens() {
  for (var i = 0; i < DEFAULT_TOKENS.length; i++) {
    var entry = DEFAULT_TOKENS[i].trim();
    if (!entry) continue;
    try {
      var raw = entry.startsWith('xcyber_') ? entry : atob(entry);
      await TOK._addToken(raw.trim());
    } catch(e) {
      console.warn('XCYBER default token failed:', e.message);
      notify('Default token error: ' + e.message, 'error');
    }
  }
}

// ── MAIN XC APP ──
const XC = {
  monacoEditor: null,
  monacoReady: false,

  init() {
    XC.loadSettings();
    XC.bindTopbarTabs();
    XC.bindKeys();
    XC.initMonaco();
    XC.setupDropZones();
    XC.renderRepoList();
    XC.autoSaveLoop();
    TERM.init();
    setInterval(XC.updateStatus, 8000);
    XC.updateStatus();
    setTimeout(loadDefaultTokens, 600);
  },

  loadSettings() {
    try { STATE.settings = JSON.parse(localStorage.getItem('xcyber_settings') || '{}'); } catch(e) { STATE.settings = {}; }
    STATE.settings = Object.assign({ fontSize: 14, theme: 'xcyber-dark', tabSize: 2, minimap: true, wordWrap: true, autosave: 3000, gitName: '', gitEmail: '' }, STATE.settings);
  },

  saveSettings() {
    STATE.settings.fontSize  = +document.getElementById('set-font-size').value;
    STATE.settings.theme     = document.getElementById('set-theme').value;
    STATE.settings.tabSize   = +document.getElementById('set-tab').value;
    STATE.settings.minimap   = document.getElementById('set-minimap').checked;
    STATE.settings.wordWrap  = document.getElementById('set-wordwrap').checked;
    STATE.settings.autosave  = +document.getElementById('set-autosave').value;
    STATE.settings.gitName   = document.getElementById('set-git-name').value;
    STATE.settings.gitEmail  = document.getElementById('set-git-email').value;
    localStorage.setItem('xcyber_settings', JSON.stringify(STATE.settings));
    if (XC.monacoEditor) {
      XC.monacoEditor.updateOptions({ fontSize: STATE.settings.fontSize, tabSize: STATE.settings.tabSize, minimap: { enabled: STATE.settings.minimap }, wordWrap: STATE.settings.wordWrap ? 'on' : 'off' });
      if (window.monaco) monaco.editor.setTheme(STATE.settings.theme);
    }
    XC.closeModal('settings-modal');
    notify('Settings saved', 'success');
  },

  bindTopbarTabs() {
    document.querySelectorAll('.topbar-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.topbar-tab').forEach(function(t){ t.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
        tab.classList.add('active');
        var panel = document.getElementById(tab.dataset.panel);
        if (panel) panel.classList.add('active');
      });
    });
  },

  switchPanel(id) {
    var tab = document.querySelector('.topbar-tab[data-panel="' + id + '"]');
    if (tab) tab.click();
  },

  bindKeys() {
    document.addEventListener('keydown', function(e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 's') { e.preventDefault(); XC.saveCurrentFile(); }
      if (ctrl && !e.shiftKey && e.key === 'p') { e.preventDefault(); XC.commitPush(); }
      if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); TERM.focus(); }
      if (ctrl && e.key === 'f') { e.preventDefault(); XC.switchPanel('search-panel'); }
    });
  },

  setupDropZones() {
    var monacoWrap = document.getElementById('monaco-editor-container');
    if (monacoWrap) {
      monacoWrap.addEventListener('dragover', function(e){ e.preventDefault(); });
      monacoWrap.addEventListener('drop', function(e){
        e.preventDefault();
        var file = e.dataTransfer.files[0];
        if (file) XC.openFileFromDisk(file);
      });
    }
    [['image-editor-container','IMG'],['audio-editor-container','AUD'],['video-editor-container','VID']].forEach(function(pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      el.addEventListener('dragover', function(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      el.addEventListener('drop', function(e){
        e.preventDefault();
        var file = e.dataTransfer.files[0];
        if (file && window[pair[1]]) window[pair[1]].loadFile(file);
      });
    });
  },

  initMonaco() {
    require(['vs/editor/editor.main'], function(monaco) {
      window.monaco = monaco;
      monaco.editor.defineTheme('xcyber-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token:'comment',    foreground:'3d6080', fontStyle:'italic' },
          { token:'keyword',    foreground:'00aaff', fontStyle:'bold' },
          { token:'string',     foreground:'00ffff' },
          { token:'number',     foreground:'ffaa00' },
          { token:'type',       foreground:'0066ff' },
          { token:'identifier', foreground:'c8e0ff' },
          { token:'delimiter',  foreground:'7aafd4' },
          { token:'operator',   foreground:'00aaff' },
        ],
        colors: {
          'editor.background':                     '#000000',
          'editor.foreground':                     '#c8e0ff',
          'editor.lineHighlightBackground':        '#0a1220',
          'editor.lineHighlightBorder':            '#0d3060',
          'editorCursor.foreground':               '#00aaff',
          'editor.selectionBackground':            '#1a4a9055',
          'editor.inactiveSelectionBackground':    '#0d306030',
          'editorLineNumber.foreground':           '#3d6080',
          'editorLineNumber.activeForeground':     '#00aaff',
          'scrollbarSlider.background':            '#0d3060aa',
          'scrollbarSlider.hoverBackground':       '#1a4a90',
          'scrollbarSlider.activeBackground':      '#00aaff80',
          'editorWidget.background':               '#050a0f',
          'editorWidget.border':                   '#0d3060',
          'editorSuggestWidget.background':        '#0a1220',
          'editorSuggestWidget.border':            '#0d3060',
          'editorSuggestWidget.selectedBackground':'#0d1828',
          'editorSuggestWidget.highlightForeground':'#00aaff',
          'minimap.background':                    '#050a0f',
          'editorGutter.background':               '#000000',
          'editorIndentGuide.background1':         '#0d3060',
          'editorIndentGuide.activeBackground1':   '#1a4a90',
        },
      });
      monaco.editor.setTheme('xcyber-dark');

      XC.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor-container'), {
        value: WELCOME_CONTENT,
        language: 'markdown',
        theme: 'xcyber-dark',
        fontSize: STATE.settings.fontSize || 14,
        fontFamily: "'Share Tech Mono', 'Consolas', monospace",
        lineHeight: 20,
        tabSize: STATE.settings.tabSize || 2,
        minimap: { enabled: STATE.settings.minimap !== false },
        wordWrap: STATE.settings.wordWrap !== false ? 'on' : 'off',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'phase',
        cursorSmoothCaretAnimation: 'on',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        formatOnPaste: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        folding: true,
        padding: { top: 8 },
      });

      XC.monacoReady = true;

      XC.monacoEditor.onDidChangeCursorPosition(function(e) {
        var sc = document.getElementById('status-cursor');
        if (sc) sc.textContent = 'Ln ' + e.position.lineNumber + ', Col ' + e.position.column;
      });

      XC.monacoEditor.onDidChangeModelContent(function() {
        if (STATE.activeFile && STATE.openFiles[STATE.activeFile]) {
          STATE.openFiles[STATE.activeFile].dirty = true;
          XC.updateTabDirty(STATE.activeFile);
        }
      });

      // Populate language selector
      var langs = monaco.languages.getLanguages().map(function(l){ return l.id; }).sort();
      var sel = document.getElementById('editor-lang-select');
      if (sel) {
        langs.forEach(function(l){ var o = document.createElement('option'); o.value = o.textContent = l; sel.appendChild(o); });
        sel.value = 'markdown';
      }

      // Open welcome now that Monaco is ready
      STATE.openFiles['welcome'] = { content: WELCOME_CONTENT, sha: null, dirty: false, lang: 'markdown' };
      STATE.activeFile = 'welcome';
      XC._createTabDOM('welcome');
      document.querySelectorAll('.editor-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.file === 'welcome'); });
    });
  },

  openWelcomeTab() {
    // Called before Monaco is ready — just set state, DOM tab created after Monaco loads
    STATE.openFiles['welcome'] = { content: WELCOME_CONTENT, sha: null, dirty: false, lang: 'markdown' };
    STATE.activeFile = 'welcome';
  },

  _createTabDOM(path) {
    var existing = document.querySelector('.editor-tab[data-file="' + CSS.escape(path) + '"]');
    if (existing) return existing;
    var tab = document.createElement('div');
    tab.className = 'editor-tab';
    tab.dataset.file = path;
    var name = path.split('/').pop();
    tab.innerHTML = '<span class="tab-name">' + name + '</span><span class="close-tab">✕</span>';
    tab.addEventListener('click', function(e) {
      if (e.target.classList.contains('close-tab')) XC.closeTab(path, e);
      else XC.activateTab(path);
    });
    document.getElementById('editor-tabs').appendChild(tab);
    return tab;
  },

  openFileFromDisk(file) {
    var MAX = 5 * 1024 * 1024;
    var reader = new FileReader();
    reader.onload = function(e) {
      var content = e.target.result;
      var path = file.name;
      STATE.openFiles[path] = { content: content.length > MAX ? content.slice(0, MAX) + '\n\n[... FILE TRUNCATED — TOO LARGE ...]' : content, sha: null, dirty: false, lang: XC.langFromExt(path) };
      XC.openTab(path);
      if (content.length > MAX) notify('File >5MB — truncated', 'warn');
    };
    reader.readAsText(file);
  },

  langFromExt(path) {
    var ext = (path || '').split('.').pop().toLowerCase();
    var MAP = { js:'javascript', ts:'typescript', jsx:'javascript', tsx:'typescript', html:'html', htm:'html', css:'css', scss:'scss', less:'less', py:'python', rb:'ruby', go:'go', rs:'rust', cpp:'cpp', cc:'cpp', c:'c', cs:'csharp', java:'java', kt:'kotlin', swift:'swift', sh:'shell', bash:'shell', zsh:'shell', json:'json', yaml:'yaml', yml:'yaml', md:'markdown', markdown:'markdown', txt:'plaintext', sql:'sql', xml:'xml', php:'php', r:'r', lua:'lua', dart:'dart', vue:'html', svelte:'html', toml:'ini', env:'ini', gitignore:'plaintext' };
    return MAP[ext] || 'plaintext';
  },

  setEditorContent(content, path) {
    if (!XC.monacoEditor || !window.monaco) return;
    var lang = XC.langFromExt(path || '');
    var oldModel = XC.monacoEditor.getModel();
    var newModel = monaco.editor.createModel(content || '', lang);
    XC.monacoEditor.setModel(newModel);
    if (oldModel) oldModel.dispose(); // prevent memory leak
    var sel = document.getElementById('editor-lang-select');
    if (sel) sel.value = lang;
    var sz = document.getElementById('file-size-label');
    if (sz) sz.textContent = XC.fmtBytes(new TextEncoder().encode(content || '').length);
  },

  fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  },

  openTab(path) {
    XC._createTabDOM(path);
    XC.activateTab(path);
  },

  activateTab(path) {
    document.querySelectorAll('.editor-tab').forEach(function(t){ t.classList.toggle('active', t.dataset.file === path); });
    STATE.activeFile = path;
    var f = STATE.openFiles[path];
    if (f) {
      XC.setEditorContent(f.content, path);
      var sf = document.getElementById('status-file');
      if (sf) sf.textContent = path.split('/').pop();
    }
    // Ensure editor panel is active
    var panel = document.getElementById('editor-panel');
    if (panel && !panel.classList.contains('active')) XC.switchPanel('editor-panel');
  },

  closeTab(path, e) {
    if (e) e.stopPropagation();
    var f = STATE.openFiles[path];
    if (f && f.dirty && path !== 'welcome' && !confirm('Unsaved changes in ' + path.split('/').pop() + '. Close anyway?')) return;
    delete STATE.openFiles[path];
    var tab = document.querySelector('.editor-tab[data-file="' + CSS.escape(path) + '"]');
    if (tab) tab.remove();
    var tabs = document.querySelectorAll('.editor-tab');
    if (tabs.length) XC.activateTab(tabs[tabs.length - 1].dataset.file);
    else { STATE.activeFile = null; if (XC.monacoEditor) XC.monacoEditor.setValue(''); }
  },

  updateTabDirty(path) {
    var tab = document.querySelector('.editor-tab[data-file="' + CSS.escape(path) + '"]');
    if (!tab) return;
    var nameEl = tab.querySelector('.tab-name');
    if (nameEl) nameEl.textContent = (STATE.openFiles[path] && STATE.openFiles[path].dirty ? '● ' : '') + path.split('/').pop();
  },

  setEditorLanguage(lang) {
    if (!XC.monacoEditor || !window.monaco) return;
    var model = XC.monacoEditor.getModel();
    if (model) monaco.editor.setModelLanguage(model, lang);
  },

  editorAction(action) {
    if (!XC.monacoEditor) return;
    if (action === 'format') XC.monacoEditor.getAction('editor.action.formatDocument') && XC.monacoEditor.getAction('editor.action.formatDocument').run();
    if (action === 'copy') {
      var sel = XC.monacoEditor.getSelection();
      var model = XC.monacoEditor.getModel();
      var text = (sel && !sel.isEmpty()) ? (model && model.getValueInRange(sel)) : XC.monacoEditor.getValue();
      navigator.clipboard.writeText(text || '').then(function(){ notify('Copied!', 'success'); });
    }
  },

  async saveCurrentFile() {
    if (!STATE.activeFile || STATE.activeFile === 'welcome') return notify('Open a repo file first', 'warn');
    if (!STATE.activeRepo) return notify('Select a repo first', 'warn');
    showProgress();
    try {
      var content = XC.monacoEditor.getValue();
      STATE.openFiles[STATE.activeFile].content = content;
      STATE.pendingCommits[STATE.activeFile] = content;
      STATE.openFiles[STATE.activeFile].dirty = false;
      XC.updateTabDirty(STATE.activeFile);
      XC.updateGitStatus();
      notify('Staged: ' + STATE.activeFile.split('/').pop() + ' — PUSH to upload', 'success');
    } catch(e) { notify('Save error: ' + e.message, 'error'); }
    hideProgress();
  },

  async loadFileFromGitHub(path) {
    var r = STATE.activeRepo;
    if (!r) return notify('No repo selected', 'warn');
    showProgress();
    try {
      var data = await GH.getFile(r.owner.login, r.name, path, STATE.activeBranch);
      if (Array.isArray(data)) { notify('That is a directory', 'warn'); hideProgress(); return; }
      if (!data || !data.content) { notify('File is empty or binary', 'warn'); hideProgress(); return; }
      var content = ghBase64Decode(data.content);
      var MAX = 5 * 1024 * 1024;
      if (content.length > MAX) {
        content = content.slice(0, MAX) + '\n\n[... TRUNCATED — FILE TOO LARGE ...]';
        notify('File >5MB — truncated', 'warn');
      }
      STATE.openFiles[path] = { content: content, sha: data.sha, dirty: false, lang: XC.langFromExt(path) };
      XC.openTab(path);
      notify('Loaded: ' + path.split('/').pop(), 'success');
    } catch(e) { notify('Load error: ' + e.message, 'error'); }
    hideProgress();
  },

  exportCurrentFile() {
    if (!XC.monacoEditor) return;
    var content = XC.monacoEditor.getValue();
    var name = (STATE.activeFile || 'file.txt').split('/').pop();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = name; a.click();
    notify('Exported: ' + name, 'success');
  },

  importFile() {
    var inp = document.createElement('input'); inp.type = 'file';
    inp.onchange = function(e){ var f = e.target.files[0]; if (f) XC.openFileFromDisk(f); };
    inp.click();
  },

  previewCurrentFile() {
    if (!XC.monacoEditor) return;
    var content = XC.monacoEditor.getValue();
    var ext = (STATE.activeFile || '').split('.').pop().toLowerCase();
    var overlay = document.getElementById('preview-overlay');
    var container = document.getElementById('preview-content');
    overlay.classList.remove('hidden');
    if (ext === 'md' || ext === 'markdown') {
      container.innerHTML = DOMPurify.sanitize(marked.parse(content));
      container.style.padding = '24px';
    } else if (ext === 'html' || ext === 'htm') {
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:calc(100vh - 90px);border:none;background:#fff';
      iframe.srcdoc = content;
      container.innerHTML = ''; container.style.padding = '0';
      container.appendChild(iframe);
    } else {
      container.innerHTML = '<pre style="padding:16px;font-family:var(--mono);font-size:12px;white-space:pre-wrap;color:var(--text)">' + content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</pre>';
    }
  },

  closePreview() { var o = document.getElementById('preview-overlay'); if (o) o.classList.add('hidden'); },

  async deleteCurrentFile() {
    if (!STATE.activeFile || STATE.activeFile === 'welcome') return notify('No file to delete', 'warn');
    if (!confirm('Delete ' + STATE.activeFile + '?')) return;
    var f = STATE.openFiles[STATE.activeFile];
    var r = STATE.activeRepo;
    if (f && f.sha && r) {
      showProgress();
      try {
        await GH.deleteFile(r.owner.login, r.name, STATE.activeFile, f.sha, 'Delete ' + STATE.activeFile + ' via XCYBER', STATE.activeBranch);
        notify('Deleted from GitHub', 'success');
        XC.closeTab(STATE.activeFile);
        XC.loadFileTree();
      } catch(e) { notify('Delete error: ' + e.message, 'error'); }
      hideProgress();
    } else { XC.closeTab(STATE.activeFile); notify('Removed locally', 'success'); }
  },

  openModal(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('open');
    if (id === 'settings-modal')   XC.populateSettings();
    if (id === 'commit-modal')     XC.populateCommitFiles();
    if (id === 'new-branch-modal') XC.populateBranchFrom();
  },

  closeModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('open'); },

  populateSettings() {
    var s = STATE.settings;
    document.getElementById('set-font-size').value = s.fontSize;
    document.getElementById('set-theme').value     = s.theme;
    document.getElementById('set-tab').value       = s.tabSize;
    document.getElementById('set-minimap').checked = s.minimap;
    document.getElementById('set-wordwrap').checked = s.wordWrap;
    document.getElementById('set-autosave').value  = s.autosave;
    document.getElementById('set-git-name').value  = s.gitName || '';
    document.getElementById('set-git-email').value = s.gitEmail || '';
  },

  populateCommitFiles() {
    var all = [];
    Object.keys(STATE.pendingCommits).forEach(function(p){ if (all.indexOf(p) < 0) all.push(p); });
    Object.entries(STATE.openFiles).forEach(function(pair){ var p=pair[0],f=pair[1]; if (f.dirty && p !== 'welcome' && all.indexOf(p) < 0) all.push(p); });
    document.getElementById('commit-files-list').innerHTML = all.length
      ? all.map(function(p){ return '<div class="text-warn">M&nbsp;' + p + '</div>'; }).join('')
      : '<span class="text-muted">No staged changes. Use Ctrl+S to stage files first.</span>';
  },

  populateBranchFrom() {
    var sel = document.getElementById('branch-from');
    if (!sel) return;
    sel.innerHTML = document.getElementById('branch-select').innerHTML;
  },

  renderRepoList() {
    var el = document.getElementById('repo-list-sidebar');
    if (!el) return;
    if (!STATE.repos.length) { el.innerHTML = '<div class="text-muted" style="font-size:11px;padding:4px 8px;">Add a token to see repos</div>'; return; }
    el.innerHTML = STATE.repos.map(function(r) {
      return '<div class="tree-item ' + (STATE.activeRepo && STATE.activeRepo.full_name === r.full_name ? 'active' : '') + '" onclick="XC.selectRepo(\'' + r.full_name.replace(/'/g,"\\'") + '\')">' +
        '<span class="icon">' + (r.private ? '🔒' : '📦') + '</span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.name + '</span></div>';
    }).join('');
  },

  async selectRepo(fullName) {
    var repo = STATE.repos.find(function(r){ return r.full_name === fullName; });
    if (!repo) return;
    STATE.activeRepo = repo;
    showProgress();
    try {
      var branches = await GH.listBranches(repo.owner.login, repo.name);
      var sel = document.getElementById('branch-select');
      if (sel) {
        sel.innerHTML = '';
        branches.forEach(function(b) {
          var o = document.createElement('option');
          o.value = o.textContent = b.name;
          if (b.name === (repo.default_branch || 'main')) o.selected = true;
          sel.appendChild(o);
        });
        STATE.activeBranch = sel.value;
      }
      await XC.loadFileTree();
      XC.renderRepoList();
      XC.updateStatus();
      notify('Repo: ' + fullName, 'success');
    } catch(e) { notify('Repo error: ' + e.message, 'error'); }
    hideProgress();
  },

  async loadFileTree(path) {
    path = path || '';
    var r = STATE.activeRepo;
    if (!r) return;
    showProgress();
    try {
      var items = await GH.listContents(r.owner.login, r.name, path, STATE.activeBranch);
      if (!Array.isArray(items)) { hideProgress(); return; }
      if (!path) {
        var tree = document.getElementById('file-tree');
        tree.innerHTML = '';
        XC.renderTreeItems(items, tree, 0, '');
      }
      XC.updateGitStatus();
    } catch(e) { notify('Tree error: ' + e.message, 'error'); }
    hideProgress();
  },

  renderTreeItems(items, container, depth, parentPath) {
    if (!Array.isArray(items)) return;
    items.sort(function(a,b){
      if (a.type==='dir' && b.type!=='dir') return -1;
      if (b.type==='dir' && a.type!=='dir') return 1;
      return a.name.localeCompare(b.name);
    });
    items.forEach(function(item) {
      var el = document.createElement('div');
      el.className = 'tree-item';
      el.style.paddingLeft = (10 + depth * 14) + 'px';
      var fullPath = parentPath ? parentPath + '/' + item.name : item.name;
      el.innerHTML = '<span class="icon">' + (item.type === 'dir' ? '📁' : XC.fileIcon(item.name)) + '</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">' + item.name + '</span>';
      if (item.type === 'dir') {
        el.classList.add('folder');
        var open = false, subContainer = null;
        el.addEventListener('click', async function() {
          if (!open) {
            open = true;
            el.querySelector('.icon').textContent = '📂';
            subContainer = document.createElement('div');
            el.after(subContainer);
            try {
              var children = await GH.listContents(STATE.activeRepo.owner.login, STATE.activeRepo.name, fullPath, STATE.activeBranch);
              XC.renderTreeItems(children, subContainer, depth + 1, fullPath);
            } catch(e) { notify('Folder error: ' + e.message, 'error'); }
          } else {
            open = false;
            el.querySelector('.icon').textContent = '📁';
            if (subContainer) { subContainer.remove(); subContainer = null; }
          }
        });
      } else {
        el.addEventListener('click', function(){ XC.loadFileFromGitHub(fullPath); });
      }
      container.appendChild(el);
    });
  },

  fileIcon(name) {
    var ext = (name||'').split('.').pop().toLowerCase();
    var M = { js:'🟨',ts:'🔷',jsx:'🟨',tsx:'🔷',html:'🟧',htm:'🟧',css:'🟦',scss:'🟣',py:'🐍',md:'📝',json:'📋',yml:'⚙',yaml:'⚙',sh:'💲',png:'🖼',jpg:'🖼',jpeg:'🖼',gif:'🎞',mp3:'🎵',mp4:'🎬',pdf:'📄',svg:'🖌',lock:'🔒',env:'🔐',go:'🐹',rs:'🦀',rb:'💎' };
    return M[ext] || '📄';
  },

  async switchBranch(branch) {
    STATE.activeBranch = branch;
    await XC.loadFileTree();
    XC.updateStatus();
    notify('Branch: ' + branch, 'success');
  },

  async pullBranch() { notify('Refreshing...', 'success'); await XC.loadFileTree(); },

  async createNewFile() {
    var name = document.getElementById('new-file-name') && document.getElementById('new-file-name').value.trim();
    var tmpl = document.getElementById('new-file-template') && document.getElementById('new-file-template').value;
    if (!name) return notify('Enter a file name', 'warn');
    var content = TEMPLATES[tmpl] || '';
    STATE.openFiles[name] = { content: content, sha: null, dirty: true, lang: XC.langFromExt(name) };
    STATE.pendingCommits[name] = content;
    XC.openTab(name);
    XC.closeModal('new-file-modal');
    notify('Created: ' + name, 'success');
  },

  async createRepo() {
    var name  = document.getElementById('new-repo-name').value.trim();
    var desc  = document.getElementById('new-repo-desc').value.trim();
    var priv  = document.getElementById('new-repo-vis').value === 'private';
    var readme = document.getElementById('new-repo-readme').checked;
    var gi    = document.getElementById('new-repo-gitignore').value;
    if (!name) return notify('Enter repo name', 'warn');
    showProgress();
    try {
      var repo = await GH.createRepo(name, desc, priv, readme, gi);
      STATE.repos.unshift(repo);
      XC.renderRepoList();
      XC.closeModal('new-repo-modal');
      notify('Repo created: ' + repo.full_name, 'success');
    } catch(e) { notify('Error: ' + e.message, 'error'); }
    hideProgress();
  },

  async createBranch() {
    var name = document.getElementById('new-branch-name').value.trim();
    var from = document.getElementById('branch-from').value;
    var r = STATE.activeRepo;
    if (!name || !r) return notify('Enter branch name and select a repo', 'warn');
    showProgress();
    try {
      var ref = await GH.getRef(r.owner.login, r.name, from);
      await GH.createBranch(r.owner.login, r.name, name, ref.object.sha);
      var sel = document.getElementById('branch-select');
      if (sel) { var o = document.createElement('option'); o.value = o.textContent = name; sel.appendChild(o); sel.value = name; }
      STATE.activeBranch = name;
      XC.closeModal('new-branch-modal');
      notify('Branch created: ' + name, 'success');
    } catch(e) { notify('Branch error: ' + e.message, 'error'); }
    hideProgress();
  },

  commitPush() {
    if (!STATE.activeRepo) return notify('Select a repo first', 'warn');
    var all = [];
    Object.keys(STATE.pendingCommits).forEach(function(p){ if (all.indexOf(p)<0) all.push(p); });
    Object.entries(STATE.openFiles).forEach(function(pair){ var p=pair[0],f=pair[1]; if (f.dirty && p !== 'welcome' && all.indexOf(p)<0) all.push(p); });
    if (!all.length) return notify('No changes — Ctrl+S to stage files first', 'warn');
    XC.openModal('commit-modal');
  },

  async doCommitPush() {
    var msg = document.getElementById('commit-msg').value.trim() || 'Update via XCYBER IDE';
    var r = STATE.activeRepo;
    if (!r) return;
    var toCommit = {};
    Object.entries(STATE.pendingCommits).forEach(function(p){ toCommit[p[0]] = p[1]; });
    Object.entries(STATE.openFiles).forEach(function(pair){
      var path=pair[0], f=pair[1];
      if (f.dirty && path !== 'welcome') toCommit[path] = (XC.monacoEditor && STATE.activeFile === path) ? XC.monacoEditor.getValue() : f.content;
    });
    if (!Object.keys(toCommit).length) return notify('Nothing to commit', 'warn');
    XC.closeModal('commit-modal');
    showProgress();
    TERM.log('Pushing ' + Object.keys(toCommit).length + ' file(s): "' + msg + '"', 'info');
    var ok = 0, fail = 0;
    for (var entry of Object.entries(toCommit)) {
      var path = entry[0], content = entry[1];
      try {
        var sha = STATE.openFiles[path] && STATE.openFiles[path].sha || null;
        var res = await GH.createOrUpdateFile(r.owner.login, r.name, path, content, msg, sha, STATE.activeBranch);
        if (STATE.openFiles[path]) {
          STATE.openFiles[path].sha = res.content && res.content.sha || sha;
          STATE.openFiles[path].dirty = false;
          XC.updateTabDirty(path);
        }
        delete STATE.pendingCommits[path];
        TERM.log('  ✓ ' + path, 'success');
        ok++;
      } catch(e) { TERM.log('  ✗ ' + path + ': ' + e.message, 'error'); fail++; }
    }
    TERM.log('Done: ' + ok + ' pushed, ' + fail + ' failed', ok && !fail ? 'success' : 'warn');
    notify('Pushed ' + ok + '/' + (ok + fail) + ' files', ok ? 'success' : 'error');
    await XC.loadFileTree();
    XC.updateGitStatus();
    hideProgress();
  },

  updateGitStatus() {
    var dirty = [];
    Object.keys(STATE.pendingCommits).forEach(function(p){ if (dirty.indexOf(p)<0) dirty.push(p); });
    Object.entries(STATE.openFiles).forEach(function(pair){ var p=pair[0],f=pair[1]; if (f.dirty && p!=='welcome' && dirty.indexOf(p)<0) dirty.push(p); });
    var el = document.getElementById('git-status-sidebar');
    if (!el) return;
    el.innerHTML = dirty.length
      ? dirty.map(function(p){ return '<div class="text-warn" style="font-size:11px">M ' + p.split('/').pop() + '</div>'; }).join('') + '<div class="text-muted" style="font-size:10px;margin-top:2px">' + dirty.length + ' modified</div>'
      : '<span class="text-success" style="font-size:11px">✓ Clean</span>';
  },

  updateStatus() {
    var t = STATE.tokens[STATE.activeTokenIdx];
    var $ = function(id){ return document.getElementById(id); };
    if ($('status-token')) $('status-token').textContent = t ? ('🔑 ' + t.user) : 'No token';
    if ($('status-repo'))  $('status-repo').textContent  = STATE.activeRepo ? STATE.activeRepo.name : 'No repo';
    if ($('status-branch'))$('status-branch').textContent = STATE.activeBranch || '—';
    if ($('status-file'))  $('status-file').textContent  = STATE.activeFile ? STATE.activeFile.split('/').pop() : '—';
    var net = $('status-net');
    if (net) { net.textContent = navigator.onLine ? '● ONLINE' : '● OFFLINE'; net.style.color = navigator.onLine ? 'var(--success)' : 'var(--danger)'; }
    var prompt = $('terminal-prompt');
    if (prompt) prompt.textContent = STATE.activeRepo ? 'xcyber@' + STATE.activeRepo.name + '[' + STATE.activeBranch + ']$' : 'xcyber@git:~$';
  },

  autoSaveLoop() {
    setInterval(function() {
      var delay = STATE.settings.autosave;
      if (!delay || delay === 'off' || !XC.monacoEditor || !STATE.activeFile || STATE.activeFile === 'welcome') return;
      var content = XC.monacoEditor.getValue();
      var f = STATE.openFiles[STATE.activeFile];
      if (f && content !== f.content) { f.content = content; f.dirty = true; XC.updateTabDirty(STATE.activeFile); }
    }, STATE.settings.autosave || 3000);
  },
};

// ── FILE TEMPLATES ──
const TEMPLATES = {
  blank: '',
  html: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n\n</body>\n</html>',
  css: '/* Stylesheet */\n:root {\n  --primary: #0af;\n  --bg: #000;\n}\n* { box-sizing: border-box; margin: 0; padding: 0; }\n',
  js: "'use strict';\n\nexport function main() {\n\n}\n",
  md: '# Title\n\nDescription.\n\n## Section\n\nContent here.\n',
  json: '{\n  "name": "",\n  "version": "1.0.0",\n  "description": ""\n}\n',
  gitignore: 'node_modules/\n.env\n.DS_Store\ndist/\nbuild/\n*.log\n.vercel\n',
  workflow: 'name: CI\n\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Run\n        run: echo "Hello from XCYBER"\n',
};

// ── WELCOME CONTENT ──
const WELCOME_CONTENT = '# \u26A1 XCYBER IDE\n\nWelcome to the XCyber GitHub IDE.\n\n## Quick Start\n\n1. Go to the **TOKENS** tab and add your GitHub token\n2. Or add base64-encoded tokens to `DEFAULT_TOKENS` in `script-part-1.js` top\n3. Select a repo from the sidebar\n4. Click any file in the tree to open it\n5. Edit with Monaco (same as VS Code)\n6. **Ctrl+S** to stage, then **PUSH** to commit\n\n## Token Formats\n\n- `github_pat_...` — Fine-grained PAT\n- `ghp_...` — Classic PAT  \n- `xcyber_...` — XCYBER encoded\n- Base64 of any above — paste in TOKENS tab\n\n## Shortcuts\n\n- **Ctrl+S** — Stage file\n- **Ctrl+P** — Push dialog\n- **Ctrl+F** — Search\n- **Ctrl+Shift+P** — Terminal\n\n---\n*XCYBER IDE — Hacker Edition*\n';

// ── SEARCH ──
const SRCH = {
  search(query) {
    var results = document.getElementById('search-results');
    if (!query || !query.trim()) { results.innerHTML = ''; return; }
    var caseSens = document.getElementById('search-case') && document.getElementById('search-case').checked;
    var type = (document.getElementById('search-type') && document.getElementById('search-type').value) || 'content';
    var q = caseSens ? query : query.toLowerCase();
    var matches = [];
    Object.entries(STATE.openFiles).forEach(function(pair) {
      var path = pair[0], f = pair[1];
      if (type === 'filename') {
        if ((caseSens ? path : path.toLowerCase()).includes(q)) matches.push({ path: path, line: 0, text: path });
        return;
      }
      f.content.split('\n').forEach(function(line, i) {
        var l = caseSens ? line : line.toLowerCase();
        var hit;
        if (type === 'regex') { try { hit = new RegExp(query, caseSens ? '' : 'i').test(line); } catch(e) { hit = false; } }
        else hit = l.includes(q);
        if (hit) matches.push({ path: path, line: i + 1, text: line.trim().slice(0, 120) });
      });
    });
    results.innerHTML = matches.slice(0, 200).map(function(m) {
      return '<div class="search-result-item" onclick="XC.activateTab(\'' + m.path.replace(/'/g,"\\'") + '\')">' +
        '<div class="sr-file">' + m.path + (m.line ? ':' + m.line : '') + '</div>' +
        '<div class="sr-line">' + m.text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</div></div>';
    }).join('') + (matches.length > 200 ? '<div class="search-result-item text-muted">' + (matches.length - 200) + ' more...</div>' : '');
  },

  replaceAll() {
    var query = document.getElementById('search-input') && document.getElementById('search-input').value;
    var replace = (document.getElementById('replace-input') && document.getElementById('replace-input').value) || '';
    if (!query) return notify('Enter search query', 'warn');
    var caseSens = document.getElementById('search-case') && document.getElementById('search-case').checked;
    var count = 0;
    Object.entries(STATE.openFiles).forEach(function(pair) {
      var path = pair[0], f = pair[1];
      var re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), caseSens ? 'g' : 'gi');
      var updated = f.content.replace(re, function(){ count++; return replace; });
      if (updated !== f.content) {
        f.content = updated; f.dirty = true;
        if (STATE.activeFile === path && XC.monacoEditor) XC.monacoEditor.setValue(updated);
        XC.updateTabDirty(path);
      }
    });
    notify('Replaced ' + count + ' occurrence(s)', 'success');
  },
};

// ── DEPLOY PANEL ──
const DEP = {
  async refresh() {
    var r = STATE.activeRepo;
    if (!r) return notify('Select a repo first', 'warn');
    showProgress();
    try {
      var grid = document.getElementById('deploy-grid');
      var results = await Promise.all([GH.getPages(r.owner.login, r.name), GH.listDeployments(r.owner.login, r.name), GH.listReleases(r.owner.login, r.name)]);
      var pages = results[0], deps = results[1], releases = results[2];
      var cards = [];
      if (pages) {
        cards.push('<div class="deploy-card"><div class="flex gap-8" style="align-items:center;margin-bottom:8px"><span style="font-weight:700;color:var(--accent)">📄 GitHub Pages</span><span class="deploy-status live">LIVE</span></div><a class="deploy-url" href="' + pages.html_url + '" target="_blank">' + pages.html_url + '</a><div class="text-muted mono" style="font-size:10px;margin-top:4px">Branch: ' + (pages.source && pages.source.branch || '?') + ' / ' + (pages.source && pages.source.path || '/') + '</div><div class="flex gap-6 mt-8"><button class="btn sm" onclick="window.open(\'' + pages.html_url + '\',\'_blank\')">↗ OPEN</button><button class="btn sm" onclick="navigator.clipboard.writeText(\'' + pages.html_url + '\').then(function(){notify(\'Copied!\',\'success\')})">COPY URL</button></div></div>');
      } else {
        cards.push('<div class="deploy-card"><div style="font-weight:700;color:var(--text2);margin-bottom:8px">📄 GitHub Pages</div><div class="text-muted" style="font-size:12px">Not enabled</div><button class="btn sm primary mt-8" onclick="DEP.deployGHPages()">⚡ ENABLE PAGES</button></div>');
      }
      if (deps && deps.length) cards.push('<div class="deploy-card"><div style="font-weight:700;color:var(--accent);margin-bottom:8px">🚀 Deployments (' + deps.length + ')</div>' + deps.slice(0,5).map(function(d){ return '<div style="font-size:11px;margin-bottom:3px"><span class="mono text-accent">' + d.environment + '</span> <span class="text-muted">' + new Date(d.created_at).toLocaleDateString() + '</span></div>'; }).join('') + '</div>');
      if (releases && releases.length) { var rel = releases[0]; cards.push('<div class="deploy-card"><div style="font-weight:700;color:var(--accent);margin-bottom:8px">🏷 Latest Release</div><div class="repo-name">' + rel.tag_name + '</div><a class="deploy-url" href="' + rel.html_url + '" target="_blank" style="font-size:10px">' + rel.html_url + '</a></div>'); }
      cards.push('<div class="deploy-card"><div style="font-weight:700;color:var(--text2);margin-bottom:8px">▲ Vercel</div><div class="text-muted" style="font-size:11px">Deploy on Vercel instantly.</div><button class="btn sm mt-8" onclick="DEP.openVercel()">↗ VERCEL</button></div>');
      cards.push('<div class="deploy-card"><div style="font-weight:700;color:var(--text2);margin-bottom:8px">◆ Netlify</div><div class="text-muted" style="font-size:11px">Deploy on Netlify.</div><button class="btn sm mt-8" onclick="DEP.openNetlify()">↗ NETLIFY</button></div>');
      grid.innerHTML = cards.join('');
    } catch(e) { notify('Deploy error: ' + e.message, 'error'); }
    hideProgress();
  },
  async deployGHPages() {
    var r = STATE.activeRepo; if (!r) return notify('Select a repo first', 'warn');
    var branch = (document.getElementById('pages-branch') && document.getElementById('pages-branch').value) || 'gh-pages';
    var path = (document.getElementById('pages-folder') && document.getElementById('pages-folder').value) || '/ (root)';
    showProgress();
    try { await GH.enablePages(r.owner.login, r.name, branch, path).catch(function(){ return GH.updatePages(r.owner.login, r.name, branch, path); }); notify('GitHub Pages configured!', 'success'); await DEP.refresh(); } catch(e) { notify('Pages error: ' + e.message, 'error'); }
    hideProgress();
  },
  savePages() { return DEP.deployGHPages(); },
  async disablePages() { var r=STATE.activeRepo; if (!r||!confirm('Disable GitHub Pages?')) return; showProgress(); try { await GH.disablePages(r.owner.login,r.name); notify('Pages disabled','warn'); } catch(e){notify(e.message,'error');} hideProgress(); },
  openVercel()  { window.open('https://vercel.com/new/git/external?repository-url=https://github.com/' + (STATE.activeRepo && STATE.activeRepo.full_name || ''), '_blank'); },
  openNetlify() { window.open('https://app.netlify.com/start', '_blank'); },
};

// ── ACTIONS PANEL ──
const ACT = {
  async refresh() {
    var r = STATE.activeRepo; if (!r) return notify('Select a repo first', 'warn');
    showProgress();
    try {
      var wf = await GH.listWorkflows(r.owner.login, r.name);
      var list = document.getElementById('actions-list');
      if (!wf.workflows || !wf.workflows.length) { list.innerHTML = '<div class="text-muted p-8">No workflows found</div>'; hideProgress(); return; }
      var cards = await Promise.all(wf.workflows.map(async function(w) {
        var runs = await GH.listRuns(r.owner.login, r.name, w.id);
        var last = runs.workflow_runs && runs.workflow_runs[0];
        var sc = !last ? '' : last.conclusion === 'success' ? 'live' : last.status === 'in_progress' ? 'building' : 'error';
        return '<div class="action-card"><div class="flex gap-8" style="align-items:center;margin-bottom:6px"><div class="action-name">' + w.name + '</div>' + (last ? '<span class="deploy-status ' + sc + '">' + (last.conclusion || last.status) + '</span>' : '') + '</div><div class="action-trigger text-muted">' + w.path + '</div>' + (last ? '<div class="text-muted mono" style="font-size:10px;margin-top:4px">' + new Date(last.created_at).toLocaleString() + ' · ' + (last.actor && last.actor.login || '') + '</div>' : '') + '<div class="flex gap-6 mt-8"><button class="btn sm primary" onclick="ACT.trigger(' + w.id + ')">▶ TRIGGER</button><button class="btn sm" onclick="window.open(\'' + w.html_url + '\',\'_blank\')">↗ GITHUB</button></div></div>';
      }));
      list.innerHTML = cards.join('');
    } catch(e) { notify('Actions error: ' + e.message, 'error'); }
    hideProgress();
  },
  async trigger(wfId) {
    var r=STATE.activeRepo; if (!r) return;
    showProgress();
    try { await GH.triggerWorkflow(r.owner.login,r.name,wfId,STATE.activeBranch); notify('Workflow triggered!','success'); document.getElementById('run-log').innerHTML='<span class="t-success">Dispatched. Refresh to see run.</span>'; } catch(e){notify('Trigger error: '+e.message,'error');}
    hideProgress();
  },
  newWorkflow() {
    var name='.github/workflows/ci.yml';
    STATE.openFiles[name]={content:TEMPLATES.workflow,sha:null,dirty:true,lang:'yaml'};
    STATE.pendingCommits[name]=TEMPLATES.workflow;
    XC.openTab(name); XC.switchPanel('editor-panel');
  },
  async exportWorkflows() {
    var r=STATE.activeRepo; if (!r) return notify('Select a repo','warn');
    try { var wf=await GH.listWorkflows(r.owner.login,r.name); var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(wf,null,2)],{type:'application/json'})); a.download=r.name+'-workflows.json'; a.click(); } catch(e){notify(e.message,'error');}
  },
};

// ── UTILITIES ──
function notify(msg, type) {
  type = type || 'info';
  var c = document.getElementById('notif-container');
  if (!c) return;
  var n = document.createElement('div');
  n.className = 'notif ' + type;
  n.textContent = msg;
  c.appendChild(n);
  setTimeout(function(){ n.style.animation = 'notifOut 0.3s ease forwards'; setTimeout(function(){ n.remove(); }, 310); }, 3500);
}
function showProgress() { var p=document.getElementById('global-progress'); if (p) p.style.display='block'; }
function hideProgress() { var p=document.getElementById('global-progress'); if (p) p.style.display='none'; }

// ── INIT ──
window.addEventListener('DOMContentLoaded', function() {
  XC.init();
  document.querySelectorAll('.modal-overlay').forEach(function(m) {
    m.addEventListener('click', function(e){ if (e.target === m) m.classList.remove('open'); });
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(function(m){ m.classList.remove('open'); });
  });
  window.addEventListener('online',  XC.updateStatus);
  window.addEventListener('offline', XC.updateStatus);
});
