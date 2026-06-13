// injected.js — chạy trong MAIN WORLD
// Google Flow dùng div[role="textbox"] contenteditable (React/Slate editor)
// Primary strategy: execCommand('insertText') — hoạt động tốt nhất với Slate
// Fallback: ClipboardEvent paste

(function () {
  if (window.__veoInjected) return;
  window.__veoInjected = true;

  window.addEventListener('message', async (event) => {
    if (!event.data || event.data.source !== 'veo-content') return;
    const { action, id, payload } = event.data;

    try {
      if (action === 'TYPE_TEXT') reply(id, await typeText(payload.text));
      if (action === 'CLICK_SUBMIT') reply(id, clickSubmit());
      if (action === 'SCAN_PAGE') reply(id, scanPage());
      if (action === 'UPLOAD_FILE') reply(id, await uploadFile(payload.imageBase64, payload.filename));
    } catch (err) {
      reply(id, { ok: false, error: err.message });
    }
  });

  function reply(id, data) {
    window.postMessage({ source: 'veo-injected', id, ...data }, '*');
  }

  // ── TaoAnhAI functions integrated ──

  // Recursive search elements supporting Shadow DOM and Iframes
  const o = r => {
    let s = [];
    try {
      const d = r.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""], [role="textbox"], input:not([type="hidden"])');
      s.push(...Array.from(d));
    } catch {}
    try {
      const d = r.querySelectorAll("*");
      for (const l of Array.from(d)) {
        if (l instanceof HTMLElement && l.shadowRoot) {
          s.push(...o(l.shadowRoot));
        }
        if (l instanceof HTMLIFrameElement) {
          try {
            const f = l.contentDocument;
            f && s.push(...o(f));
          } catch {}
        }
      }
    } catch {}
    return s;
  };

  function C(t) {
    return t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable || t.getAttribute("role") === "textbox" ? b(t) : false;
  }

  function x(t) {
    const e = t.getBoundingClientRect();
    const n = R(t);
    let oVal = 0;
    if (n.includes("bạn muốn tạo gì") || n.includes("ban muon tao gi")) oVal += 1000;
    if (n.includes("muốn tạo gì") || n.includes("what do you want to create")) oVal += 800;
    if (n.includes("prompt") || n.includes("describe") || n.includes("mô tả")) oVal += 350;
    if (t.getAttribute("role") === "textbox" || t.isContentEditable) oVal += 120;
    if (t.tagName === "TEXTAREA") oVal += 100;
    if (e.width >= 240) oVal += 80;
    if (e.height >= 32) oVal += 50;
    oVal += Math.min(window.innerHeight, e.top) / 20;
    return oVal;
  }

  function R(t) {
    var n;
    return [
      t.placeholder,
      t.getAttribute("aria-label"),
      t.getAttribute("data-placeholder"),
      t.getAttribute("title"),
      t.textContent,
      (n = t.parentElement) == null ? void 0 : n.textContent
    ].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function findInput() {
    const candidates = o(document).filter(C);
    if (candidates.length === 0) return null;
    return candidates.map(r => ({ el: r, score: x(r) })).sort((a, b) => b.score - a.score)[0].el;
  }

  // Nhập text bằng React setter
  function y(t, e) {
    const n = new DataTransfer();
    n.setData("text/plain", e);
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
      const a = Object.getPrototypeOf(t);
      const i = Object.getOwnPropertyDescriptor(a, "value")?.set;
      i?.call(t, e);
      t.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: e }));
      t.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const oSel = window.getSelection();
    if (oSel) {
      const a = document.createRange();
      a.selectNodeContents(t);
      oSel.removeAllRanges();
      oSel.addRange(a);
    }
    t.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertFromPaste", data: e }));
    t.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: n }));
    t.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertFromPaste", data: e }));
    t.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Nhập text bằng execCommand
  function E(t, e) {
    t.focus();
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
      const a = Object.getPrototypeOf(t);
      const u = Object.getOwnPropertyDescriptor(a, "value")?.set;
      u?.call(t, e);
    } else {
      const oSel = window.getSelection();
      if (oSel) {
        const u = document.createRange();
        u.selectNodeContents(t);
        oSel.removeAllRanges();
        oSel.addRange(u);
      }
      document.execCommand("insertText", false, e);
    }
    t.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: e }));
    t.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function p(t, e) {
    const n = o => o.replace(/\s+/g, " ").trim();
    return n(t) === n(e);
  }

  function v(t) {
    const e = t.getBoundingClientRect();
    const n = e.left + e.width / 2;
    const oVal = e.top + e.height / 2;
    const a = Array.from(document.querySelectorAll(".google-symbols, i"))
      .filter(i => (i.textContent || "").trim() === "arrow_forward")
      .map(i => i.closest('button, [role="button"]'))
      .filter(i => !!i)
      .filter(i => b(i) && !g(i))
      .map(i => {
        const c = i.getBoundingClientRect();
        const r = c.left + c.width / 2;
        const s = c.top + c.height / 2;
        const d = Math.abs(s - oVal) * 1.2 + Math.abs(r - n) * 0.35 + (s < e.top - 120 ? 500 : 0);
        return { button: i, score: d };
      })
      .sort((i, c) => i.score - c.score)[0];
    return !a || a.score > 900 ? null : a.button;
  }

  function M(t) {
    return [
      t.getAttribute("aria-label"),
      t.getAttribute("title"),
      t.getAttribute("data-tooltip"),
      t.getAttribute("data-testid"),
      t.textContent
    ].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function P(t) {
    if (!t || ["play", "pause", "video", "download", "tải", "share", "chia sẻ", "menu", "more", "history", "delete", "xóa", "close", "đóng", "cancel", "hủy", "feedback", "help"].some(n => t.includes(n))) {
      return false;
    }
    return ["send", "submit", "run", "generate", "create", "gửi", "chạy", "tạo"].some(n => t.includes(n));
  }

  function b(t) {
    const e = t.getBoundingClientRect();
    const n = window.getComputedStyle(t);
    return e.width > 0 && e.height > 0 && n.display !== "none" && n.visibility !== "hidden";
  }

  function g(t) {
    return t.hasAttribute("disabled") || t.getAttribute("aria-disabled") === "true" || t instanceof HTMLButtonElement && t.disabled;
  }

  // Find Submit Button
  function findSubmitButton(t, allowDisabled = false) {
    if (!t) t = findInput();
    if (!t) return null;

    const arrowBtn = v(t);
    if (arrowBtn) return arrowBtn;

    const e = t.getBoundingClientRect();
    const n = e.left + e.width / 2;
    const oVal = e.top + e.height / 2;

    // Collect candidates: standard buttons, role=button, class matches inside Shadow DOMs too!
    const allElements = [];
    const collectAll = (root) => {
      try {
        allElements.push(...Array.from(root.querySelectorAll('*')));
        for (const el of Array.from(root.querySelectorAll('*'))) {
          if (el.shadowRoot) collectAll(el.shadowRoot);
          if (el.contentDocument) collectAll(el.contentDocument);
        }
      } catch (e) {}
    };
    collectAll(document);

    const rawList = allElements.filter(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'ms-button' || tag.includes('-button')) return true;
      if (el.getAttribute('role') === 'button' || el.hasAttribute('aria-label') || (el.className && typeof el.className === 'string' && (el.className.includes('button') || el.className.includes('btn')))) return true;
      return false;
    });

    // Scan leaf elements containing specific action keywords (e.g. Run, Generate)
    for (const el of allElements) {
      if (el.children.length === 0 && el.textContent) {
        const textLower = el.textContent.trim().toLowerCase();
        if (textLower.includes('run') || textLower === 'generate' || textLower === 'tạo' || textLower === 'gửi') {
          rawList.push(el);
          if (el.parentElement) rawList.push(el.parentElement);
          if (el.parentElement && el.parentElement.parentElement) rawList.push(el.parentElement.parentElement);
        }
      }
    }

    // Deduplicate
    const list = Array.from(new Set(rawList));

    const candidates = list
      .filter(c => b(c) && (allowDisabled || !g(c)))
      .map(c => {
        const text = M(c);
        const s = c.getBoundingClientRect();
        const d = s.left + s.width / 2;
        const l = s.top + s.height / 2;
        const score = Math.abs(l - oVal) * 1.2 + Math.abs(d - n) * 0.35 + (l < e.top - 120 ? 500 : 0);
        return { el: c, text: text, score };
      })
      .filter(({ text }) => P(text))
      .sort((c, r) => c.score - r.score)[0];

    return (!candidates || candidates.score > 2500) ? null : candidates.el;
  }

  // ── Quét trang diagnostic ──
  function scanPage() {
    const input = findInput();
    const submit = findSubmitButton(input, true);

    // Phát hiện model Google Flow đang dùng (Veo = video, Imagen = ảnh)
    let detectedModel = null;
    const allText = document.body?.innerText || '';
    if (allText.includes('Veo')) detectedModel = 'veo';
    else if (allText.includes('Imagen')) detectedModel = 'imagen';

    return {
      ok: true,
      foundInput: !!input,
      foundSubmit: !!submit,
      detectedModel,
      inputType: input ? `${input.tagName}[role=${input.getAttribute('role') || 'none'}]` : null,
      submitText: submit ? submit.textContent.trim().slice(0, 50) : null,
      pageInfo: {
        url: location.href,
        title: document.title,
        roleTextboxCount: document.querySelectorAll('[role="textbox"]').length,
        textareaCount: document.querySelectorAll('textarea').length,
        buttonCount: document.querySelectorAll('button').length,
      }
    };
  }

  // ── Tải ảnh đính kèm lên trang chat ──
  async function uploadFile(base64Data, filename) {
    const el = findInput();
    if (!el) {
      return { ok: false, error: "Không tìm thấy ô nhập liệu để tải ảnh lên." };
    }

    try {
      // Convert base64 to Blob
      const arr = base64Data.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const file = new File([blob], filename, { type: mime });

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.click();
      await wait(300);

      // Create DataTransfer
      const dt = new DataTransfer();
      dt.items.add(file);

      // Giả lập sự kiện dán (Paste)
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      el.dispatchEvent(pasteEvent);
      await wait(300);

      return { ok: true, method: 'paste' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Nhập text vào editor ──
  async function typeText(text) {
    let el = findInput();
    if (!el) {
      return { ok: false, error: `Không tìm thấy ô nhập. URL: ${location.href}. Hãy click vào ô "Bạn muốn tạo gì?" trước.` };
    }

    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await wait(300);
      el.focus();
      el.click();
      await wait(200);

      // Clean text: Slate editor crash if newline is present
      const cleanText = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

      y(el, cleanText);
      await wait(300);

      const getVal = r => r instanceof HTMLInputElement || r instanceof HTMLTextAreaElement ? r.value : r.textContent || "";
      if (!p(getVal(el), cleanText)) {
        E(el, cleanText);
        await wait(150);
      }

      if (!p(getVal(el), cleanText)) {
        return { ok: false, error: "Không thể xác nhận prompt đã được điền đúng vào ô nhập của labs.google." };
      }

      return { ok: true, method: 'taoanhai-typing' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Click nút submit ──
  function clickSubmit() {
    const input = findInput();
    if (input) {
      // Tự động gửi phím Enter vào ô nhập trước
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }

    const btn = findSubmitButton();
    if (btn) {
      // Gửi cả mousedown + mouseup + click để đảm bảo React handler nhận đủ events
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      btn.click();
      return { ok: true, method: 'enter-and-button-click', text: btn.textContent.trim().slice(0, 30) };
    }

    if (input) {
      return { ok: true, method: 'enter-key-only' };
    }

    return { ok: false, error: 'Không tìm thấy nút Generate hoặc ô nhập. Trang chưa load xong hoặc Google đã đổi UI?' };
  }

  // ── Utility ──
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  console.log('[VEO injected] ✓ Main world ready (with TaoAnhAI robust logic)');
  console.log(location.href);
})()
