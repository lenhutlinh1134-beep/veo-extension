// background.js — quản lý queue và giao tiếp

const Q = { queue:[], running:[], done:[], failed:[], isRunning:false, concurrency:1, mode:'text-to-video', delayMs:3000, settings:{} };

chrome.action.onClicked.addListener(tab => chrome.sidePanel.open({ tabId: tab.id }));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'START_QUEUE':
        Q.queue = msg.prompts.map((p, i) => {
          const text = typeof p === 'string' ? p : p.text;
          const name = typeof p === 'object' && p.name ? p.name : '';
          const image = typeof p === 'object' && p.image ? p.image : null;
          return { id:i+1, text, name, image, status:'waiting', progress:0, retries:0 };
        });
        Q.concurrency = Math.min(msg.concurrency||1, 3);
        Q.mode = msg.mode||'text-to-video';
        Q.platform = msg.platform||'google-flow';
        Q.delayMs = (msg.delaySeconds||5)*1000;
        Q.settings = msg.settings || {};
        Q.done=[]; Q.failed=[]; Q.running=[];
        Q.isRunning = true;
        broadcast();
        processQueue();
        sendResponse({ ok: true });
        break;

      case 'STOP_QUEUE':
        Q.isRunning = false;
        Q.queue.forEach(i => i.status='stopped'); Q.queue=[];
        broadcast(); sendResponse({ ok:true });
        break;

      case 'GET_STATE': sendResponse(pubState()); break;

      case 'GET_CURRENT_TAB': {
        // Trả tabId của tab Google Flow đang mở
        const platform2 = 'google-flow';
        const flowTab = await findFlowTab(platform2);
        sendResponse({ tabId: flowTab?.id || null });
        break;
      }

      case 'ITEM_PROGRESS': {
        const it = findById(msg.id);
        if (it) { it.progress=msg.progress; it.status='running'; }
        broadcast(); break;
      }
      case 'ITEM_DONE':
        move(msg.id,'done',{result:msg.result,progress:100});
        broadcast(); if(Q.isRunning) processQueue(); break;

      case 'ITEM_FAILED': {
        const it = findById(msg.id);
        if (it && it.retries < 1) {
          it.retries++; it.status='waiting';
          // Chỉ đưa vào lại queue nếu nó đang nằm trong running (tránh lỗi duplicate từ tiến trình cũ)
          if (Q.running.find(x => x.id === msg.id)) {
            Q.running = Q.running.filter(x=>x.id!==msg.id);
            Q.queue.unshift(it);
          }
        } else { move(msg.id,'failed',{error:msg.error}); }
        broadcast(); if(Q.isRunning) setTimeout(processQueue,3000); break;
      }
      case 'DOWNLOAD_FILE':
        chrome.downloads.download({ url:msg.url, filename:msg.filename, saveAs:false }).catch(console.warn);
        sendResponse({ok:true}); break;

      case 'TRUSTED_CLICK': {
        // Dùng chrome.debugger để gửi real mouse click (isTrusted=true) vào tab
        const tabId2 = msg.tabId;
        const x = msg.x;
        const y = msg.y;
        try {
          await new Promise((resolve, reject) => {
            chrome.debugger.attach({tabId: tabId2}, '1.3', () => {
              if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
              resolve();
            });
          });
          // mousePressed
          await new Promise(r => chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1
          }, r));
          await new Promise(r => setTimeout(r, 80));
          // mouseReleased
          await new Promise(r => chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0
          }, r));
          await new Promise(r => setTimeout(r, 80));
          // Detach
          await new Promise(r => chrome.debugger.detach({tabId: tabId2}, r));
          sendResponse({ok: true});
        } catch(e) {
          try { chrome.debugger.detach({tabId: tabId2}, ()=>{}); } catch {}
          sendResponse({ok: false, error: e.message});
        }
        break;
      }

      case 'TRUSTED_ENTER': {
        // Gửi phím Enter vật lý (isTrusted=true) vào tab
        const tabId2 = msg.tabId;
        let debuggerAttached = false;

        try {
          // Đảm bảo debugger attach
          await new Promise((resolve, reject) => {
            chrome.debugger.attach({tabId: tabId2}, '1.3', () => {
              if (chrome.runtime.lastError) {
                if (chrome.runtime.lastError.message.includes('Already attached')) {
                  debuggerAttached = true;
                  resolve();
                  return;
                }
                reject(chrome.runtime.lastError);
                return;
              }
              debuggerAttached = true;
              resolve();
            });
          });

          console.log('[CDP] Debugger attached to tabId:', tabId2);

          // ── CHIẾN LƯỢC 1: Enter thường ──
          console.log('[CDP] Sending simple Enter...');
          await new Promise(r => {
            chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: 'Enter',
              code: 'Enter',
              windowsVirtualKeyCode: 13,
              nativeVirtualKeyCode: 13,
              isSystemKey: false
            }, (result) => {
              if (chrome.runtime.lastError) console.warn('[CDP] keyDown error:', chrome.runtime.lastError.message);
              r();
            });
          });

          await new Promise(r => setTimeout(r, 100));

          await new Promise(r => {
            chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchKeyEvent', {
              type: 'keyUp',
              key: 'Enter',
              code: 'Enter',
              windowsVirtualKeyCode: 13,
              nativeVirtualKeyCode: 13
            }, (result) => {
              if (chrome.runtime.lastError) console.warn('[CDP] keyUp error:', chrome.runtime.lastError.message);
              r();
            });
          });

          await new Promise(r => setTimeout(r, 500));
          console.log('[CDP] Simple Enter sent successfully');
          sendResponse({ok: true, method: 'simple-enter'});

        } catch(err1) {
          console.warn('[CDP] Simple Enter failed, trying Ctrl+Enter:', err1.message);

          try {
            // ── FALLBACK: Ctrl+Enter ──
            if (!debuggerAttached) {
              await new Promise((resolve, reject) => {
                chrome.debugger.attach({tabId: tabId2}, '1.3', () => {
                  if (chrome.runtime.lastError && !chrome.runtime.lastError.message.includes('Already attached')) {
                    reject(chrome.runtime.lastError);
                    return;
                  }
                  resolve();
                });
              });
            }

            console.log('[CDP] Sending Ctrl+Enter...');

            await new Promise(r => {
              chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchKeyEvent', {
                type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17
              }, r);
            });

            await new Promise(r => setTimeout(r, 50));

            await new Promise(r => {
              chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchKeyEvent', {
                type: 'keyDown', modifiers: 2, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
              }, r);
            });

            await new Promise(r => setTimeout(r, 100));

            await new Promise(r => {
              chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchKeyEvent', {
                type: 'keyUp', modifiers: 2, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13
              }, r);
            });

            await new Promise(r => setTimeout(r, 50));

            await new Promise(r => {
              chrome.debugger.sendCommand({tabId: tabId2}, 'Input.dispatchKeyEvent', {
                type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17
              }, r);
            });

            await new Promise(r => setTimeout(r, 500));
            console.log('[CDP] Ctrl+Enter sent successfully');
            sendResponse({ok: true, method: 'ctrl-enter'});

          } catch(err2) {
            console.error('[CDP] Both Enter methods failed:', err2.message);
            sendResponse({ok: false, error: 'Enter failed: ' + err2.message});
          }
        }
        break;
      }

      case 'TEST_CONNECTION': {
        const platform = msg.platform || 'google-flow';
        const t = await findFlowTab(platform);
        if (!t) { sendResponse({ok:false,reason:'no_tab'}); break; }
        // KẾT NỐI: đưa tab Google Flow ra trước + focus cửa sổ → giao diện khớp, sẵn sàng
        try {
          await chrome.tabs.update(t.id, { active: true });
          if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
        } catch {}
        await ensureScript(t.id);
        try {
          const res = await msgTab(t.id,{type:'TEST_CONNECTION', platform});
          sendResponse({ok:true, url: t.url, ...res});
        } catch(e) { sendResponse({ok:false,reason:e.message,tab:t.url}); }
        break;
      }
    }
  })();
  return true;
});

async function processQueue() {
  if (!Q.isRunning) return;
  while (Q.running.length < Q.concurrency && Q.queue.length > 0) {
    const item = Q.queue.shift();
    item.status='running'; Q.running.push(item); broadcast();
    const tab = await findFlowTab(Q.platform);
    if (!tab) { move(item.id,'failed',{error:`Không tìm thấy tab ${Q.platform === 'meta-ai' ? 'Meta AI' : 'Google Flow'}. Hãy mở trang tương ứng trước`}); broadcast(); continue; }
    await ensureScript(tab.id);
    try {
      await msgTab(tab.id,{type:'PROCESS_ITEM', item, mode:Q.mode, platform:Q.platform, delayMs:Q.delayMs, settings:Q.settings});
    } catch(e) { move(item.id,'failed',{error:e.message}); broadcast(); }
  }
  if (Q.queue.length===0 && Q.running.length===0) { Q.isRunning=false; broadcast(); }
}

async function ensureScript(tabId) {
  try { await msgTab(tabId,{type:'PING'}); return; } catch {}
  try {
    await chrome.scripting.executeScript({target:{tabId}, files:['src/content.js']});
    await new Promise(r=>setTimeout(r,1000));
  } catch(e) { console.warn('[VEO BG] inject failed:',e.message); }
}

// Tìm tab làm việc — hỗ trợ cả Google Flow và Meta AI
async function findFlowTab(platform = 'google-flow') {
  if (platform === 'meta-ai') {
    const tabs = await chrome.tabs.query({url:'*://*.meta.ai/*'}).catch(()=>[]);
    if (tabs.length) return tabs[0];
    const all = await chrome.tabs.query({}).catch(()=>[]);
    return all.find(t => t.url && t.url.includes('meta.ai')) || null;
  } else {
    for (const p of ['https://labs.google/fx/*','https://labs.google.com/fx/*']) {
      const tabs = await chrome.tabs.query({url:p}).catch(()=>[]);
      if (tabs.length) return tabs[0];
    }
    const all = await chrome.tabs.query({}).catch(()=>[]);
    return all.find(t => t.url && t.url.includes('labs.google') && t.url.includes('/fx/')) || null;
  }
}

function msgTab(tabId, msg) {
  return new Promise((res,rej)=>{
    chrome.tabs.sendMessage(tabId, msg, r=>{
      if (chrome.runtime.lastError) rej(new Error(chrome.runtime.lastError.message));
      else res(r);
    });
  });
}

function pubState() {
  // queue chỉ chứa waiting items (KHÔNG bao gồm running) — tránh render trùng lặp trong UI
  return { queue:Q.queue, running:Q.running, done:Q.done, failed:Q.failed,
    isRunning:Q.isRunning, total:Q.running.length+Q.queue.length+Q.done.length+Q.failed.length,
    doneCount:Q.done.length, failedCount:Q.failed.length };
}
function broadcast() { chrome.runtime.sendMessage({type:'STATE_UPDATE',state:pubState()}).catch(()=>{}); }
function findById(id) { return [...Q.running,...Q.queue,...Q.done,...Q.failed].find(i=>i.id===id); }
function move(id,target,patch={}) {
  for (const arr of [Q.running,Q.queue]) {
    const idx=arr.findIndex(i=>i.id===id);
    if(idx>=0){const[item]=arr.splice(idx,1);Object.assign(item,{status:target},patch);Q[target].push(item);return;}
  }
}
