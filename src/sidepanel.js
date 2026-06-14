// sidepanel.js — Manifest V3 compliant (NO inline event handlers)

let mode = 'text-to-video';
let settings = { organizeByDate: true, organizeByMode: true, autoDownload: true, skipOnError: true, retryOnError: true };
let platform = 'google-flow';
let loadedImages = []; // Array of { name: string, dataUrl: string }

// ══════════════════════════════════════
// ██ INIT — gắn tất cả event listeners
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  updatePath();
  refreshState();

  // ── Tabs ──
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
    });
  });

  // ── Mode buttons ──
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('active-img');
      });
      const isImg = !mode.includes('video');
      btn.classList.add(isImg ? 'active-img' : 'active');
      updateModeHint();
      updateImgSelectVisibility();
      updatePath();
      countPrompts();
    });
  });

  // ── Platform Selector ──
  const selPlatform = document.getElementById('sel-platform');
  if (selPlatform) {
    selPlatform.addEventListener('change', () => {
      platform = selPlatform.value;
      updateImgSelectVisibility();
      updateModeHint();
      updatePath();
      countPrompts();
      saveSettings();
    });
  }

  // ── Image selector buttons ──
  document.getElementById('btn-select-imgs')?.addEventListener('click', () => document.getElementById('inp-images').click());
  document.getElementById('inp-images')?.addEventListener('change', handleImageSelection);

  // ── Prompt textarea ──
  const promptArea = document.getElementById('prompt-area');
  if (promptArea) promptArea.addEventListener('input', countPrompts);

  // ── Import buttons ──
  document.getElementById('btn-import-txt')?.addEventListener('click', () => document.getElementById('f-txt').click());
  document.getElementById('btn-import-csv')?.addEventListener('click', () => document.getElementById('f-csv').click());
  document.getElementById('btn-clear')?.addEventListener('click', clearPrompts);
  document.getElementById('btn-sample')?.addEventListener('click', loadSample);

  // ── File inputs ──
  document.getElementById('f-txt')?.addEventListener('change', importTxt);
  document.getElementById('f-csv')?.addEventListener('change', importCsv);

  // ── Path update on input change ──
  document.getElementById('inp-root')?.addEventListener('input', updatePath);
  document.getElementById('inp-project')?.addEventListener('input', updatePath);

  // ── Main buttons ──
  document.getElementById('btn-test')?.addEventListener('click', testConnection);
  document.getElementById('btn-start')?.addEventListener('click', startQueue);
  document.getElementById('btn-stop')?.addEventListener('click', stopQueue);

  // ── Toggle switches ──
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const key = toggle.dataset.key;
      if (key) {
        settings[key] = !settings[key];
        toggle.classList.toggle('on', settings[key]);
        saveSettings();
        updatePath();
      }
    });
  });
  countPrompts();
  updateImgSelectVisibility();
});

// ── Nhận state updates từ background ──
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'STATE_UPDATE') renderState(msg.state);
});

// ══════════════════════════
// ██ PATH PREVIEW
// ══════════════════════════
function updatePath() {
  const root = document.getElementById('inp-root')?.value || 'VEO_Automation';
  const proj = document.getElementById('inp-project')?.value || '';
  const parts = [root];
  if (proj) parts.push(proj);
  if (settings.organizeByDate) parts.push(new Date().toISOString().slice(0, 10));
  if (settings.organizeByMode) parts.push(getModeFolder(mode));
  const display = document.getElementById('path-display');
  if (display) display.textContent = parts.join('\\') + '\\';
}

function getModeFolder(m) {
  const map = {
    'text-to-video':        'videos',
    'frame-to-video':       'frame-videos',
    'ingredients-to-video': 'ingredient-videos',
    'text-to-image':        'images',
    'image-to-image':       'img2img',
    'last-image-to-image':  'last-img',
  };
  return map[m] || (m.includes('video') ? 'videos' : 'images');
}

// Hiển thị gợi ý khi chọn mode cần upload ảnh
function updateModeHint() {
  const imgModes = ['frame-to-video', 'ingredients-to-video', 'image-to-image', 'last-image-to-image'];
  const needsImg = imgModes.includes(mode);
  const hint = document.getElementById('mode-hint');
  if (!hint) return;
  if (needsImg) {
    let msg = '';
    if (platform === 'meta-ai') {
      msg = {
        'frame-to-video':       '💡 Chọn danh sách ảnh bên dưới để tự động tải lên Meta AI tạo video phân cảnh',
        'ingredients-to-video': '💡 Upload nhiều ảnh nguyên liệu vào Meta AI',
        'image-to-image':       '💡 Chọn ảnh tương ứng bên dưới để Meta AI chỉnh sửa (Image to Image)',
        'last-image-to-image':  '💡 Dùng ảnh cuối vừa tạo làm đầu vào cho ảnh tiếp theo'
      }[mode] || '';
    } else {
      msg = {
        'frame-to-video':       '⚠ Mode này cần bạn upload ảnh khung vào Google Flow trước',
        'ingredients-to-video': '⚠ Mode này cần upload nhiều ảnh nguyên liệu vào Google Flow trước',
        'image-to-image':       '⚠ Mode này cần upload ảnh gốc vào Google Flow trước',
        'last-image-to-image':  '💡 Mode này dùng ảnh cuối vừa tạo làm đầu vào — nhập prompt biến thể'
      }[mode] || '';
    }
    hint.textContent = msg;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

function updateImgSelectVisibility() {
  const container = document.getElementById('img-select-container');
  if (!container) return;
  const imageModes = ['frame-to-video', 'ingredients-to-video', 'image-to-image'];
  const needsImg = imageModes.includes(mode);
  // Show image selector container if mode requires image upload
  container.style.display = needsImg ? 'block' : 'none';
}

async function handleImageSelection(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  
  loadedImages = [];
  
  const readAsDataURL = file => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = e => resolve({ name: file.name, dataUrl: e.target.result });
    reader.readAsDataURL(file);
  });
  
  for (const file of files) {
    const res = await readAsDataURL(file);
    loadedImages.push(res);
  }
  
  renderImagePreview();
  toast(`✓ Đã nhận diện ${files.length} ảnh`);
}

function renderImagePreview() {
  const cnt = document.getElementById('img-count');
  if (cnt) cnt.textContent = `${loadedImages.length} ảnh`;
  
  const box = document.getElementById('img-preview-box');
  if (box) {
    if (!loadedImages.length) {
      box.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-dark);font-size:11px;">Chưa chọn ảnh nào.</div>';
    } else {
      box.innerHTML = loadedImages.map((img, index) => {
        return `
          <div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:6px; padding:6px 10px; margin-bottom:4px; font-size:11px;">
            <span style="color:var(--accent); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">#${index + 1}: ${esc(img.name)}</span>
            <span style="color:var(--red); cursor:pointer; font-weight:700;" class="btn-remove-img" data-index="${index}">✕</span>
          </div>
        `;
      }).join('');
      
      box.querySelectorAll('.btn-remove-img').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.index);
          loadedImages.splice(idx, 1);
          renderImagePreview();
        });
      });
    }
  }
  countPrompts();
}

// ══════════════════════════
// ██ PROMPTS
// ══════════════════════════
function countPrompts() {
  const prompts = getPrompts();
  const n = prompts.length;
  const el = document.getElementById('prompt-count');
  if (el) {
    const isVideo = mode.includes('video');
    const typeLabel = isVideo ? 'video' : 'ảnh';
    el.innerHTML = `
      <span class="badge-container">
        <span class="badge badge-prompts">${n} prompt</span>
        <span class="badge badge-outputs">${n} ${typeLabel}</span>
      </span>
    `;
  }

  const previewBox = document.getElementById('prompt-preview-container');
  if (previewBox) {
    if (n === 0) {
      previewBox.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-dark);font-size:11px;">Chưa phát hiện prompt nào. Hãy điền/dán văn bản ở trên.</div>';
    } else {
      const imageModes = ['frame-to-video', 'ingredients-to-video', 'image-to-image'];
      const needsImg = imageModes.includes(mode);

      previewBox.innerHTML = prompts.map((p, index) => {
        const title = p.name ? p.name : `Prompt ${String(index + 1).padStart(2, '0')}`;
        const excerpt = p.text.slice(0, 65) + (p.text.length > 65 ? '...' : '');
        
        let imgTag = '';
        if (needsImg) {
          if (loadedImages[index]) {
            imgTag = `<div style="font-size: 10px; color: var(--accent); margin-top: 4px; display: flex; align-items: center; gap: 4px; font-weight: 500;">🖼️ ${esc(loadedImages[index].name)}</div>`;
          } else {
            imgTag = `<div style="font-size: 10px; color: var(--red); margin-top: 4px; display: flex; align-items: center; gap: 4px; font-weight: 600;">⚠️ Thiếu ảnh (Không có ảnh khớp cho prompt này)</div>`;
          }
        }

        return `
          <div class="preview-item">
            <div class="preview-title"><span class="idx">#${index + 1}</span> ${esc(title)}</div>
            <div class="preview-text" title="${esc(p.text)}">${esc(excerpt)}</div>
            ${imgTag}
          </div>
        `;
      }).join('');
    }
  }
}

function getPrompts() {
  const text = document.getElementById('prompt-area')?.value || '';
  if (!text.trim()) return [];

  // Format 1 — Markdown chuẩn hoá: **SCENE X — TITLE**\n```\nprompt\n```
  const mdMatches = [...text.matchAll(/\*\*SCENE\s+(\d+)[^*\n]*\*\*[^\n]*\n+```[^\n]*\n([\s\S]*?)\n```/g)];
  if (mdMatches.length > 0) {
    return mdMatches.map(m => ({
      text: m[2].trim(),
      name: `SCENE_${m[1].padStart(2, '0')}`
    }));
  }

  // Format 2 — Bracket blocks: [SCENE 1 — 0:00 to 0:35 | HOOK]
  const sceneRegex = /^\[(.*?)\]/m;
  if (sceneRegex.test(text)) {
    const prompts = [];
    const blocks = text.split(/^\[(.*?)\]/m);
    for (let i = 1; i < blocks.length; i += 2) {
      let rawName = blocks[i].trim();
      let name = rawName.replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
      let promptText = blocks[i+1].trim();
      if (promptText) prompts.push({ text: promptText, name: name });
    }
    if (prompts.length > 0) return prompts;
  }

  // Format 3 — Đoạn cách bởi dòng trống
  if (text.includes('\n\n')) {
    return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean).map(p => ({ text: p.replace(/\n/g, ' '), name: '' }));
  }

  // Format 4 — Mỗi dòng 1 prompt
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ text: l, name: '' }));
}

function clearPrompts() {
  const el = document.getElementById('prompt-area');
  if (el) el.value = '';
  countPrompts();
}

function loadSample() {
  const el = document.getElementById('prompt-area');
  if (el) {
    el.value =
`**SCENE 01 — HOOK**
\`\`\`
Young man in gray hoodie lying on bed at night, scrolling smartphone,
blue ambient glow from phone screen, skeptical confused expression,
2D flat animation style, dark navy palette, 16:9
\`\`\`

**SCENE 02 — PROBLEM**
\`\`\`
Split screen: LEFT panel shows character making bad trade, money flying away,
RIGHT panel shows character defeated with empty wallet,
bold white stat card: "Average investor: 16.5%" vs "S&P 500: 25%",
2D flat animation, dark navy background, high contrast, 16:9
\`\`\`

**SCENE 03 — SOLUTION**
\`\`\`
Three buckets on black background, left-to-right with pop animation,
Bucket 1 blue label "SAFETY", Bucket 2 red label "DEBT", Bucket 3 green label "INVESTING",
bold white title above: "The Three Bucket System",
2D flat icon style, empowering mood, 16:9
\`\`\``;
  }
  countPrompts();
}

function importTxt(event) {
  const file = event.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const el = document.getElementById('prompt-area');
    if (el) el.value = e.target.result.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    countPrompts(); toast(`✓ Imported từ .txt`);
  };
  r.readAsText(file); event.target.value = '';
}

function importCsv(event) {
  const file = event.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const lines = e.target.result.split('\n')
      .map(l => l.split(',')[0].replace(/^"|"$/g, '').trim())
      .filter(l => l && l.toLowerCase() !== 'prompt');
    const el = document.getElementById('prompt-area');
    if (el) el.value = lines.join('\n');
    countPrompts(); toast(`✓ Imported ${lines.length} prompt từ CSV`);
  };
  r.readAsText(file); event.target.value = '';
}

// ══════════════════════════
// ██ TEST CONNECTION
// ══════════════════════════
async function testConnection() {
  const btn = document.getElementById('btn-test');
  const platformName = platform === 'meta-ai' ? 'Meta AI' : 'Google Flow';
  btn.textContent = '⏳ Đang kiểm tra...'; btn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION', platform });
    if (res?.ok) {
      const tabUrl = (res.url || '').replace(/^https?:\/\//, '').slice(0, 50);
      const inputInfo = res.foundInput ? `✓ Ô nhập (${res.inputType || '?'})` : '⚠ Chưa thấy ô nhập';
      // Khoe vị trí nút gửi đã khóa được (xác nhận đúng vị trí GG Lab)
      let submitInfo;
      if (res.foundSubmit && res.submitInfo) {
        submitInfo = `<br>✓ Đã khóa nút gửi: <b style="color:#00e5a0">"${esc(res.submitInfo.label)}"</b> tại vị trí x=${res.submitInfo.x}, y=${res.submitInfo.y} (${res.submitInfo.size})`;
      } else if (res.foundSubmit) {
        submitInfo = '<br>✓ Đã thấy nút Gửi/Tạo';
      } else {
        submitInfo = `<br>⚠ Chưa khóa được nút Gửi/Tạo${res.buttonsNearInput ? `<br><small style="color:#888">Nút quanh ô nhập: ${esc(res.buttonsNearInput)}</small>` : ''}`;
      }

      // Cảnh báo nếu mode extension không khớp với model Google Flow
      let modelWarn = '';
      if (res.detectedModel && platform === 'google-flow') {
        const isVideoMode = mode.includes('video');
        const isImagenModel = res.detectedModel === 'imagen';
        const modeLabel = { 'text-to-video': 'Text→Video', 'frame-to-video': 'Frame→Video',
          'ingredients-to-video': 'Nguyên liệu→Video', 'text-to-image': 'Text→Ảnh',
          'image-to-image': 'Ảnh→Ảnh', 'last-image-to-image': 'Ảnh cuối→Ảnh' }[mode] || mode;
        if (isVideoMode && isImagenModel) {
          modelWarn = `<br><b style="color:#ffd32a">⚠ Extension ở mode <u>${modeLabel}</u> nhưng Google Flow đang dùng Imagen (ảnh)!</b>`;
        } else if (!isVideoMode && res.detectedModel === 'veo') {
          modelWarn = `<br><b style="color:#ffd32a">⚠ Extension ở mode <u>${modeLabel}</u> nhưng Google Flow đang dùng Veo (video)!</b>`;
        } else {
          modelWarn = `<br><small style="color:#00e5a0">✓ Model: ${res.detectedModel.toUpperCase()} — khớp mode <u>${modeLabel}</u></small>`;
        }
      }

      // Gửi bằng Enter → chỉ cần thấy Ô NHẬP là sẵn sàng.
      // (Nút gửi bị KHÓA khi ô trống là bình thường — sẽ hiện sau khi gõ prompt.)
      const noteSubmit = res.foundSubmit ? '' : '<br><small style="color:#888">ℹ Nút Gửi đang khóa vì ô trống — bình thường. Lúc chạy sẽ gửi bằng Enter sau khi điền prompt.</small>';
      const readyState = res.foundInput
        ? `<b style="color:#00e5a0">✅ Sẵn sàng chạy! (gửi bằng Enter)</b>`
        : `<b style="color:#ff6b6b">⚠ Chưa thấy ô nhập — hãy F5 trang Flow</b>`;

      showBanner(`${readyState}<br><small>${tabUrl}</small><br><small>${inputInfo}${submitInfo}</small>${noteSubmit}${modelWarn}`, res.foundInput ? 'ok' : 'error');
    } else {
      const hint = res?.reason === 'no_tab'
        ? `Chưa tìm thấy tab ${platformName}.<br>Hãy mở trang ${platform === 'meta-ai' ? '<b>meta.ai/create</b>' : '<b>labs.google/fx/tools/video-fx</b>'} trong Chrome.`
        : `Lỗi: ${res?.reason || res?.error || 'không rõ'}`;
      showBanner(`❌ Kết nối thất bại<br><small>${hint}</small>`, 'error');
    }
  } catch (e) { showBanner(`❌ ${e.message}`, 'error'); }
  btn.textContent = `🔌 Test kết nối ${platformName}`; btn.disabled = false;
}

// ══════════════════════════
// ██ START / STOP QUEUE
// ══════════════════════════
async function startQueue() {
  const prompts = getPrompts();
  if (!prompts.length) { toast('⚠ Chưa có prompt'); return; }

  const concurrent = parseInt(document.getElementById('inp-concurrent')?.value) || 1;
  const delaySeconds = parseInt(document.getElementById('inp-delay')?.value) || 5;

  const imageModes = ['frame-to-video', 'ingredients-to-video', 'image-to-image'];
  const needsImg = imageModes.includes(mode);

  if (needsImg && loadedImages.length > 0 && loadedImages.length < prompts.length) {
    toast(`⚠ Chú ý: Bạn chọn ${loadedImages.length} ảnh nhưng có ${prompts.length} prompt.`);
  }

  const pairedPrompts = prompts.map((p, i) => {
    let imgData = null;
    if (needsImg && loadedImages[i]) {
      imgData = loadedImages[i].dataUrl;
    }
    return { ...p, image: imgData };
  });

  chrome.runtime.sendMessage({
    type: 'START_QUEUE',
    prompts: pairedPrompts,
    mode,
    platform,
    concurrency: Math.min(concurrent, 3),
    delaySeconds,
    settings: {
      root: document.getElementById('inp-root')?.value || 'VEO_Automation',
      project: document.getElementById('inp-project')?.value || '',
      ...settings
    }
  });

  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('btn-stop').style.display = 'block';
  document.getElementById('prog-box').style.display = 'block';
  showBanner(`▶ Đã gửi ${prompts.length} prompt vào hàng chờ`, 'ok');
}

function stopQueue() {
  chrome.runtime.sendMessage({ type: 'STOP_QUEUE' });
  document.getElementById('btn-start').style.display = 'block';
  document.getElementById('btn-stop').style.display = 'none';
  toast('⬛ Đã dừng');
}

// ══════════════════════════
// ██ STATE RENDERING
// ══════════════════════════
async function refreshState() {
  const s = await chrome.runtime.sendMessage({ type: 'GET_STATE' }).catch(() => null);
  if (s) renderState(s);
}

function renderState(s) {
  if (!s) return;
  const total = s.total || 0, done = s.doneCount || 0, failed = s.failedCount || 0;
  const running = (s.running || []).length;
  const waiting = (s.queue || []).filter(i => i.status === 'waiting').length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  const bar = document.getElementById('prog-bar');
  if (bar) bar.style.width = pct + '%';
  setText('cnt-done', done);
  setText('cnt-run', running);
  setText('cnt-fail', failed);
  setText('cnt-wait', waiting);

  if (total > 0) document.getElementById('prog-box').style.display = 'block';
  if (!s.isRunning && total > 0 && done + failed >= total) {
    document.getElementById('btn-start').style.display = 'block';
    document.getElementById('btn-stop').style.display = 'none';
    if (done === total) showBanner(`🎉 Xong! ${done} prompt hoàn thành.`, 'ok');
  }
  renderQueue(s);
}

function renderQueue(s) {
  const wrap = document.getElementById('queue-wrap'); if (!wrap) return;
  const all = [...(s.running || []), ...(s.queue || []), ...(s.done || []), ...(s.failed || [])].sort((a, b) => a.id - b.id);
  if (!all.length) {
    wrap.innerHTML = '<div class="empty"><div class="icon">📋</div><p>Chưa có prompt.<br>Vào <b>Điều khiển</b> để thêm.</p></div>';
    return;
  }
  wrap.innerHTML = `<div class="queue-list">${all.map(item => {
    const errFull = (item.error || '').trim();
    const errShort = errFull.length > 90 ? errFull.slice(0, 90) + '…' : errFull;
    const statusTxt = { waiting: 'Đang chờ', running: 'Đang xử lý...', done: '✓ Hoàn thành', failed: `✗ Lỗi: ${esc(errShort)}`, stopped: 'Đã dừng' }[item.status] || item.status;
    const titleAttr = item.status === 'failed' && errFull ? ` title="${esc(errFull)}"` : '';
    const bar = item.status === 'running' ? `<div class="q-pbar"><div class="q-pfill" style="width:${item.progress || 0}%"></div></div>` : '';
    const numTxt = item.status === 'done' ? '✓' : item.status === 'failed' ? '✗' : item.id;
    return `<div class="q-item ${item.status}">
      <div class="q-num">${numTxt}</div>
      <div class="q-info">
        <div class="q-text">${esc(item.text)}</div>
        <div class="q-status"${titleAttr}>${statusTxt}</div>
        ${bar}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ══════════════════════════
// ██ SETTINGS
// ══════════════════════════
function loadSettings() {
  chrome.storage.local.get(['veoSettings', 'veoPlatform'], d => {
    if (d.veoSettings) Object.assign(settings, d.veoSettings);
    if (d.veoPlatform) {
      platform = d.veoPlatform;
      const sel = document.getElementById('sel-platform');
      if (sel) sel.value = platform;
    }
    document.querySelectorAll('.toggle[data-key]').forEach(toggle => {
      const key = toggle.dataset.key;
      if (key && settings[key] !== undefined) {
        toggle.classList.toggle('on', settings[key]);
      }
    });
    updateImgSelectVisibility();
    updateModeHint();
    updatePath();
  });
}

function saveSettings() { 
  chrome.storage.local.set({ 
    veoSettings: settings,
    veoPlatform: platform
  }); 
}

// ══════════════════════════
// ██ HELPERS
// ══════════════════════════
function toast(msg) {
  const el = document.getElementById('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function showBanner(html, type = 'ok') {
  const el = document.getElementById('banner'); if (!el) return;
  el.innerHTML = html; el.className = `banner ${type}`; el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 8000);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
