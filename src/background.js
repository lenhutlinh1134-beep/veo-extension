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
        Q.done = []; Q.failed = []; Q.running = [];
        Q.isRunning = true;
        Q.settings = msg.settings || {};
        broadcast();
        processQueue();
        sendResponse({ok:true}); break;
      case 'STOP_QUEUE':
        Q.isRunning = false; broadcast();
        sendResponse({ok:true}); break;
      case 'GET_STATE':
        sendResponse(pubState()); break;
      case 'ITEM_PROGRESS': {
        const it = findById(msg.id);
        if (it) { it.progress = msg.progress; broadcast(); }
        sendResponse({ok:true}); break;
      }
      case 'ITEM_DONE':
        move(msg.id,'done',{progress:100}); broadcast();
        if(Q.isRunning) setTimeout(processQueue,2000);
        sendResponse({ok:true}); break;
      case 'ITEM_FAILED': {
        const it = findById(msg.id);
        if (it && it.retries < 2 && msg.error && msg.error.includes('Timeout')) {
          it.retries++;
          if (Q.running.find(x => x.id === msg.id)) {
            Q.running = Q.running.filter(x=>x.id!==msg.id);
            Q.queue.unshift(it);
          }
        } else { move(msg.id,'failed',{error:msg.error}); }
        broadcast(); if(Q.isRunning) setTimeout(processQueue,3000); break;
      }
      case 'DOWNLOAD_FILE':
        try {
          const r = await fetch('http://localhost:4000/api/save-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: msg.filename, url: msg.url.startsWith('http') ? msg.url : undefined, dataUrl: msg.url.startsWith('data:') ? msg.url : undefined })
          });
          if (!r.ok) throw new Error('Local server failed');
        } catch (e) {
          chrome.downloads.download({ url:msg.url, filename:msg.filename, saveAs:false }).catch(console.warn);
        }
        sendResponse({ok:true}); break;

      case 'TEST_CONNECTION': {
        const platform = msg.platform || 'google-flow';
        const t = await findFlowTab(platform);
        if (!t) { sendResponse({ok:false,reason:'no_tab'}); break; }
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

// ── Queue processor ──
async function processQueue() {
  if (!Q.isRunning || Q.queue.length === 0) return;
  while (Q.running.length < Q.concurrency && Q.queue.length > 0) {
    const item = Q.queue.shift();
    item.status = 'running';
    Q.running.push(item);
    broadcast();

    const tab = await findFlowTab(Q.platform);
    if (!tab) {
      move(item.id,'failed',{error:'Không tìm thấy tab. Hãy mở trang Google Flow / Meta AI / AI Studio.'});
      broadcast(); continue;
    }
    await ensureScript(tab.id);
    try {
      await msgTab(tab.id, {
        type:'PROCESS_ITEM', item, mode:Q.mode, platform:Q.platform, delayMs:Q.delayMs, settings:Q.settings
      });
    } catch(e) {
      move(item.id,'failed',{error:e.message}); broadcast();
    }
  }
}

async function ensureScript(tabId) {
  try { await msgTab(tabId,{type:'PING'}); return; } catch {}
  try {
    await chrome.scripting.executeScript({target:{tabId}, files:['src/content.js']});
    await new Promise(r=>setTimeout(r,1000));
  } catch(e) { console.warn('[VEO BG] inject failed:',e.message); }
}

// Tìm tab làm việc
async function findFlowTab(platform = 'google-flow') {
  if (platform === 'meta-ai') {
    const tabs = await chrome.tabs.query({url:'*://*.meta.ai/*'}).catch(()=>[]);
    if (tabs.length) return tabs[0];
    const all = await chrome.tabs.query({}).catch(()=>[]);
    return all.find(t => t.url && t.url.includes('meta.ai')) || null;
  } else if (platform === 'aistudio-speech') {
    const tabs = await chrome.tabs.query({url:'https://aistudio.google.com/*'}).catch(()=>[]);
    if (tabs.length) return tabs[0];
    const all = await chrome.tabs.query({}).catch(()=>[]);
    return all.find(t => t.url && t.url.includes('aistudio.google.com')) || null;
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
