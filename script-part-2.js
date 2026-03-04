// ============================================================
// XCYBER SCRIPT PART 2 — Image / Audio / Video+GIF Editors
// https://kbsigmaboy67.github.io/xc/script-part-2.js
// ============================================================

'use strict';

// ═══════════════════════════════════════
//  IMAGE EDITOR
// ═══════════════════════════════════════
const IMG = {
  canvas: null,
  ctx: null,
  tool: 'select',
  drawing: false,
  lastX: 0, lastY: 0,
  history: [],      // ImageData stack for undo
  historyPos: -1,
  origImageData: null,
  adjustments: { brightness: 0, contrast: 0 },

  init() {
    IMG.canvas = document.getElementById('image-canvas');
    IMG.ctx = IMG.canvas.getContext('2d');
    // Blank canvas
    IMG.ctx.fillStyle = '#0a1220';
    IMG.ctx.fillRect(0, 0, IMG.canvas.width, IMG.canvas.height);
    IMG.bindEvents();
    IMG.saveHistory();
  },

  bindEvents() {
    const c = IMG.canvas;
    c.addEventListener('mousedown', IMG.onMouseDown);
    c.addEventListener('mousemove', IMG.onMouseMove);
    c.addEventListener('mouseup', IMG.onMouseUp);
    c.addEventListener('mouseleave', () => { IMG.drawing = false; });

    // Keyboard undo/redo
    document.addEventListener('keydown', e => {
      if (document.getElementById('image-panel')?.classList.contains('active')) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); IMG.undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); IMG.redo(); }
      }
    });
  },

  onMouseDown(e) {
    IMG.drawing = true;
    const { x, y } = IMG.getPos(e);
    IMG.lastX = x; IMG.lastY = y;
    if (IMG.tool === 'fill') IMG.floodFill(x, y);
    if (IMG.tool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        IMG.ctx.font = `${document.getElementById('draw-size').value * 4}px Share Tech Mono`;
        IMG.ctx.fillStyle = document.getElementById('draw-color').value;
        IMG.ctx.fillText(text, x, y);
        IMG.saveHistory();
      }
      IMG.drawing = false;
    }
  },

  onMouseMove(e) {
    if (!IMG.drawing) return;
    const { x, y } = IMG.getPos(e);
    if (IMG.tool === 'draw') {
      IMG.ctx.strokeStyle = document.getElementById('draw-color').value;
      IMG.ctx.lineWidth = +document.getElementById('draw-size').value;
      IMG.ctx.lineCap = 'round';
      IMG.ctx.lineJoin = 'round';
      IMG.ctx.beginPath();
      IMG.ctx.moveTo(IMG.lastX, IMG.lastY);
      IMG.ctx.lineTo(x, y);
      IMG.ctx.stroke();
    }
    if (IMG.tool === 'erase') {
      const sz = +document.getElementById('draw-size').value * 2;
      IMG.ctx.clearRect(x - sz/2, y - sz/2, sz, sz);
    }
    IMG.lastX = x; IMG.lastY = y;
  },

  onMouseUp() {
    IMG.drawing = false;
    IMG.saveHistory();
    IMG.updateInfo();
  },

  getPos(e) {
    const rect = IMG.canvas.getBoundingClientRect();
    const scaleX = IMG.canvas.width / rect.width;
    const scaleY = IMG.canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  },

  saveHistory() {
    const data = IMG.ctx.getImageData(0, 0, IMG.canvas.width, IMG.canvas.height);
    IMG.history = IMG.history.slice(0, IMG.historyPos + 1);
    IMG.history.push(data);
    if (IMG.history.length > 50) IMG.history.shift();
    IMG.historyPos = IMG.history.length - 1;
  },

  undo() {
    if (IMG.historyPos > 0) { IMG.historyPos--; IMG.ctx.putImageData(IMG.history[IMG.historyPos], 0, 0); }
  },
  redo() {
    if (IMG.historyPos < IMG.history.length - 1) { IMG.historyPos++; IMG.ctx.putImageData(IMG.history[IMG.historyPos], 0, 0); }
  },

  setTool(t) {
    IMG.tool = t;
    IMG.canvas.style.cursor = t === 'draw' ? 'crosshair' : t === 'fill' ? 'cell' : 'default';
    notify('Tool: ' + t, 'success');
  },

  importImage() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = e => { const f = e.target.files[0]; if (f) IMG.loadFile(f); };
    inp.click();
  },

  loadFile(file) {
    const hint = document.getElementById('img-drop-hint');
    if (hint) hint.style.display = 'none';
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        IMG.canvas.width = img.naturalWidth;
        IMG.canvas.height = img.naturalHeight;
        IMG.ctx.drawImage(img, 0, 0);
        IMG.origImageData = IMG.ctx.getImageData(0, 0, IMG.canvas.width, IMG.canvas.height);
        IMG.saveHistory();
        IMG.updateInfo();
        notify('Image loaded: ' + file.name, 'success');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  updateInfo() {
    document.getElementById('img-info').textContent = `${IMG.canvas.width}×${IMG.canvas.height} px`;
  },

  applyFilter(filter) {
    const src = IMG.ctx.getImageData(0, 0, IMG.canvas.width, IMG.canvas.height);
    const data = src.data;
    if (filter === 'grayscale') {
      for (let i = 0; i < data.length; i += 4) {
        const g = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        data[i] = data[i+1] = data[i+2] = g;
      }
    } else if (filter === 'invert') {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i]; data[i+1] = 255 - data[i+1]; data[i+2] = 255 - data[i+2];
      }
    } else if (filter === 'sepia') {
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        data[i]   = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i+1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i+2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
    } else if (filter === 'blur') {
      // Simple box blur 3x3
      const tmp = new Uint8ClampedArray(data);
      const w = IMG.canvas.width, h = IMG.canvas.height;
      for (let y = 1; y < h-1; y++) {
        for (let x = 1; x < w-1; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
              sum += tmp[((y+dy)*w + (x+dx))*4 + c];
            data[(y*w + x)*4 + c] = sum / 9;
          }
        }
      }
    } else if (filter === 'sharpen') {
      const kernel = [0,-1,0,-1,5,-1,0,-1,0];
      const tmp = new Uint8ClampedArray(data);
      const w = IMG.canvas.width, h = IMG.canvas.height;
      for (let y = 1; y < h-1; y++) {
        for (let x = 1; x < w-1; x++) {
          for (let c = 0; c < 3; c++) {
            let v = 0, ki = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, ki++)
              v += tmp[((y+dy)*w + (x+dx))*4 + c] * kernel[ki];
            data[(y*w + x)*4 + c] = Math.max(0, Math.min(255, v));
          }
        }
      }
    }
    IMG.ctx.putImageData(src, 0, 0);
    IMG.saveHistory();
    notify('Filter applied: ' + filter, 'success');
  },

  adjustBrightness(val) {
    if (!IMG.origImageData) return;
    IMG.adjustments.brightness = +val;
    IMG.applyAdjustments();
  },

  adjustContrast(val) {
    if (!IMG.origImageData) return;
    IMG.adjustments.contrast = +val;
    IMG.applyAdjustments();
  },

  applyAdjustments() {
    const src = new ImageData(new Uint8ClampedArray(IMG.origImageData.data), IMG.origImageData.width, IMG.origImageData.height);
    const data = src.data;
    const b = IMG.adjustments.brightness;
    const c = IMG.adjustments.contrast;
    const factor = (259 * (c + 255)) / (255 * (259 - c));
    for (let i = 0; i < data.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        let v = data[i+ch] + b;
        v = factor * (v - 128) + 128;
        data[i+ch] = Math.max(0, Math.min(255, v));
      }
    }
    IMG.ctx.putImageData(src, 0, 0);
  },

  rotate(deg) {
    const w = IMG.canvas.width, h = IMG.canvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = Math.abs(deg) === 90 ? h : w;
    tmp.height = Math.abs(deg) === 90 ? w : h;
    const tc = tmp.getContext('2d');
    tc.translate(tmp.width/2, tmp.height/2);
    tc.rotate(deg * Math.PI / 180);
    tc.drawImage(IMG.canvas, -w/2, -h/2);
    IMG.canvas.width = tmp.width;
    IMG.canvas.height = tmp.height;
    IMG.ctx.drawImage(tmp, 0, 0);
    IMG.origImageData = IMG.ctx.getImageData(0, 0, IMG.canvas.width, IMG.canvas.height);
    IMG.saveHistory();
    IMG.updateInfo();
  },

  flip(dir) {
    const tmp = document.createElement('canvas');
    tmp.width = IMG.canvas.width; tmp.height = IMG.canvas.height;
    const tc = tmp.getContext('2d');
    tc.translate(dir === 'h' ? tmp.width : 0, dir === 'v' ? tmp.height : 0);
    tc.scale(dir === 'h' ? -1 : 1, dir === 'v' ? -1 : 1);
    tc.drawImage(IMG.canvas, 0, 0);
    IMG.ctx.clearRect(0, 0, IMG.canvas.width, IMG.canvas.height);
    IMG.ctx.drawImage(tmp, 0, 0);
    IMG.origImageData = IMG.ctx.getImageData(0, 0, IMG.canvas.width, IMG.canvas.height);
    IMG.saveHistory();
  },

  floodFill(startX, startY) {
    startX = Math.floor(startX); startY = Math.floor(startY);
    const imageData = IMG.ctx.getImageData(0, 0, IMG.canvas.width, IMG.canvas.height);
    const data = imageData.data;
    const w = IMG.canvas.width, h = IMG.canvas.height;
    const idx = (y, x) => (y * w + x) * 4;
    const color = document.getElementById('draw-color').value;
    const fr = parseInt(color.slice(1,3),16), fg = parseInt(color.slice(3,5),16), fb = parseInt(color.slice(5,7),16);
    const si = idx(startY, startX);
    const sr = data[si], sg = data[si+1], sb = data[si+2], sa = data[si+3];
    if (sr === fr && sg === fg && sb === fb) return;
    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const i = idx(y, x);
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (data[i]===sr && data[i+1]===sg && data[i+2]===sb && data[i+3]===sa) {
        data[i]=fr; data[i+1]=fg; data[i+2]=fb; data[i+3]=255;
        stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
      }
    }
    IMG.ctx.putImageData(imageData, 0, 0);
    IMG.saveHistory();
  },

  exportImage(fmt) {
    const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
    IMG.canvas.toBlob(blob => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `image.${fmt}`; a.click();
      notify('Exported: image.' + fmt, 'success');
    }, mime, 0.95);
  },

  copyToClipboard() {
    IMG.canvas.toBlob(blob => {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => notify('Copied to clipboard!', 'success')).catch(e => notify('Copy failed: ' + e.message, 'error'));
    });
  },

  resetCanvas() {
    IMG.canvas.width = 800; IMG.canvas.height = 600;
    IMG.ctx.fillStyle = '#0a1220';
    IMG.ctx.fillRect(0, 0, IMG.canvas.width, IMG.canvas.height);
    IMG.origImageData = null;
    IMG.history = [];
    IMG.historyPos = -1;
    IMG.saveHistory();
    document.getElementById('img-drop-hint').style.display = '';
    IMG.updateInfo();
    notify('Canvas reset', 'warn');
  },
};

// ═══════════════════════════════════════
//  AUDIO EDITOR
// ═══════════════════════════════════════
const AUD = {
  audioCtx: null,
  audioBuffer: null,
  sourceNode: null,
  gainNode: null,
  startTime: 0,
  offset: 0,
  playing: false,
  canvas: null,
  animFrame: null,
  fileName: null,

  init() {
    AUD.canvas = document.getElementById('waveform-canvas');
    AUD.canvas.width = AUD.canvas.offsetWidth || 800;
    AUD.canvas.height = AUD.canvas.offsetHeight || 160;
  },

  ensureCtx() {
    if (!AUD.audioCtx) AUD.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (AUD.audioCtx.state === 'suspended') AUD.audioCtx.resume();
  },

  importAudio() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = e => { const f = e.target.files[0]; if (f) AUD.loadFile(f); };
    inp.click();
  },

  loadFile(file) {
    AUD.fileName = file.name;
    const reader = new FileReader();
    reader.onload = async e => {
      AUD.ensureCtx();
      try {
        AUD.audioBuffer = await AUD.audioCtx.decodeAudioData(e.target.result);
        document.getElementById('audio-drop-hint').style.display = 'none';
        document.getElementById('trim-end').value = AUD.audioBuffer.duration.toFixed(2);
        AUD.drawWaveform(AUD.audioBuffer);
        document.getElementById('audio-info').innerHTML = `
          <span class="text-accent">${file.name}</span> &nbsp;
          Duration: <span class="text-accent3">${AUD.fmt(AUD.audioBuffer.duration)}</span> &nbsp;
          Channels: <span class="text-accent">${AUD.audioBuffer.numberOfChannels}</span> &nbsp;
          Sample rate: <span class="text-accent">${AUD.audioBuffer.sampleRate} Hz</span> &nbsp;
          Size: <span class="text-muted">${(file.size/1024).toFixed(1)} KB</span>
        `;
        notify('Audio loaded: ' + file.name, 'success');
      } catch (ex) { notify('Audio decode error: ' + ex.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
  },

  drawWaveform(buffer) {
    const c = AUD.canvas;
    c.width = c.offsetWidth || 800;
    c.height = c.offsetHeight || 160;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#050a0f';
    ctx.fillRect(0, 0, c.width, c.height);

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / c.width);
    const mid = c.height / 2;

    // Grid
    ctx.strokeStyle = '#0d3060'; ctx.lineWidth = 1;
    for (let i = 0; i < c.width; i += c.width / 10) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, c.height); ctx.stroke();
    }
    for (let j = 0; j < c.height; j += c.height / 4) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(c.width, j); ctx.stroke();
    }

    // Waveform
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#06f'); grad.addColorStop(0.5, '#0af'); grad.addColorStop(1, '#06f');
    ctx.strokeStyle = grad; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < c.width; i++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const v = data[i * step + j] || 0;
        if (v < min) min = v; if (v > max) max = v;
      }
      ctx.moveTo(i, mid + min * mid);
      ctx.lineTo(i, mid + max * mid);
    }
    ctx.stroke();
  },

  play() {
    if (!AUD.audioBuffer) return notify('Import audio first', 'warn');
    AUD.stop();
    AUD.ensureCtx();
    AUD.sourceNode = AUD.audioCtx.createBufferSource();
    AUD.gainNode = AUD.audioCtx.createGain();
    AUD.sourceNode.buffer = AUD.audioBuffer;
    AUD.sourceNode.connect(AUD.gainNode);
    AUD.gainNode.connect(AUD.audioCtx.destination);
    AUD.gainNode.gain.value = +document.getElementById('audio-volume').value / 100;
    AUD.sourceNode.playbackRate.value = +document.getElementById('audio-speed').value / 100;
    AUD.sourceNode.start(0, AUD.offset);
    AUD.startTime = AUD.audioCtx.currentTime - AUD.offset;
    AUD.playing = true;
    AUD.sourceNode.onended = () => { AUD.playing = false; AUD.offset = 0; };
    AUD.updateTimerLoop();
    notify('Playing...', 'success');
  },

  pause() {
    if (!AUD.playing) return;
    AUD.offset = AUD.audioCtx.currentTime - AUD.startTime;
    AUD.sourceNode?.stop();
    AUD.playing = false;
    cancelAnimationFrame(AUD.animFrame);
  },

  stop() {
    AUD.sourceNode?.stop();
    AUD.playing = false;
    AUD.offset = 0;
    cancelAnimationFrame(AUD.animFrame);
    document.getElementById('audio-time').textContent = `0:00 / ${AUD.audioBuffer ? AUD.fmt(AUD.audioBuffer.duration) : '0:00'}`;
  },

  setVolume(v) {
    if (AUD.gainNode) AUD.gainNode.gain.value = v / 100;
  },

  setSpeed(v) {
    if (AUD.sourceNode) AUD.sourceNode.playbackRate.value = v / 100;
    document.getElementById('audio-speed-label').textContent = (v / 100).toFixed(2) + 'x';
  },

  updateTimerLoop() {
    if (!AUD.playing) return;
    const cur = AUD.audioCtx.currentTime - AUD.startTime;
    document.getElementById('audio-time').textContent = `${AUD.fmt(cur)} / ${AUD.fmt(AUD.audioBuffer.duration)}`;
    // Draw playhead
    AUD.drawPlayhead(cur / AUD.audioBuffer.duration);
    AUD.animFrame = requestAnimationFrame(AUD.updateTimerLoop);
  },

  drawPlayhead(progress) {
    const c = AUD.canvas;
    // Redraw waveform to clear old playhead
    AUD.drawWaveform(AUD.audioBuffer);
    const ctx = c.getContext('2d');
    const x = progress * c.width;
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
  },

  fmt(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2,'0')}`;
  },

  trim() {
    if (!AUD.audioBuffer) return notify('No audio loaded', 'warn');
    const start = +document.getElementById('trim-start').value;
    const end = +document.getElementById('trim-end').value;
    if (end <= start) return notify('End must be > start', 'error');
    AUD.ensureCtx();
    const sr = AUD.audioBuffer.sampleRate;
    const si = Math.floor(start * sr), ei = Math.floor(end * sr);
    const len = ei - si;
    const newBuf = AUD.audioCtx.createBuffer(AUD.audioBuffer.numberOfChannels, len, sr);
    for (let c = 0; c < AUD.audioBuffer.numberOfChannels; c++) {
      const src = AUD.audioBuffer.getChannelData(c);
      newBuf.getChannelData(c).set(src.slice(si, ei));
    }
    AUD.audioBuffer = newBuf;
    AUD.drawWaveform(newBuf);
    notify(`Trimmed: ${AUD.fmt(start)} → ${AUD.fmt(end)}`, 'success');
  },

  applyFades() {
    if (!AUD.audioBuffer) return notify('No audio loaded', 'warn');
    AUD.ensureCtx();
    const fadeIn = +document.getElementById('fade-in').value;
    const fadeOut = +document.getElementById('fade-out').value;
    const sr = AUD.audioBuffer.sampleRate;
    for (let c = 0; c < AUD.audioBuffer.numberOfChannels; c++) {
      const data = AUD.audioBuffer.getChannelData(c);
      for (let i = 0; i < fadeIn * sr && i < data.length; i++) data[i] *= i / (fadeIn * sr);
      for (let i = 0; i < fadeOut * sr && i < data.length; i++) {
        const idx = data.length - 1 - i;
        data[idx] *= i / (fadeOut * sr);
      }
    }
    AUD.drawWaveform(AUD.audioBuffer);
    notify('Fades applied', 'success');
  },

  exportAudio(fmt) {
    if (!AUD.audioBuffer) return notify('No audio loaded', 'warn');
    // Export as WAV
    const wav = AUD.encodeWAV(AUD.audioBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const name = (AUD.fileName?.replace(/\.[^.]+$/, '') || 'audio') + '.wav';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = name; a.click();
    notify('Exported: ' + name, 'success');
  },

  encodeWAV(buffer) {
    const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
    const ab = new ArrayBuffer(44 + len * numCh * 2);
    const view = new DataView(ab);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + len * numCh * 2, true);
    writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true); writeStr(36, 'data');
    view.setUint32(40, len * numCh * 2, true);
    let offset = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        const s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
        view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
        offset += 2;
      }
    }
    return ab;
  },

  copyWaveform() {
    AUD.canvas.toBlob(blob => {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => notify('Waveform copied!', 'success')).catch(e => notify('Copy failed: ' + e.message, 'error'));
    });
  },
};

// ═══════════════════════════════════════
//  VIDEO / GIF EDITOR
// ═══════════════════════════════════════
const VID = {
  videoEl: null,
  isGIF: false,
  fileName: null,
  objectURL: null,
  timelineCtx: null,
  frames: [],       // for GIF export

  init() {
    const tl = document.getElementById('timeline-canvas');
    if (tl) {
      tl.width = tl.offsetWidth || 800;
      tl.height = 70;
      VID.timelineCtx = tl.getContext('2d');
      VID.drawEmptyTimeline();
    }
  },

  drawEmptyTimeline() {
    const ctx = VID.timelineCtx;
    if (!ctx) return;
    const c = document.getElementById('timeline-canvas');
    ctx.fillStyle = '#050a0f'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0d3060'; ctx.lineWidth = 1;
    for (let x = 0; x < c.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
    ctx.fillStyle = '#3d6080'; ctx.font = '10px Share Tech Mono';
    ctx.fillText('No media loaded', 10, c.height/2 + 4);
  },

  importMedia() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/*,image/gif';
    inp.onchange = e => { const f = e.target.files[0]; if (f) VID.loadFile(f); };
    inp.click();
  },

  loadFile(file) {
    VID.fileName = file.name;
    VID.isGIF = file.type === 'image/gif';
    if (VID.objectURL) URL.revokeObjectURL(VID.objectURL);
    VID.objectURL = URL.createObjectURL(file);

    const wrap = document.getElementById('video-preview-wrap');
    wrap.innerHTML = '';

    if (VID.isGIF) {
      const img = document.createElement('img');
      img.src = VID.objectURL;
      img.style.maxWidth = '100%'; img.style.maxHeight = '100%';
      img.style.boxShadow = '0 0 20px var(--accent)';
      wrap.appendChild(img);
      document.getElementById('video-info').textContent = `GIF: ${file.name} | ${(file.size/1024).toFixed(1)} KB`;
      notify('GIF loaded: ' + file.name, 'success');
    } else {
      VID.videoEl = document.createElement('video');
      VID.videoEl.src = VID.objectURL;
      VID.videoEl.controls = false;
      VID.videoEl.style.maxWidth = '100%'; VID.videoEl.style.maxHeight = '100%';
      VID.videoEl.style.boxShadow = '0 0 20px var(--accent)';
      wrap.appendChild(VID.videoEl);
      VID.videoEl.onloadedmetadata = () => {
        document.getElementById('video-info').innerHTML = `
          <span class="text-accent">${file.name}</span> &nbsp;
          Duration: <span class="text-accent3">${VID.fmt(VID.videoEl.duration)}</span> &nbsp;
          Resolution: <span class="text-accent">${VID.videoEl.videoWidth}×${VID.videoEl.videoHeight}</span> &nbsp;
          Size: <span class="text-muted">${(file.size/1024/1024).toFixed(2)} MB</span>
        `;
        document.getElementById('gif-end').value = Math.min(5, VID.videoEl.duration).toFixed(1);
        VID.drawTimeline();
      };
      VID.videoEl.ontimeupdate = () => {
        const cur = VID.videoEl.currentTime, dur = VID.videoEl.duration;
        document.getElementById('video-time').textContent = `${VID.fmt(cur)} / ${VID.fmt(dur)}`;
        VID.drawTimelinePlayhead(cur / dur);
      };
      notify('Video loaded: ' + file.name, 'success');
    }
  },

  play() { VID.videoEl?.play(); },
  pause() { VID.videoEl?.pause(); },
  stop() { if (VID.videoEl) { VID.videoEl.pause(); VID.videoEl.currentTime = 0; } },
  setVolume(v) { if (VID.videoEl) VID.videoEl.volume = v / 100; },
  setSpeed(v) { if (VID.videoEl) VID.videoEl.playbackRate = parseFloat(v); },

  applyFilter(f) {
    if (VID.videoEl) VID.videoEl.style.filter = f;
  },

  fmt(s) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2,'0')}`;
  },

  drawTimeline() {
    if (!VID.videoEl || !VID.timelineCtx) return;
    const c = document.getElementById('timeline-canvas');
    const ctx = VID.timelineCtx;
    const dur = VID.videoEl.duration;
    ctx.fillStyle = '#050a0f'; ctx.fillRect(0, 0, c.width, c.height);
    // Draw time markers
    ctx.strokeStyle = '#0d3060'; ctx.lineWidth = 1;
    ctx.fillStyle = '#3d6080'; ctx.font = '9px Share Tech Mono';
    const step = c.width / 10;
    for (let i = 0; i <= 10; i++) {
      const x = i * step;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
      ctx.fillText(VID.fmt(dur * i / 10), x + 2, c.height - 4);
    }
    // Track bar
    const grad = ctx.createLinearGradient(0, 0, c.width, 0);
    grad.addColorStop(0, '#06f'); grad.addColorStop(1, '#0ff');
    ctx.fillStyle = grad; ctx.globalAlpha = 0.3;
    ctx.fillRect(0, 20, c.width, 30);
    ctx.globalAlpha = 1;
  },

  drawTimelinePlayhead(progress) {
    if (!VID.timelineCtx) return;
    VID.drawTimeline();
    const c = document.getElementById('timeline-canvas');
    const x = progress * c.width;
    VID.timelineCtx.strokeStyle = '#0ff'; VID.timelineCtx.lineWidth = 2;
    VID.timelineCtx.beginPath(); VID.timelineCtx.moveTo(x, 0); VID.timelineCtx.lineTo(x, c.height); VID.timelineCtx.stroke();
  },

  captureFrame() {
    if (!VID.videoEl && !VID.isGIF) return notify('Load a video first', 'warn');
    const tmp = document.createElement('canvas');
    const el = VID.videoEl;
    if (!el) return notify('No video element', 'warn');
    tmp.width = el.videoWidth; tmp.height = el.videoHeight;
    tmp.getContext('2d').drawImage(el, 0, 0);
    tmp.toBlob(blob => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `frame_${Math.round(el.currentTime * 1000)}.png`; a.click();
      notify('Frame captured!', 'success');
    }, 'image/png');
  },

  copyFrame() {
    if (!VID.videoEl) return notify('Load a video first', 'warn');
    const tmp = document.createElement('canvas');
    tmp.width = VID.videoEl.videoWidth; tmp.height = VID.videoEl.videoHeight;
    tmp.getContext('2d').drawImage(VID.videoEl, 0, 0);
    tmp.toBlob(blob => {
      navigator.clipboard.write([new ClipboardItem({'image/png': blob})]).then(() => notify('Frame copied!', 'success')).catch(e => notify('Copy failed: ' + e.message, 'error'));
    }, 'image/png');
  },

  exportGIF() {
    if (!VID.videoEl) return notify('Load a video first', 'warn');
    // GIF export via canvas frame capture — simplified implementation
    notify('Capturing frames for GIF...', 'success');
    const fps = +document.getElementById('gif-fps').value;
    const start = +document.getElementById('gif-start').value;
    const end = +document.getElementById('gif-end').value;
    if (end <= start) return notify('End must be > start', 'error');

    const dur = end - start;
    const totalFrames = Math.ceil(dur * fps);
    const frameInterval = dur / totalFrames;
    const frames = [];
    const el = VID.videoEl;

    const tmp = document.createElement('canvas');
    tmp.width = Math.min(el.videoWidth, 400);
    tmp.height = Math.min(el.videoHeight, 300);
    const tctx = tmp.getContext('2d');

    let frameIdx = 0;
    const captureNext = () => {
      if (frameIdx >= totalFrames) {
        // Build a simple GIF notice — full GIF encoding requires a library
        notify(`Captured ${frames.length} frames. Use gifshot or gif.js for full GIF export. Downloading PNG sequence...`, 'warn');
        // Export frames as individual PNGs in a ZIP
        VID.exportFrameZip(frames, fps);
        return;
      }
      el.currentTime = start + frameIdx * frameInterval;
      el.onseeked = () => {
        tctx.drawImage(el, 0, 0, tmp.width, tmp.height);
        frames.push(tmp.toDataURL('image/png'));
        frameIdx++;
        captureNext();
      };
    };
    captureNext();
  },

  exportFrameZip(frames, fps) {
    if (typeof JSZip === 'undefined') { notify('JSZip not available', 'error'); return; }
    const zip = new JSZip();
    const folder = zip.folder('frames');
    frames.forEach((dataURL, i) => {
      const base64 = dataURL.replace(/^data:image\/png;base64,/, '');
      folder.file(`frame_${String(i).padStart(4,'0')}.png`, base64, { base64: true });
    });
    folder.file('info.txt', `FPS: ${fps}\nFrames: ${frames.length}\nUse FFmpeg: ffmpeg -framerate ${fps} -i frame_%04d.png output.gif`);
    zip.generateAsync({ type: 'blob' }).then(blob => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `frames_${fps}fps.zip`; a.click();
      notify(`Exported ${frames.length} frames as ZIP`, 'success');
    });
  },

  exportWebM() {
    if (!VID.videoEl) return notify('Load a video first', 'warn');
    // MediaRecorder-based re-record
    const tmp = document.createElement('canvas');
    tmp.width = VID.videoEl.videoWidth; tmp.height = VID.videoEl.videoHeight;
    const ctx = tmp.getContext('2d');
    const stream = tmp.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (VID.fileName?.replace(/\.[^.]+$/, '') || 'video') + '.webm'; a.click();
      notify('WebM exported!', 'success');
    };
    VID.videoEl.currentTime = 0;
    VID.videoEl.play();
    recorder.start();
    const draw = () => {
      if (VID.videoEl.ended || VID.videoEl.paused) { recorder.stop(); return; }
      ctx.drawImage(VID.videoEl, 0, 0);
      requestAnimationFrame(draw);
    };
    draw();
    notify('Recording... will stop when video ends', 'warn');
  },
};

// ── INIT MEDIA EDITORS AFTER DOM READY ──
window.addEventListener('DOMContentLoaded', () => {
  IMG.init();
  AUD.init();
  VID.init();

  // Panel switch initializes canvas sizes
  document.querySelectorAll('.topbar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setTimeout(() => {
        if (tab.dataset.panel === 'audio-panel') {
          const c = document.getElementById('waveform-canvas');
          c.width = c.offsetWidth; c.height = c.offsetHeight || 160;
          if (AUD.audioBuffer) AUD.drawWaveform(AUD.audioBuffer);
        }
        if (tab.dataset.panel === 'video-panel') {
          const c = document.getElementById('timeline-canvas');
          c.width = c.offsetWidth; c.height = 70;
          if (VID.videoEl) VID.drawTimeline(); else VID.drawEmptyTimeline();
        }
      }, 50);
    });
  });
});
