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

// ── Overlay trạng thái (hộp gọn, cố định, tự cuộn — không tràn dài) ──
function setStatus(html, color) {
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = '__veo_status';
    statusEl.style.cssText = 'position:fixed;bottom:90px;right:14px;z-index:2147483647;background:#0d0d18f2;border:1.5px solid #00e5a0;border-radius:12px;font-family:Segoe UI,system-ui,sans-serif;font-size:12px;color:#e0e0f0;width:300px;max-height:240px;box-shadow:0 8px 32px rgba(0,0,0,.8);backdrop-filter:blur(8px);overflow:hidden;display:flex;flex-direction:column;';
    document.documentElement.appendChild(statusEl);
  }
  statusEl.style.display = 'flex';
  statusEl.style.borderColor = color || '#00e5a0';
  statusEl.innerHTML =
    `<div style="font-weight:700;color:${color || '#00e5a0'};padding:9px 14px 6px;flex:0 0 auto;border-bottom:1px solid #ffffff14">🤖 VEO Automation</div>` +
    `<div style="padding:8px 14px 11px;overflow-y:auto;line-height:1.45;word-break:break-word">${html}</div>`;
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

// ── Đợi trang Google Flow load — CHỈ cần ô nhập ──
// (Nút Gửi/Generate bị KHÓA khi ô trống, chỉ hiện sau khi gõ chữ → không thể đòi nó lúc này)
async function waitForPageReady(timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    try {
      await ensureInjected();
      const scan = await callInjected('SCAN_PAGE');

      if (scan.foundInput) {
        setStatus(`<div style="color:#00e5a0">✅ Trang sẵn sàng! (đã thấy ô nhập)</div>`);
        await sleep(300);
        return;
      }

      setStatus(`<div>⏳ Đợi trang load... <b>${elapsed}s</b></div><div style="color:#888;font-size:11px">Chưa thấy ô nhập → có thể cần F5</div>`);
    } catch (e) {
      setStatus(`<div>⏳ Đợi trang load... <b>${elapsed}s</b></div><div style="color:#888;font-size:11px">Đang inject script...</div>`);
      injected = false;
      try { await ensureInjected(); } catch {}
    }
    await sleep(2000);
  }
  throw new Error('Không thấy ô nhập sau 45 giây.\n→ Hãy F5 refresh trang Google Flow, đợi load xong rồi thử lại.');
}

// ── Xử lý 1 prompt ──
async function runItem(item, mode, platform, delayMs, settings = {}) {
  await ensureInjected();

  // Chờ trang load xong và có ô nhập — xử lý trường hợp "Application error" hoặc trang load chậm
  await waitForPageReady(45000);

  setStatus(`<div>⏳ Chờ ${Math.round(delayMs / 1000)}s...</div><div style="color:#aaa;font-size:11px">#${item.id}: ${item.text.slice(0, 50)}...</div>`);
  await sleep(delayMs);
  prog(item.id, 10);

  // ── Upload ảnh đính kèm (nếu có) ──
  if (item.image) {
    setStatus(`<div>📤 Đang tải lên ảnh đính kèm...</div>`);
    const uploadResult = await callInjected('UPLOAD_FILE', { imageBase64: item.image, filename: `frame_${item.id}.png` });
    if (!uploadResult.ok) throw new Error(`Tải ảnh lên thất bại: ${uploadResult.error}`);
    await sleep(2500); // Chờ 2.5s để trang web load ảnh
  }

  // Nhập text
  setStatus(`<div>⌨️ Nhập prompt #${item.id}...</div>`);
  const typeResult = await callInjected('TYPE_TEXT', { text: item.text });
  if (!typeResult.ok) throw new Error(`Nhập text thất bại: ${typeResult.error}`);
  await sleep(1500);
  prog(item.id, 30);

  // ── Đợi nút gửi active (Google Flow disable nút khi input trống) ──
  setStatus(`<div>⏳ Đợi nút gửi sẵn sàng...</div>`);
  let btnReadyCount = 0;
  while (btnReadyCount < 15) {
    const btnReady = await callInjected('IS_SUBMIT_ENABLED');
    if (btnReady?.enabled) break;
    await sleep(300);
    btnReadyCount++;
  }
  await sleep(800);

  // ── QUAN TRỌNG: Chụp snapshot TRƯỚC khi submit ──
  // Snapshot sau submit sẽ miss kết quả nếu render nhanh
  const snapSrcs = takeMediaSnapshot(mode);

  // ── SUBMIT: Tự động nhấn Enter (TRUSTED_ENTER) ──
  setStatus(`<div>🚀 Tự động gửi (Enter)...</div>`);

  const tabId = await getCurrentTabId();
  await callInjected('FOCUS_INPUT');
  await sleep(300);

  const enterRes = await chrome.runtime.sendMessage({
    type: 'TRUSTED_ENTER',
    tabId
  });

  if (!enterRes?.ok) {
    console.warn('[VEO] TRUSTED_ENTER failed:', enterRes?.error);
  }

  // Chờ render bắt đầu
  await sleep(2000);

  // Kiểm tra xem render đã bắt đầu chưa (progress bar / % / ảnh mới)
  const hasStarted = await callInjected('CHECK_RENDER_STARTED', { snapshot: Array.from(snapSrcs) });
  if (!hasStarted?.started) {
    // Không throw error — có thể render chậm, tiếp tục chờ xem
    console.warn('[VEO] Render chưa bắt đầu, nhưng tiếp tục chờ...');
  }

  await sleep(1000);
  prog(item.id, 40);

  // Chờ kết quả — truyền snapshot để so sánh URL thay vì đếm elements
  const timeout = mode.includes('video') ? 600000 : 180000;
  const result = await waitForResult(item.id, mode, timeout, snapSrcs);

  // Download
  if (result?.url) {
    const savePath = buildSavePath(item, mode, settings);
    setStatus(`<div style="color:#00e5a0">✅ Xong! Đang tải về...</div>`, '#00e5a0');
    await downloadResult(result.url, savePath, result.ext);
  }

  await sleep(2000);
  hideStatus();
  chrome.runtime.sendMessage({ type: 'ITEM_DONE', id: item.id, result });
}

// ── Chụp snapshot các URL media hiện có (gọi TRƯỚC khi submit) ──
function takeMediaSnapshot(mode) {
  const isVideo = mode.includes('video');
  const srcs = new Set();
  if (isVideo) {
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
// Detect CẢ video lẫn ảnh — tránh treo khi mode không khớp với model Google đang dùng
async function waitForResult(itemId, mode, timeout, snapSrcs = new Set()) {
  const start = Date.now();
  const preferVideo = mode.includes('video');
  let p = 40;

  while (Date.now() - start < timeout) {
    await sleep(4000);
    
    // Tìm phần trăm thực tế trên trang (nếu Google Flow có hiển thị dạng "45%")
    const pageText = document.body.innerText || '';
    const match = pageText.match(/(\d+)%/);
    if (match) {
      p = parseInt(match[1]);
    } else {
      p = Math.min(92, p + Math.random() * 3);
    }
    
    prog(itemId, Math.round(p));
    setStatus(`<div>⚙️ Đang render... <b>${Math.round(p)}%</b></div><div style="color:#888;font-size:10px">⏱ ${fmt(Date.now() - start)}</div>`);

    // ── 1. Đảm bảo không còn Loading/Progress bar nào đang chạy ──
    // Nếu Google Flow đang hiển thị thanh load/spinner, tuyệt đối không được skip!
    const isLoading = Array.from(document.querySelectorAll('*')).some(el => {
      const role = el.getAttribute('role');
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const cls = (el.className || '');
      // Kiểm tra progressbar, spinner, hoặc text "đang tạo", "generating"
      return role === 'progressbar' || 
             aria.includes('đang tạo') || aria.includes('generating') || 
             (typeof cls === 'string' && (cls.includes('spinner') || cls.includes('loading')));
    });

    if (isLoading) {
      continue; // Đang load, bỏ qua đoạn check ảnh dưới đây và tiếp tục chờ
    }

    // ── 2. Kiểm tra VIDEO mới ──
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

    // ── Kiểm tra ẢNH mới (luôn check, không phụ thuộc mode — Imagen 4 trả ảnh) ──
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
      return { url: newImgs[newImgs.length - 1].src, ext: preferVideo ? 'mp4' : 'png' };
    }
  }
  const modeLabel = mode.replace(/-/g, ' ');
  throw new Error(`Timeout ${Math.round(timeout / 60000)} phút — không thấy kết quả.\n1. Prompt đã nhập chưa?\n2. Mode "${modeLabel}" có khớp với Google Flow không?\n3. Với mode cần ảnh input (Frame/Img2Img), hãy upload ảnh trước.`);
}

// ── Download kết quả ──
// Blob URL chỉ accessible trong page context (không gửi qua background được)
// → Convert sang dataURL trước, rồi gửi background download
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
      // Fallback: anchor click — mất subfolder path nhưng vẫn tải được file
      console.warn('[VEO] blob→dataURL failed, dùng anchor fallback:', e.message);
      const a = document.createElement('a');
      a.href = url;
      a.download = savePath.split('/').pop() + '.' + ext;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } else {
    // URL thường (https) — gửi background download bình thường
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', url, filename: savePath + '.' + ext });
  }
}

// ── Helpers ──
function buildSavePath(item, mode, settings = {}) {
  const root = settings.root || 'VEO_Automation';
  const project = settings.project || '';
  const useDate = settings.organizeByDate;
  const useMode = settings.organizeByMode !== false;
  const dateStr = new Date().toISOString().slice(0, 10);

  let itemName = item.name;
  if (!itemName) {
    itemName = 'SCENE_' + String(item.id).padStart(2, '0');
  }

  const name = String(item.id).padStart(3, '0') + '_' + itemName;

  const folderMap = {
    'text-to-video': 'videos', 'frame-to-video': 'frame-videos',
    'ingredients-to-video': 'ingredient-videos', 'text-to-image': 'images',
    'image-to-image': 'img2img', 'last-image-to-image': 'last-img',
  };
  const modeFolder = folderMap[mode] || (mode.includes('video') ? 'videos' : 'images');

  const parts = [root];
  if (project) parts.push(project);
  if (useDate) parts.push(dateStr);
  if (useMode) parts.push(modeFolder);
  parts.push(name);
  return parts.join('/');
}

function prog(id, pct) { chrome.runtime.sendMessage({ type: 'ITEM_PROGRESS', id, progress: pct }).catch(() => {}); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmt(ms) { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`; }
async function getCurrentTabId() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' }, (res) => {
      resolve(res?.tabId || null);
    });
  });
}

console.log('[VEO content] ✓ Bridge ready —', location.href);
