// content.js — cầu nối background ↔ injected.js
// Chạy trong ISOLATED world trên trang Google Flow

let injected = false;
let msgCounter = 0;
const pending = new Map();
let isProcessing = false;
let statusEl = null;

// ── Inject script vào main world ──
function ensureInjected() {
  if (injected) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('src/injected.js');
    s.onload = () => { s.remove(); injected = true; resolve(); };
    s.onerror = () => { s.remove(); resolve(); };
    (document.head || document.documentElement).appendChild(s);
  });
}

// ── Gửi lệnh đến injected.js ──
function callInjected(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgCounter;
    pending.set(id, { resolve, reject });
    window.postMessage({ source: 'veo-content', id, action, payload }, '*');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${action} (15s)`));
      }
    }, 15000);
  });
}

// ── Nhận kết quả từ injected.js ──
window.addEventListener('message', (event) => {
  if (!event.data || event.data.source !== 'veo-injected') return;
  const { id } = event.data;
  const p = pending.get(id);
  if (p) { pending.delete(id); p.resolve(event.data); }
});

// ── Overlay trạng thái ──
function setStatus(html, color) {
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = '__veo_status';
    statusEl.style.cssText = 'position:fixed;bottom:90px;right:14px;z-index:2147483647;background:#0d0d18ee;border:2px solid #00e5a0;border-radius:12px;padding:12px 16px;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;color:#e0e0f0;min-width:220px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.8);backdrop-filter:blur(8px);';
    document.documentElement.appendChild(statusEl);
  }
  statusEl.style.display = 'block';
  statusEl.style.borderColor = color || '#00e5a0';
  statusEl.innerHTML = `<div style="font-weight:700;color:${color || '#00e5a0'};margin-bottom:6px">🤖 VEO Automation</div>${html}`;
}
function hideStatus() { if (statusEl) statusEl.style.display = 'none'; }

// ── Message listener ──
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ ok: true, url: location.href });
    return true;
  }
  if (msg.type === 'TEST_CONNECTION') {
    ensureInjected()
      .then(() => callInjected('SCAN_PAGE'))
      .then(res => sendResponse({ ok: true, url: location.href, ...res }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'PROCESS_ITEM') {
    if (isProcessing) { sendResponse({ ok: false, reason: 'busy' }); return true; }
    isProcessing = true;
    runItem(msg.item, msg.mode, msg.platform || 'google-flow', msg.delayMs || 5000, msg.settings)
      .catch(err => {
        chrome.runtime.sendMessage({ type: 'ITEM_FAILED', id: msg.item.id, error: err.message });
        setStatus(`<span style="color:#ff4757">❌ ${err.message}</span>`, '#ff4757');
      })
      .finally(() => { isProcessing = false; });
    sendResponse({ ok: true });
    return true;
  }
});

// ── Đợi trang Google Flow load HOÀN TOÀN ──
async function waitForPageReady(timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    try {
      await ensureInjected();
      const scan = await callInjected('SCAN_PAGE');

      if (scan.foundInput && scan.foundSubmit) {
        setStatus(`<div style="color:#00e5a0">✅ Trang sẵn sàng!</div>`);
        await sleep(300);
        return;
      }

      if (scan.foundInput && !scan.foundSubmit) {
        setStatus(`<div>⏳ Tìm thấy ô nhập nhưng chưa có nút Generate (<b>${elapsed}s</b>)</div><div style="color:#ff6b6b;font-size:11px">Trang đang lỗi — hãy F5 refresh</div>`);
      } else {
        setStatus(`<div>⏳ Đợi trang load... <b>${elapsed}s</b></div><div style="color:#888;font-size:11px">Trang lỗi hoặc chưa load → F5</div>`);
      }
    } catch (e) {
      setStatus(`<div>⏳ Đợi trang load... <b>${elapsed}s</b></div><div style="color:#888;font-size:11px">Đang inject script...</div>`);
      injected = false;
      try { await ensureInjected(); } catch {}
    }
    await sleep(2000);
  }
  throw new Error('Trang Google Flow chưa sẵn sàng sau 60 giây.\n→ Hãy F5 refresh trang, đợi load xong hoàn toàn rồi thử lại.');
}

// ── Xử lý 1 prompt ──
async function runItem(item, mode, platform, delayMs, settings = {}) {
  await ensureInjected();

  // Chờ trang load xong
  await waitForPageReady(45000);

  setStatus(`<div>⏳ Chờ ${Math.round(delayMs / 1000)}s...</div><div style="color:#aaa;font-size:11px">#${item.id}: ${item.text.slice(0, 50)}...</div>`);
  await sleep(delayMs);
  prog(item.id, 10);

  // ── Upload ảnh đính kèm (nếu có) ──
  if (item.image) {
    setStatus(`<div>📤 Đang tải lên ảnh đính kèm...</div>`);
    const uploadResult = await callInjected('UPLOAD_FILE', { imageBase64: item.image, filename: `frame_${item.id}.png` });
    if (!uploadResult.ok) throw new Error(`Tải ảnh lên thất bại: ${uploadResult.error}`);
    await sleep(2500);
  }

  // Nhập text
  setStatus(`<div>⌨️ Nhập prompt #${item.id}...</div>`);
  const typeResult = await callInjected('TYPE_TEXT', { text: item.text });
  if (!typeResult.ok) throw new Error(`Nhập text thất bại: ${typeResult.error}`);
  await sleep(1500);
  prog(item.id, 30);

  // ── Chụp snapshot TRƯỚC khi submit ──
  const snapSrcs = takeMediaSnapshot(mode);

  // Click submit
  setStatus(`<div>🚀 Gửi prompt...</div>`);
  const submitResult = await callInjected('CLICK_SUBMIT');
  if (!submitResult.ok) throw new Error(`Gửi thất bại: ${submitResult.error}`);
  await sleep(3000);
  prog(item.id, 40);

  // Chờ kết quả
  const timeout = mode.includes('video') ? 600000 : 180000;
  const result = await waitForResult(item.id, mode, timeout, snapSrcs);

  // Download
  if (result?.url) {
    const savePath = buildSavePath(item, mode, platform, settings);
    setStatus(`<div style="color:#00e5a0">✅ Xong! Đang tải về...</div>`, '#00e5a0');
    await downloadResult(result.url, savePath, result.ext);
  }

  await sleep(2000);
  hideStatus();
  chrome.runtime.sendMessage({ type: 'ITEM_DONE', id: item.id, result });
}

// ── Chụp snapshot các URL media hiện có ──
function takeMediaSnapshot(mode) {
  const isVideo = mode.includes('video');
  const isAudio = mode === 'text-to-speech';
  const srcs = new Set();
  if (isAudio) {
    document.querySelectorAll('audio').forEach(a => {
      if (a.src) srcs.add(a.src);
      if (a.currentSrc) srcs.add(a.currentSrc);
      a.querySelectorAll('source').forEach(s => { if (s.src) srcs.add(s.src); });
    });
  } else if (isVideo) {
    document.querySelectorAll('video').forEach(v => {
      if (v.src) srcs.add(v.src);
      if (v.currentSrc) srcs.add(v.currentSrc);
      v.querySelectorAll('source').forEach(s => { if (s.src) srcs.add(s.src); });
    });
  } else {
    document.querySelectorAll('img').forEach(i => {
      if (i.src) srcs.add(i.src);
    });
  }
  return srcs;
}

// ── Đợi kết quả mới xuất hiện ──
async function waitForResult(itemId, mode, timeout, snapSrcs = new Set()) {
  const start = Date.now();
  const preferVideo = mode.includes('video');
  const isAudio = mode === 'text-to-speech';
  let p = 40;

  while (Date.now() - start < timeout) {
    await sleep(4000);
    p = Math.min(92, p + Math.random() * 3);
    prog(itemId, Math.round(p));
    setStatus(`<div>⚙️ Đang render... <b>${Math.round(p)}%</b></div><div style="color:#888;font-size:10px">⏱ ${fmt(Date.now() - start)}</div>`);

    // ── Kiểm tra AUDIO mới ──
    if (isAudio) {
      // Tìm audio kể cả trong Shadow DOM của Angular/LitElement
      const allAuds = [];
      const collectAudio = (root) => {
        try { allAuds.push(...Array.from(root.querySelectorAll('audio'))); } catch {}
        try { for (const el of Array.from(root.querySelectorAll('*'))) { if (el.shadowRoot) collectAudio(el.shadowRoot); } } catch {}
      };
      collectAudio(document);
      const newAuds = allAuds.filter(a => {
        const src = a.src || a.currentSrc || '';
        return src && src.length > 10 && !snapSrcs.has(src);
      });
      if (newAuds.length > 0) {
        const best = newAuds[newAuds.length - 1];
        setStatus(`<div>🔊 Đang nạp Audio...</div>`);

        // Đợi duration >= 3s (không cần phát — AI Studio không tự phát)
        let w = 0;
        while (w < 60) {
          if (best.duration >= 3 || best.ended) break;
          if (best.duration > 0) {
            setStatus(`<div>🔊 Audio: <b>${best.duration.toFixed(1)}s</b>...</div>`);
          }
          await sleep(500);
          w++;
        }

        setStatus(`<div>🔊 Đã sẵn sàng! Đang nhấn tải về...</div>`);
        clickAudioDownloadBtn();
        await sleep(500);
        return { url: best.src || best.currentSrc, ext: 'wav' };
      }
      const newLinks = [...document.querySelectorAll('a[href*=".wav"], a[href*=".mp3"], a[download*=".wav"], a[download*=".mp3"]')].filter(l => {
        return l.href && !snapSrcs.has(l.href);
      });
      if (newLinks.length > 0) {
        const ext = newLinks[0].href.includes('.mp3') ? 'mp3' : 'wav';
        setStatus(`<div>🔊 Đã tạo xong Audio! Đợi phát 3 giây...</div>`);
        await sleep(3500);
        return { url: newLinks[0].href, ext };
      }
    }

    // ── Kiểm tra VIDEO mới ──
    if (preferVideo) {
      const newVids = [...document.querySelectorAll('video')].filter(v => {
        const src = v.src || v.currentSrc || '';
        return src && src.length > 10 && !snapSrcs.has(src);
      });
      if (newVids.length > 0) {
        const best = newVids[newVids.length - 1];
        return { url: best.src || best.currentSrc, ext: 'mp4' };
      }
      const newLinks = [...document.querySelectorAll('a[href*=".mp4"], a[download]')].filter(l => {
        return l.href && (l.href.includes('.mp4') || l.download?.includes('.mp4')) && !snapSrcs.has(l.href);
      });
      if (newLinks.length > 0) return { url: newLinks[0].href, ext: 'mp4' };
    }

    // ── Kiểm tra ẢNH mới ──
    if (!preferVideo && !isAudio) {
      const newImgs = [...document.querySelectorAll('img')].filter(i => {
        const r = i.getBoundingClientRect();
        const src = i.src || '';
        return r.width > 100 && r.height > 100
          && src && !snapSrcs.has(src)
          && (src.startsWith('blob:')
            || src.includes('googleapis')
            || src.includes('storage.google')
            || src.includes('lh3.google')
            || src.includes('googleusercontent')
            || src.includes('labs.google'));
      });
      if (newImgs.length > 0) {
        return { url: newImgs[newImgs.length - 1].src, ext: 'png' };
      }
    }
  }
  const modeLabel = mode.replace(/-/g, ' ');
  throw new Error(`Timeout ${Math.round(timeout / 60000)} phút — không thấy kết quả.\n1. Prompt đã nhập chưa?\n2. Mode "${modeLabel}" có khớp với trang web không?\n3. Hãy đảm bảo trang web hoạt động bình thường.`);
}

// ── Download kết quả ──
async function downloadResult(url, savePath, ext) {
  if (url.startsWith('blob:')) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', url: dataUrl, filename: savePath + '.' + ext });
    } catch (e) {
      console.warn('[VEO] blob→dataURL failed, dùng anchor fallback:', e.message);
      const a = document.createElement('a');
      a.href = url;
      a.download = savePath.split('/').pop() + '.' + ext;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } else {
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', url, filename: savePath + '.' + ext });
  }
}

// ── Helpers ──
function buildSavePath(item, mode, platform, settings = {}) {
  const root = settings.root || 'VEO_Automation';
  const project = settings.project || '';
  const useDate = settings.organizeByDate;
  const dateStr = new Date().toISOString().slice(0, 10);

  let itemName = item.name;
  if (!itemName) itemName = 'SCENE_' + String(item.id).padStart(2, '0');
  itemName = itemName.replace(/^_+|_+$/g, '');

  // Với AI Studio Speech: trích thời gian ra khỏi tên để đặt đúng format
  let name;
  if (platform === 'aistudio-speech') {
    const tm = itemName.match(/(\d+-\d+)_to_(\d+-\d+)_?(.*)/);
    if (tm) {
      const start = tm[1], end = tm[2];
      const topic = tm[3].replace(/^_+|_+$/g, '') || itemName.split('_')[0] || 'SCENE';
      name = String(item.id).padStart(3, '0') + '_' + topic + '_' + start + '_to_' + end;
    } else {
      name = String(item.id).padStart(3, '0') + '_' + itemName;
    }
  } else {
    name = String(item.id).padStart(3, '0') + '_' + itemName;
  }

  // Cấu trúc thư mục
  const parts = [root];
  if (project) parts.push(project);

  if (platform === 'meta-ai') {
    parts.push('HÀNH ĐỘNG');
    if (useDate) parts.push(dateStr);
    parts.push('frame-videos');
  } else if (platform === 'aistudio-speech') {
    parts.push('ÂM THANH');
    if (useDate) parts.push(dateStr);
    parts.push('am_thanh');
  } else {
    if (useDate) parts.push(dateStr);
    parts.push('images');
  }

  parts.push(name);
  return parts.join('/');
}

// Tìm và click nút Download (⬇) trong AI Studio audio player
function clickAudioDownloadBtn() {
  const search = (root) => {
    try {
      for (const btn of Array.from(root.querySelectorAll('button, [role="button"]'))) {
        const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
        if ((label.includes('download') || label.includes('tải')) && !label.includes('upload')) {
          const r = btn.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) { btn.click(); return true; }
        }
      }
    } catch {}
    try {
      for (const icon of Array.from(root.querySelectorAll('mat-icon, .material-icons, .material-symbols-outlined'))) {
        const t = (icon.textContent || '').trim();
        if (t === 'download' || t === 'file_download') {
          const btn = icon.closest('button, [role="button"]');
          if (btn) { const r = btn.getBoundingClientRect(); if (r.width > 0 && r.height > 0) { btn.click(); return true; } }
        }
      }
    } catch {}
    try {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.shadowRoot && search(el.shadowRoot)) return true;
      }
    } catch {}
    return false;
  };
  return search(document);
}

function prog(id, pct) { chrome.runtime.sendMessage({ type: 'ITEM_PROGRESS', id, progress: pct }).catch(() => {}); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmt(ms) { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`; }

console.log('[VEO content] ✓ Bridge ready —', location.href);
