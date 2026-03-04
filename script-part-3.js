// ============================================================
// XCYBER SCRIPT PART 3 — Visual HTML Editor & Git Terminal
// https://kbsigmaboy67.github.io/xc/script-part-3.js
// ============================================================

'use strict';

// ═══════════════════════════════════════
//  VISUAL HTML EDITOR
// ═══════════════════════════════════════
const VE = {
  elements: [],   // {id, type, x, y, w, h, z, content, class, id2, bg, color, fontSize, border, attrs}
  selectedId: null,
  dragging: false,
  resizing: false,
  dragOffX: 0, dragOffY: 0,
  idCounter: 0,
  canvas: null,

  init() {
    VE.canvas = document.getElementById('ve-canvas');
    VE.canvas.addEventListener('click', e => {
      if (e.target === VE.canvas) VE.deselect();
    });
    // Keyboard delete
    document.addEventListener('keydown', e => {
      if (document.getElementById('visual-panel')?.classList.contains('active')) {
        if (e.key === 'Delete' && VE.selectedId !== null && document.activeElement === document.body) VE.deleteSelected();
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') VE.undo();
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); VE.duplicateSelected(); }
      }
    });
  },

  addElement(opts = {}) {
    const el = {
      id: ++VE.idCounter,
      type: opts.type || 'div',
      x: opts.x || 50 + (VE.idCounter % 10) * 20,
      y: opts.y || 50 + (VE.idCounter % 10) * 20,
      w: opts.w || 150,
      h: opts.h || 60,
      z: opts.z || VE.idCounter,
      content: opts.content || 'Element ' + VE.idCounter,
      class: opts.class || '',
      id2: opts.id2 || '',
      bg: opts.bg || '#0a1220',
      color: opts.color || '#c8e0ff',
      fontSize: opts.fontSize || 14,
      border: opts.border || '1px solid #0d3060',
      attrs: opts.attrs || {},
    };
    VE.elements.push(el);
    VE.renderElement(el);
    VE.renderLayers();
    VE.select(el.id);
    return el;
  },

  renderElement(el) {
    // Remove old DOM element
    const old = document.querySelector(`[data-ve-id="${el.id}"]`);
    if (old) old.remove();

    const dom = document.createElement('div');
    dom.className = 've-element';
    dom.dataset.veId = el.id;
    dom.style.cssText = `
      left: ${el.x}px; top: ${el.y}px;
      width: ${el.w}px; height: ${el.h}px;
      z-index: ${el.z};
      background: ${el.bg};
      color: ${el.color};
      font-size: ${el.fontSize}px;
      border: ${el.border};
    `;

    // Z-index label
    const zlabel = document.createElement('div');
    zlabel.className = 'zindex-label';
    zlabel.textContent = `z:${el.z} <${el.type}>`;
    dom.appendChild(zlabel);

    // Content
    const content = document.createElement('span');
    content.textContent = el.content;
    dom.appendChild(content);

    // Resize handle
    const rh = document.createElement('div');
    rh.className = 'resize-handle';
    dom.appendChild(rh);

    // Events
    dom.addEventListener('mousedown', e => {
      e.stopPropagation();
      if (e.target === rh) {
        VE.resizing = true;
        VE.resizeEl = el;
        VE.resizeStartX = e.clientX; VE.resizeStartY = e.clientY;
        VE.resizeStartW = el.w; VE.resizeStartH = el.h;
      } else {
        VE.dragging = true;
        VE.dragEl = el;
        const rect = dom.getBoundingClientRect();
        VE.dragOffX = e.clientX - rect.left;
        VE.dragOffY = e.clientY - rect.top;
      }
      VE.select(el.id);
    });

    if (VE.selectedId === el.id) dom.classList.add('selected');
    VE.canvas.appendChild(dom);
  },

  renderAll() {
    VE.canvas.innerHTML = '';
    VE.elements.forEach(el => VE.renderElement(el));
    VE.renderLayers();
  },

  select(id) {
    VE.selectedId = id;
    document.querySelectorAll('.ve-element').forEach(el => el.classList.remove('selected'));
    const dom = document.querySelector(`[data-ve-id="${id}"]`);
    if (dom) dom.classList.add('selected');
    const el = VE.elements.find(e => e.id === id);
    if (!el) return;
    document.getElementById('ve-no-selection').classList.add('hidden');
    document.getElementById('ve-props').classList.remove('hidden');
    document.getElementById('ve-type').value = el.type;
    document.getElementById('ve-x').value = el.x;
    document.getElementById('ve-y').value = el.y;
    document.getElementById('ve-w').value = el.w;
    document.getElementById('ve-h').value = el.h;
    document.getElementById('ve-z').value = el.z;
    document.getElementById('ve-content').value = el.content;
    document.getElementById('ve-class').value = el.class;
    document.getElementById('ve-id').value = el.id2;
    document.getElementById('ve-bg').value = el.bg;
    document.getElementById('ve-color').value = el.color;
    document.getElementById('ve-font').value = el.fontSize;
    document.getElementById('ve-border').value = el.border;
    document.getElementById('ve-attrs').value = Object.keys(el.attrs).length ? JSON.stringify(el.attrs, null, 2) : '';
  },

  deselect() {
    VE.selectedId = null;
    document.querySelectorAll('.ve-element').forEach(el => el.classList.remove('selected'));
    document.getElementById('ve-no-selection').classList.remove('hidden');
    document.getElementById('ve-props').classList.add('hidden');
  },

  updateProp(prop, val) {
    const el = VE.elements.find(e => e.id === VE.selectedId);
    if (!el) return;
    if (['x','y','w','h','z','fontSize'].includes(prop)) val = +val;
    if (prop === 'attrs') { try { el.attrs = JSON.parse(val || '{}'); } catch {} return; }
    if (prop === 'id') el.id2 = val; else el[prop] = val;
    const dom = document.querySelector(`[data-ve-id="${VE.selectedId}"]`);
    if (!dom) return;
    if (prop === 'x') dom.style.left = val + 'px';
    if (prop === 'y') dom.style.top = val + 'px';
    if (prop === 'w') dom.style.width = val + 'px';
    if (prop === 'h') dom.style.height = val + 'px';
    if (prop === 'z') { dom.style.zIndex = val; dom.querySelector('.zindex-label').textContent = `z:${val} <${el.type}>`; }
    if (prop === 'bg') dom.style.background = val;
    if (prop === 'color') dom.style.color = val;
    if (prop === 'fontSize') dom.style.fontSize = val + 'px';
    if (prop === 'border') dom.style.border = val;
    if (prop === 'content') { const s = dom.querySelector('span'); if (s) s.textContent = val; }
    if (prop === 'type') dom.querySelector('.zindex-label').textContent = `z:${el.z} <${val}>`;
    VE.renderLayers();
  },

  deleteSelected() {
    if (VE.selectedId === null) return;
    VE.elements = VE.elements.filter(e => e.id !== VE.selectedId);
    document.querySelector(`[data-ve-id="${VE.selectedId}"]`)?.remove();
    VE.deselect();
    VE.renderLayers();
    notify('Element deleted', 'warn');
  },

  duplicateSelected() {
    const el = VE.elements.find(e => e.id === VE.selectedId);
    if (!el) return;
    VE.addElement({ ...el, x: el.x + 20, y: el.y + 20 });
    notify('Duplicated', 'success');
  },

  clearCanvas() {
    if (!confirm('Clear all elements?')) return;
    VE.elements = [];
    VE.canvas.innerHTML = '';
    VE.deselect();
    VE.renderLayers();
    notify('Canvas cleared', 'warn');
  },

  renderLayers() {
    const list = document.getElementById('ve-layers');
    if (!list) return;
    const sorted = [...VE.elements].sort((a, b) => b.z - a.z);
    list.innerHTML = sorted.map(el => `
      <div class="tree-item ${el.id === VE.selectedId ? 'active' : ''}" onclick="VE.select(${el.id})" style="font-size:11px;">
        <span class="text-muted mono" style="font-size:9px;min-width:22px">z:${el.z}</span>
        <span>&lt;${el.type}&gt;</span>
        <span class="text-muted" style="font-size:9px;overflow:hidden;text-overflow:ellipsis">${el.content.slice(0,20)}</span>
      </div>`).join('');
  },

  bringForward() {
    const el = VE.elements.find(e => e.id === VE.selectedId);
    if (el) { el.z++; VE.updateProp('z', el.z); document.getElementById('ve-z').value = el.z; }
  },
  sendBackward() {
    const el = VE.elements.find(e => e.id === VE.selectedId);
    if (el) { el.z = Math.max(1, el.z - 1); VE.updateProp('z', el.z); document.getElementById('ve-z').value = el.z; }
  },
  bringToFront() {
    const el = VE.elements.find(e => e.id === VE.selectedId);
    if (el) { const max = Math.max(...VE.elements.map(e => e.z)); el.z = max + 1; VE.updateProp('z', el.z); document.getElementById('ve-z').value = el.z; }
  },
  sendToBack() {
    const el = VE.elements.find(e => e.id === VE.selectedId);
    if (el) { const min = Math.min(...VE.elements.map(e => e.z)); el.z = Math.max(1, min - 1); VE.updateProp('z', el.z); document.getElementById('ve-z').value = el.z; }
  },

  generateHTML() {
    const sorted = [...VE.elements].sort((a, b) => a.z - b.z);
    const lines = sorted.map(el => {
      const attrStr = Object.entries(el.attrs).map(([k,v]) => ` ${k}="${v}"`).join('');
      const cls = el.class ? ` class="${el.class}"` : '';
      const id2 = el.id2 ? ` id="${el.id2}"` : '';
      const style = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px;z-index:${el.z};background:${el.bg};color:${el.color};font-size:${el.fontSize}px;border:${el.border};box-sizing:border-box;`;
      const isVoid = ['input','img','br','hr'].includes(el.type);
      if (isVoid) return `  <${el.type}${id2}${cls} style="${style}"${attrStr}>`;
      return `  <${el.type}${id2}${cls} style="${style}"${attrStr}>${el.content}</${el.type}>`;
    });
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>XCYBER Visual Export</title>\n  <style>body{margin:0;background:#000;position:relative;min-height:600px;}</style>\n</head>\n<body>\n${lines.join('\n')}\n</body>\n</html>`;
  },

  exportHTML() {
    const html = VE.generateHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'xcyber-visual.html'; a.click();
    notify('HTML exported!', 'success');
  },

  copyHTML() {
    navigator.clipboard.writeText(VE.generateHTML()).then(() => notify('HTML copied!', 'success'));
  },

  sendToEditor() {
    const html = VE.generateHTML();
    const path = 'visual-export.html';
    if (typeof STATE !== 'undefined' && typeof XC !== 'undefined') {
      STATE.openFiles[path] = { content: html, sha: null, dirty: true, lang: 'html' };
      XC.openTab(path);
      XC.setEditorContent(html, path);
      XC.switchPanel('editor-panel');
      notify('Sent to code editor!', 'success');
    }
  },

  importHTML() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.html,text/html';
    inp.onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => VE.parseHTML(ev.target.result);
      reader.readAsText(f);
    };
    inp.click();
  },

  parseHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;
    VE.elements = []; VE.canvas.innerHTML = ''; VE.idCounter = 0;
    const positioned = body.querySelectorAll('[style]');
    positioned.forEach(el => {
      const s = el.style;
      const x = parseInt(s.left) || 0;
      const y = parseInt(s.top) || 0;
      const w = parseInt(s.width) || 100;
      const h = parseInt(s.height) || 40;
      const z = parseInt(s.zIndex) || 1;
      if (!x && !y && !z) return; // skip non-positioned
      VE.addElement({
        type: el.tagName.toLowerCase(),
        x, y, w, h, z,
        content: el.textContent.trim().slice(0, 100),
        class: el.className || '',
        id2: el.id || '',
        bg: s.background || s.backgroundColor || '#0a1220',
        color: s.color || '#c8e0ff',
        fontSize: parseInt(s.fontSize) || 14,
        border: s.border || '1px solid #0d3060',
        attrs: {},
      });
    });
    VE.renderAll();
    notify('HTML imported: ' + positioned.length + ' elements', 'success');
  },

  // Drag/resize on canvas
  setupDragResize() {
    document.addEventListener('mousemove', e => {
      if (VE.dragging && VE.dragEl) {
        const canvasRect = VE.canvas.getBoundingClientRect();
        const x = Math.max(0, e.clientX - canvasRect.left - VE.dragOffX);
        const y = Math.max(0, e.clientY - canvasRect.top - VE.dragOffY);
        VE.dragEl.x = x; VE.dragEl.y = y;
        const dom = document.querySelector(`[data-ve-id="${VE.dragEl.id}"]`);
        if (dom) { dom.style.left = x + 'px'; dom.style.top = y + 'px'; }
        document.getElementById('ve-x').value = Math.round(x);
        document.getElementById('ve-y').value = Math.round(y);
      }
      if (VE.resizing && VE.resizeEl) {
        const dx = e.clientX - VE.resizeStartX;
        const dy = e.clientY - VE.resizeStartY;
        const newW = Math.max(20, VE.resizeStartW + dx);
        const newH = Math.max(20, VE.resizeStartH + dy);
        VE.resizeEl.w = newW; VE.resizeEl.h = newH;
        const dom = document.querySelector(`[data-ve-id="${VE.resizeEl.id}"]`);
        if (dom) { dom.style.width = newW + 'px'; dom.style.height = newH + 'px'; }
        document.getElementById('ve-w').value = Math.round(newW);
        document.getElementById('ve-h').value = Math.round(newH);
      }
    });
    document.addEventListener('mouseup', () => {
      VE.dragging = false; VE.resizing = false;
      VE.dragEl = null; VE.resizeEl = null;
    });
  },
};

// ═══════════════════════════════════════
//  GIT TERMINAL
// ═══════════════════════════════════════
const TERM = {
  history: [],
  historyPos: -1,
  output: null,
  input: null,

  init() {
    TERM.output = document.getElementById('terminal-output');
    TERM.input = document.getElementById('terminal-input');
    if (!TERM.input) return;

    TERM.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { TERM.run(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); TERM.histUp(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); TERM.histDown(); }
      if (e.key === 'Tab') { e.preventDefault(); TERM.autocomplete(); }
    });

    TERM.log('XCYBER Git Terminal v1.0', 'info');
    TERM.log('Type `help` for available commands.', 'info');
    TERM.log('This terminal simulates git operations via the GitHub REST API.', 'info');
    TERM.log('──────────────────────────────────────────', 'info');
  },

  focus() {
    document.querySelector('[data-panel="terminal-panel"]')?.click();
    TERM.input?.focus();
  },

  log(msg, type = 'out') {
    if (!TERM.output) return;
    const line = document.createElement('div');
    line.className = `t-${type}`;
    line.textContent = msg;
    TERM.output.appendChild(line);
    TERM.output.scrollTop = TERM.output.scrollHeight;
  },

  clear() { if (TERM.output) TERM.output.innerHTML = ''; },

  copyAll() {
    const text = TERM.output?.innerText || '';
    navigator.clipboard.writeText(text).then(() => notify('Terminal output copied', 'success'));
  },

  histUp() {
    if (TERM.history.length === 0) return;
    TERM.historyPos = Math.max(0, TERM.historyPos - 1);
    TERM.input.value = TERM.history[TERM.historyPos] || '';
  },
  histDown() {
    TERM.historyPos = Math.min(TERM.history.length, TERM.historyPos + 1);
    TERM.input.value = TERM.history[TERM.historyPos] || '';
  },

  autocomplete() {
    const cmds = ['git status','git log','git branch','git pull','git push','git clone','git diff','git commit','git checkout','git add','git merge','git rebase','git reset','git stash','git tag','git show','git remote -v','help','clear','ls','cat','echo','repo info','deploy status'];
    const val = TERM.input.value.toLowerCase();
    const match = cmds.find(c => c.startsWith(val) && c !== val);
    if (match) TERM.input.value = match;
  },

  async run() {
    const raw = TERM.input.value.trim();
    if (!raw) return;
    TERM.history.push(raw);
    TERM.historyPos = TERM.history.length;
    TERM.log(`$ ${raw}`, 'cmd');
    TERM.input.value = '';
    await TERM.exec(raw);
  },

  async exec(cmd) {
    const r = typeof STATE !== 'undefined' ? STATE.activeRepo : null;
    const parts = cmd.split(/\s+/);
    const base = parts[0];
    const sub = parts[1] || '';

    // Handle `git ...` commands
    if (base === 'git') {
      if (!r) { TERM.log('No repo selected. Select a repo from the sidebar first.', 'err'); return; }
      const owner = r.owner.login, name = r.name, branch = STATE.activeBranch;

      switch (sub) {
        case 'status': {
          const dirty = Object.entries(STATE.openFiles).filter(([k,v]) => v.dirty && k !== 'welcome').map(([k]) => k);
          const pending = Object.keys(STATE.pendingCommits);
          const all = [...new Set([...dirty, ...pending])];
          TERM.log(`On branch ${branch}`, 'info');
          if (!all.length) { TERM.log('nothing to commit, working tree clean', 'success'); }
          else { all.forEach(f => TERM.log(`  modified: ${f}`, 'warn')); }
          break;
        }
        case 'log': {
          TERM.log('Fetching commit log...', 'info');
          try {
            const commits = await GH.getCommits(owner, name, branch);
            commits.slice(0, 15).forEach(c => {
              TERM.log(`commit ${c.sha.slice(0,7)}  ${new Date(c.commit.committer.date).toLocaleDateString()}`, 'info');
              TERM.log(`Author: ${c.commit.author.name} <${c.commit.author.email}>`, 'out');
              TERM.log(`    ${c.commit.message.split('\n')[0]}`, 'out');
              TERM.log('', 'out');
            });
          } catch (e) { TERM.log('Error: ' + e.message, 'err'); }
          break;
        }
        case 'branch': {
          TERM.log('Fetching branches...', 'info');
          try {
            const branches = await GH.listBranches(owner, name);
            branches.forEach(b => TERM.log(`  ${b.name === branch ? '* ' : '  '}${b.name}`, b.name === branch ? 'success' : 'out'));
          } catch (e) { TERM.log('Error: ' + e.message, 'err'); }
          break;
        }
        case 'pull': {
          TERM.log(`Pulling from origin/${branch}...`, 'info');
          try { await XC.loadFileTree(); TERM.log('Already up to date.', 'success'); } catch (e) { TERM.log('Error: ' + e.message, 'err'); }
          break;
        }
        case 'push': {
          TERM.log('Pushing staged changes...', 'info');
          XC.commitPush();
          break;
        }
        case 'diff': {
          const dirty = Object.entries(STATE.openFiles).filter(([k,v]) => v.dirty && k !== 'welcome');
          if (!dirty.length) { TERM.log('No differences.', 'info'); break; }
          for (const [path, f] of dirty) {
            TERM.log(`diff --git a/${path} b/${path}`, 'warn');
            TERM.log(`--- a/${path}`, 'err');
            TERM.log(`+++ b/${path}`, 'success');
          }
          break;
        }
        case 'checkout': {
          const targetBranch = parts[2];
          if (!targetBranch) { TERM.log('Usage: git checkout <branch>', 'err'); break; }
          TERM.log(`Switching to branch '${targetBranch}'...`, 'info');
          const sel = document.getElementById('branch-select');
          if (sel) { sel.value = targetBranch; STATE.activeBranch = targetBranch; await XC.loadFileTree(); XC.updateStatus(); }
          TERM.log(`Switched to branch '${targetBranch}'`, 'success');
          break;
        }
        case 'add': {
          const target = parts[2] || '.';
          const toAdd = target === '.' ? Object.keys(STATE.openFiles).filter(k => k !== 'welcome') : [target];
          toAdd.forEach(f => { if (STATE.openFiles[f]) { STATE.pendingCommits[f] = STATE.openFiles[f].content; STATE.openFiles[f].dirty = true; } });
          TERM.log(`Staged: ${toAdd.join(', ')}`, 'success');
          break;
        }
        case 'commit': {
          const msgIdx = cmd.indexOf('-m');
          if (msgIdx === -1) { TERM.log('Usage: git commit -m "message"', 'err'); break; }
          const msg = cmd.slice(msgIdx + 2).trim().replace(/^["']|["']$/g, '');
          document.getElementById('commit-msg').value = msg;
          TERM.log(`Commit message set: "${msg}"`, 'info');
          TERM.log('Run `git push` to push to GitHub.', 'info');
          break;
        }
        case 'stash': {
          TERM.log('Stashing not directly available via API. Save file content locally.', 'warn'); break;
        }
        case 'tag': {
          const tagName = parts[2];
          if (!tagName) {
            TERM.log('Fetching tags...', 'info');
            try {
              const releases = await GH.listReleases(owner, name);
              releases.forEach(r => TERM.log(`  ${r.tag_name}  ${r.name || ''}`, 'out'));
            } catch (e) { TERM.log('Error: ' + e.message, 'err'); }
          } else { TERM.log(`Tag creation: open GitHub releases page.`, 'info'); }
          break;
        }
        case 'remote': {
          TERM.log(`origin  https://github.com/${r.full_name}.git (fetch)`, 'out');
          TERM.log(`origin  https://github.com/${r.full_name}.git (push)`, 'out');
          break;
        }
        case 'clone': {
          const url = parts[2] || `https://github.com/${r.full_name}`;
          TERM.log(`Cloning from ${url}...`, 'info');
          TERM.log('Note: Clone opens in browser. Full git clone not possible in browser environment.', 'warn');
          window.open(url, '_blank');
          break;
        }
        case 'show': {
          TERM.log(`Repository: ${r.full_name}`, 'info');
          TERM.log(`Branch: ${branch}`, 'info');
          TERM.log(`Description: ${r.description || '(none)'}`, 'out');
          TERM.log(`URL: ${r.html_url}`, 'out');
          TERM.log(`Stars: ${r.stargazers_count}  Forks: ${r.forks_count}  Issues: ${r.open_issues_count}`, 'out');
          TERM.log(`Language: ${r.language || '(none)'}`, 'out');
          TERM.log(`Visibility: ${r.private ? 'private' : 'public'}`, 'out');
          TERM.log(`Default branch: ${r.default_branch}`, 'out');
          break;
        }
        case 'merge': {
          TERM.log('Merge operations: use GitHub Pull Request via the DEPLOY panel.', 'warn'); break;
        }
        case 'reset': {
          TERM.log('Resetting staged files...', 'info');
          STATE.pendingCommits = {};
          Object.values(STATE.openFiles).forEach(f => { f.dirty = false; });
          TERM.log('Staged files cleared.', 'success');
          break;
        }
        case 'rebase': {
          TERM.log('Rebase not available via GitHub API directly.', 'warn'); break;
        }
        default:
          TERM.log(`Unknown git subcommand: ${sub}. Type 'help' for available commands.`, 'err');
      }
      return;
    }

    // Non-git commands
    switch (base) {
      case 'help':
        TERM.log('═══════════════════════════════════════════', 'info');
        TERM.log('XCYBER GIT TERMINAL — Available Commands:', 'info');
        TERM.log('─── Git Commands ───────────────────────────', 'info');
        [
          ['git status', 'Show modified files'],
          ['git log', 'Show commit history'],
          ['git branch', 'List branches'],
          ['git checkout <branch>', 'Switch branch'],
          ['git add . | <file>', 'Stage files'],
          ['git commit -m "<msg>"', 'Set commit message'],
          ['git push', 'Push staged commits to GitHub'],
          ['git pull', 'Refresh file tree from remote'],
          ['git diff', 'Show dirty files'],
          ['git remote -v', 'Show remote URLs'],
          ['git tag', 'List releases/tags'],
          ['git show', 'Show repo info'],
          ['git clone <url>', 'Open repo URL'],
          ['git reset', 'Clear staged files'],
        ].forEach(([c, d]) => TERM.log(`  ${c.padEnd(32)} ${d}`, 'out'));
        TERM.log('─── Utility Commands ───────────────────────', 'info');
        [
          ['clear', 'Clear terminal output'],
          ['ls', 'List open files'],
          ['repo info', 'Show active repo info'],
          ['deploy status', 'Show deployment status'],
          ['token info', 'Show active token info'],
          ['rate limit', 'Show GitHub API rate limit'],
          ['help', 'Show this help'],
        ].forEach(([c, d]) => TERM.log(`  ${c.padEnd(32)} ${d}`, 'out'));
        TERM.log('═══════════════════════════════════════════', 'info');
        break;

      case 'clear': TERM.clear(); break;

      case 'ls':
      case 'dir': {
        const files = Object.keys(STATE.openFiles).filter(k => k !== 'welcome');
        if (!files.length) TERM.log('No files open.', 'info');
        else files.forEach(f => TERM.log(`  ${STATE.openFiles[f]?.dirty ? 'M ' : '  '}${f}`, 'out'));
        break;
      }

      case 'cat': {
        const path = parts[1];
        if (!path) { TERM.log('Usage: cat <path>', 'err'); break; }
        const f = STATE.openFiles[path];
        if (!f) { TERM.log(`File not found: ${path}`, 'err'); break; }
        const lines = f.content.split('\n').slice(0, 50);
        lines.forEach(l => TERM.log(l, 'out'));
        if (f.content.split('\n').length > 50) TERM.log('[...truncated to 50 lines]', 'warn');
        break;
      }

      case 'echo':
        TERM.log(parts.slice(1).join(' '), 'out');
        break;

      case 'repo': {
        if (sub === 'info') {
          if (!r) { TERM.log('No repo selected.', 'err'); break; }
          TERM.log(`Repo: ${r.full_name}`, 'info');
          TERM.log(`Description: ${r.description || '(none)'}`, 'out');
          TERM.log(`URL: ${r.html_url}`, 'out');
          TERM.log(`Branch: ${STATE.activeBranch}`, 'out');
          TERM.log(`Stars: ${r.stargazers_count} | Forks: ${r.forks_count} | Issues: ${r.open_issues_count}`, 'out');
          TERM.log(`Visibility: ${r.private ? 'private' : 'public'} | Language: ${r.language || '?'}`, 'out');
        }
        break;
      }

      case 'deploy': {
        if (sub === 'status') {
          if (!r) { TERM.log('No repo selected.', 'err'); break; }
          TERM.log('Checking deployment status...', 'info');
          try {
            const pages = await GH.getPages(r.owner.login, r.name);
            if (pages) TERM.log(`GitHub Pages: LIVE at ${pages.html_url}`, 'success');
            else TERM.log('GitHub Pages: Not enabled', 'warn');
          } catch { TERM.log('GitHub Pages: Not enabled or no permission', 'warn'); }
        }
        break;
      }

      case 'token': {
        if (sub === 'info') {
          const t = STATE.tokens[STATE.activeTokenIdx];
          if (!t) { TERM.log('No token loaded.', 'err'); break; }
          TERM.log(`User: ${t.user}`, 'info');
          TERM.log(`Type: ${t.type}`, 'out');
          TERM.log(`Repos: ${t.repos.length}`, 'out');
        }
        break;
      }

      case 'rate': {
        if (sub === 'limit') {
          try {
            const rl = await GH.getRateLimit();
            TERM.log(`Core: ${rl.rate.remaining}/${rl.rate.limit} requests remaining`, 'info');
            TERM.log(`Search: ${rl.resources.search.remaining}/${rl.resources.search.limit}`, 'out');
            TERM.log(`Resets: ${new Date(rl.rate.reset * 1000).toLocaleTimeString()}`, 'out');
          } catch (e) { TERM.log('Error: ' + e.message, 'err'); }
        }
        break;
      }

      case 'open': {
        if (r) window.open(r.html_url, '_blank');
        else TERM.log('No repo selected.', 'err');
        break;
      }

      default:
        TERM.log(`Command not found: ${base}. Type 'help' for available commands.`, 'err');
    }
  },

  help() { TERM.exec('help'); },
};

// ── INIT VE ──
window.addEventListener('DOMContentLoaded', () => {
  VE.init();
  VE.setupDragResize();

  // Welcome elements
  setTimeout(() => {
    VE.addElement({ type: 'div', x: 20, y: 20, w: 300, h: 60, z: 1, content: 'XCYBER Visual Editor', bg: '#0a1220', color: '#0af', fontSize: 22, border: '1px solid #0af' });
    VE.addElement({ type: 'p', x: 20, y: 100, w: 250, h: 40, z: 2, content: 'Drag • Resize • Style • Export', bg: 'transparent', color: '#7aafd4', fontSize: 14, border: '1px dashed #0d3060' });
    VE.addElement({ type: 'button', x: 20, y: 160, w: 120, h: 36, z: 3, content: 'Click me', bg: '#0d3060', color: '#0ff', fontSize: 13, border: '1px solid #0af' });
  }, 500);
});
