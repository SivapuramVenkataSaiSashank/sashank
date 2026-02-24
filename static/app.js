const API = '/api';

// DOM Elements
const views = { app: document.getElementById('app-shell') };
const tabs = document.querySelectorAll('.tab-content');
const tabBtns = document.querySelectorAll('.tab-btn');

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const apiStatusText = document.getElementById('api-status-text');

// Document state
let docState = { loaded: false, page: 0, total: 0, label: '', text: '', title: '', ext: '' };
let bookmarks = [];
let aiLoading = false;

// Audio
let audioInst = null;

// Status helper
function showStatus(msg, type = 'info') {
    statusText.innerText = msg;
    statusDot.className = 'status-dot';
    if (type === 'ok') statusDot.classList.add('green');
    else if (type === 'warn') statusDot.classList.add('yellow');
    else if (type === 'error') statusDot.classList.add('red');
    else statusDot.classList.add('blue');
}

async function apiCall(path, opts = {}) {
    const res = await fetch(API + path, opts);
    if (!res.ok) {
        let err;
        try { err = await res.json(); } catch (e) { err = { detail: res.statusText }; }
        throw new Error(err.detail || 'Request failed');
    }
    return res.json();
}

async function apiBlob(path, body) {
    const res = await fetch(API + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('TTS failed');
    return res.blob();
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Check API status
    try {
        const d = await apiCall('/status');
        if (d.api_ready) {
            apiStatusText.innerText = 'Groq AI Ready';
            apiStatusText.parentElement.classList.add('ready');
        } else {
            apiStatusText.innerText = 'API key not set in .env';
            apiStatusText.parentElement.classList.remove('ready');
            apiStatusText.parentElement.classList.add('warn');
        }
    } catch (e) { }

    // Setup tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // File Upload
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', e => { Object.assign(e); dropZone.classList.remove('drag'); });
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag');
        if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files.length) handleUpload(e.target.files[0]);
    });

    // Pagination
    document.getElementById('btn-prev').addEventListener('click', () => navigate('prev'));
    document.getElementById('btn-next').addEventListener('click', () => navigate('next'));
    document.getElementById('btn-goto').addEventListener('click', () => {
        const val = parseInt(document.getElementById('goto-input').value) || 1;
        navigate('goto', val - 1);
    });

    // Document Tab buttons
    document.getElementById('btn-read-aloud').addEventListener('click', () => playTTS(docState.label + '. ' + docState.text));
    document.getElementById('btn-stop-reading').addEventListener('click', () => playTTS(null));

    // Search
    document.getElementById('btn-search').addEventListener('click', doSearch);
    document.getElementById('doc-search').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    document.getElementById('btn-clear-search').addEventListener('click', () => {
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('btn-clear-search').style.display = 'none';
        document.getElementById('doc-search').value = '';
    });

    // Voice Tab
    const micBtn = document.getElementById('main-mic-btn');
    micBtn.addEventListener('click', toggleMic);
    document.getElementById('btn-send-cmd').addEventListener('click', () => {
        const input = document.getElementById('cmd-input');
        if (input.value.trim()) { dispatchCommand(input.value.trim()); input.value = ''; }
    });
    document.getElementById('cmd-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.value.trim()) { dispatchCommand(e.target.value.trim()); e.target.value = ''; }
    });
    document.getElementById('quick-actions').addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            const cmd = e.target.dataset.cmd;
            if (cmd === 'read page') playTTS(docState.label + '. ' + docState.text);
            else if (cmd === 'stop') playTTS(null);
            else if (cmd) dispatchCommand(cmd);
        }
    });

    // Chat Tab
    document.getElementById('chat-empty-state').addEventListener('click', e => {
        if (e.target.classList.contains('chip')) {
            askAI(e.target.dataset.query);
        }
    });
    document.getElementById('btn-send-chat').addEventListener('click', sendChat);
    document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

    // Bookmarks
    document.getElementById('btn-add-bookmark').addEventListener('click', addBookmark);

    // Global shortcut
    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.key === 'm') {
            e.preventDefault();
            toggleMic();
        }
    });
});

function switchTab(tabId) {
    tabs.forEach(t => t.classList.remove('active'));
    tabBtns.forEach(b => b.classList.remove('active'));
    document.getElementById(tabId + '-tab').classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
}

// ----------------------------------------------------
// UI Updaters
// ----------------------------------------------------
function updateDocUI() {
    if (!docState.loaded) return;

    document.getElementById('drop-zone').style.display = 'none';
    document.getElementById('doc-panel').style.display = 'block';
    document.getElementById('file-name').innerText = docState.title;
    document.getElementById('curr-page').innerText = docState.page + 1;
    document.getElementById('total-pages').innerText = docState.total;
    document.getElementById('goto-input').max = docState.total;
    document.getElementById('goto-input').value = docState.page + 1;

    document.getElementById('reader-page-indicator').innerText = `Page ${docState.page + 1} of ${docState.total}`;
    document.getElementById('reader-badge').innerText = docState.ext;
    document.getElementById('doc-label').innerText = docState.label;
    document.getElementById('doc-text').innerText = docState.text;

    document.getElementById('chat-empty-state').style.display = chatHistory.length === 0 ? 'flex' : 'none';
    document.getElementById('chat-input').disabled = false;
    document.getElementById('btn-send-chat').disabled = false;
}

function renderBookmarks() {
    const list = document.getElementById('bookmark-list');
    list.innerHTML = '';
    if (!bookmarks.length) {
        list.innerHTML = `<div style="font-size: 0.78rem; color: var(--text-muted); padding: 8px;">No bookmarks yet.</div>`;
        return;
    }
    bookmarks.forEach(b => {
        const li = document.createElement('div');
        li.className = 'bm-item';
        li.style.cssText = 'padding: 8px; border-radius: 6px; background: var(--bg-card); border: 1px solid var(--border); margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;';
        li.innerHTML = `
            <div class="bm-info">
                <span class="bm-page" style="color: var(--blue); margin-right: 8px;">p.${b.page + 1}</span>
                <span class="bm-label" style="font-size: 0.85rem; color: var(--text);">${b.label}</span>
            </div>
            <button class="btn btn-danger btn-sm bm-del" style="padding: 2px 6px; min-width: 0;">×</button>
        `;
        li.onclick = () => navigate('goto', b.page);
        li.querySelector('.bm-del').onclick = (e) => { e.stopPropagation(); removeBookmark(b.page); };
        list.appendChild(li);
    });
}

// ----------------------------------------------------
// Core Functions
// ----------------------------------------------------
async function handleUpload(file) {
    if (!file) return;
    showStatus('Uploading...', 'info');
    document.getElementById('upload-text').innerText = 'Loading...';

    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await fetch(API + '/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        const data = await res.json();

        docState = {
            loaded: true,
            page: 0,
            total: data.page_count || 1,
            label: data.label || 'Page 1',
            text: data.text || '',
            title: data.title || file.name,
            ext: data.doc_type || 'doc'
        };
        bookmarks = [];
        renderBookmarks();
        updateDocUI();
        showStatus('✅ Loaded: ' + docState.title, 'ok');
        playTTS('File uploaded successfully. Proceed.');
        switchTab('chat');
    } catch (e) {
        showStatus('❌ ' + e.message, 'error');
        document.getElementById('upload-text').innerText = 'Click or drag PDF / DOCX / EPUB / TXT';
    }
}

async function navigate(action, page = 0) {
    try {
        const data = await apiCall('/navigate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, page })
        });
        docState.page = data.page ?? docState.page;
        docState.total = data.total ?? docState.total;
        docState.label = data.label ?? docState.label;
        docState.text = data.text ?? docState.text;
        updateDocUI();
    } catch (e) { showStatus('❌ ' + e.message, 'error'); }
}

async function addBookmark() {
    try {
        const data = await apiCall('/bookmarks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: docState.page, label: docState.label })
        });
        bookmarks = data.bookmarks;
        renderBookmarks();
        showStatus('🔖 Bookmarked: ' + docState.label, 'ok');
    } catch (e) { showStatus('❌ ' + e.message, 'error'); }
}

async function removeBookmark(page) {
    try {
        const data = await apiCall('/bookmarks/' + page, { method: 'DELETE' });
        bookmarks = data.bookmarks;
        renderBookmarks();
    } catch (e) { }
}

async function doSearch() {
    const q = document.getElementById('doc-search').value.trim();
    if (!q) return;

    showStatus('Searching...', 'info');
    try {
        const data = await apiCall('/search?q=' + encodeURIComponent(q));
        const resBox = document.getElementById('search-results');
        const resList = document.getElementById('search-list');

        resBox.style.display = 'block';
        document.getElementById('btn-clear-search').style.display = 'inline-block';
        document.getElementById('search-count').innerText = `${data.count} Results found`;

        resList.innerHTML = '';
        data.results.slice(0, 8).forEach(r => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 8px 12px; margin-bottom: 6px; background: var(--bg); border-radius: 6px; cursor: pointer; font-size: 0.85rem; color: var(--text-muted); list-style: none;';
            li.innerHTML = `<span style="color: var(--blue); font-weight: 600;">p.${r.page + 1}</span> — ${(r.snippet || '').slice(0, 80)}...`;
            li.onclick = () => navigate('goto', r.page);
            resList.appendChild(li);
        });
        showStatus(data.results.length ? `🔍 ${data.count} result(s)` : 'No results found', data.results.length ? 'ok' : 'warn');
    } catch (e) { showStatus('❌ ' + e.message, 'error'); }
}

function playTTS(text) {
    if (audioInst) { audioInst.pause(); audioInst = null; }
    if (!text) return;

    apiBlob('/tts', { text })
        .then(blob => {
            const url = URL.createObjectURL(blob);
            audioInst = new Audio(url);
            audioInst.play();
        }).catch(e => showStatus('Audio disabled', 'warn'));
}

// ----------------------------------------------------
// Voice Recognition Engine
// ----------------------------------------------------
let recognition = null;
let micState = 'idle';

function toggleMic() {
    if (micState === 'idle') startListening();
    else stopListening();
}

function playBeep(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        if (type === 'start') {
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
        } else {
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
        }
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) { }
}

function updateMicUI() {
    const btn = document.getElementById('main-mic-btn');
    const helper = document.getElementById('mic-helper');
    const icon = document.getElementById('mic-emoji');

    btn.className = 'mic-btn ' + micState;
    if (micState === 'idle') {
        icon.innerText = '🎤';
        helper.innerText = 'Press Ctrl+M or click to start listening';
    } else if (micState === 'active') {
        icon.innerText = '🎙️';
        helper.innerText = '🔴 Listening… speak now';
    } else if (micState === 'loading') {
        icon.innerText = '⏳';
        helper.innerText = '⏳ Processing…';
    }
}

function startListening() {
    if (recognition) { try { recognition.abort(); } catch (e) { } }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showStatus('❌ Browser unsupported.', 'error'); return; }

    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { micState = 'active'; playBeep('start'); updateMicUI(); };
    recognition.onerror = () => { micState = 'idle'; updateMicUI(); };
    recognition.onend = () => { if (micState === 'active') { micState = 'idle'; updateMicUI(); } };

    recognition.onresult = e => {
        let final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript;
        }
        if (final) {
            recognition.stop();
            const lower = final.toLowerCase();
            if (['yes', 'yeah', 'no', 'cancel', 'stop', 'proceed'].includes(lower.trim().replace('.', ''))) return;

            if (document.querySelector('.tab-btn[data-tab="chat"]').classList.contains('active') ||
                lower.startsWith('ask ') || lower.startsWith('what ') || lower.startsWith('how ') ||
                lower.startsWith('why ') || lower.startsWith('summarize') || lower.startsWith('summarise')) {
                let q = final;
                if (q.toLowerCase().startsWith('ask ')) q = q.substring(4);
                switchTab('chat');
                askManual(q);
            } else {
                dispatchCommand(final);
            }
        }
    };
    recognition.start();
}

function stopListening() {
    if (recognition) recognition.stop();
    micState = 'idle';
    playBeep('stop');
    updateMicUI();
}

async function dispatchCommand(text) {
    micState = 'loading';
    updateMicUI();
    showStatus(`🎙️ "${text}"`, 'info');

    try {
        const data = await apiCall('/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        micState = 'idle';
        updateMicUI();

        if (data.action === 'read') playTTS(data.tts_text);
        else if (data.action === 'speak') playTTS(data.tts_text || data.message);
        else if (data.action === 'navigate') {
            docState.page = data.page ?? docState.page;
            docState.total = data.total ?? docState.total;
            docState.label = data.label ?? docState.label;
            docState.text = data.text ?? docState.text;
            updateDocUI();
            if (data.tts_text) playTTS(data.tts_text);
        } else if (data.action === 'stop') playTTS(null);
        else if (data.action === 'error') { showStatus('❌ ' + data.message, 'error'); playTTS(data.message); }
        else if (data.action === 'stream_answer') { switchTab('chat'); askManual(data.question); }
        else if (data.action === 'open_file_dialog') playTTS(data.tts_text);

    } catch (e) {
        micState = 'idle'; updateMicUI();
        showStatus('❌ ' + e.message, 'error');
    }
}

// ----------------------------------------------------
// Chat & AI Engine
// ----------------------------------------------------
let chatHistory = [];

function sendChat() {
    const input = document.getElementById('chat-input');
    const q = input.value.trim();
    if (q) { askManual(q); input.value = ''; }
}

function appendChatUI(role, text) {
    const box = document.getElementById('chat-messages');

    // remove empty state
    const empty = document.getElementById('chat-empty-state');
    if (empty) empty.style.display = 'none';

    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = `
        margin-bottom: 16px; display: flex;
        justify-content: ${role === 'user' ? 'flex-end' : 'flex-start'};
    `;

    const inner = document.createElement('div');
    inner.className = 'chat-bubble'; // to let CSS reference if needed
    inner.style.cssText = `
        max-width: 85%; padding: 10px 14px;
        border-radius: ${role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};
        background: ${role === 'user' ? 'var(--blue)' : 'var(--bg-card)'};
        color: ${role === 'user' ? '#fff' : 'var(--text)'};
        border: ${role === 'user' ? 'none' : '1px solid var(--border)'};
        line-height: 1.5; font-size: 0.92rem;
        white-space: pre-wrap;
    `;

    if (role === 'system') inner.innerHTML = `<strong style="color:var(--orange)">🤖 System: </strong>`;
    const txtNode = document.createTextNode(text);
    inner.appendChild(txtNode);

    if (role === 'assistant') {
        const btn = document.createElement('button');
        btn.className = 'btn btn-ghost btn-sm';
        btn.style.cssText = 'padding: 2px 6px; font-size: 0.8rem; margin-top: 8px; display:block;';
        btn.innerText = '🔊 Read';
        btn.onclick = () => playTTS(text);
        inner.appendChild(btn);
    }

    msgDiv.appendChild(inner);
    box.appendChild(msgDiv);
    box.scrollTop = box.scrollHeight;

    return txtNode; // we can stream directly into this node
}

async function askManual(q) {
    if (!q) return;
    switchTab('chat');

    document.getElementById('btn-send-chat').disabled = true;

    appendChatUI('user', q);
    const assistantTxtNode = appendChatUI('assistant', '...');

    chatHistory.push({ role: 'user', content: q });
    const apiHistory = chatHistory.slice(-6); // pass recent history

    try {
        const res = await fetch(API + '/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: q, history: apiHistory })
        });

        if (!res.ok) throw new Error('Streaming failed');

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";

        let spokenTextLength = 0;
        let ttsQueue = Promise.resolve();

        assistantTxtNode.textContent = ''; // clear loading dots

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                const remainingText = fullText.slice(spokenTextLength).trim();
                if (remainingText.length > 0) {
                    const audioBlobPromise = apiBlob('/tts', { text: remainingText }).then(blob => URL.createObjectURL(blob)).catch(() => null);
                    ttsQueue = ttsQueue.then(async () => {
                        const url = await audioBlobPromise;
                        if (!url) return;
                        return new Promise(resolve => {
                            if (audioInst) audioInst.pause();
                            audioInst = new Audio(url);
                            audioInst.onended = resolve;
                            audioInst.onerror = resolve;
                            audioInst.play().catch(resolve);
                        });
                    });
                }
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            assistantTxtNode.textContent = fullText;
            document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;

            const newTextPart = fullText.slice(spokenTextLength);
            const match = newTextPart.match(/[^.!?]+[.!?]+/);
            if (match) {
                const sentenceToSpeak = match[0].trim();
                spokenTextLength += match.index + match[0].length;
                if (sentenceToSpeak.length > 0) {
                    const audioBlobPromise = apiBlob('/tts', { text: sentenceToSpeak }).then(blob => URL.createObjectURL(blob)).catch(() => null);
                    ttsQueue = ttsQueue.then(async () => {
                        const url = await audioBlobPromise;
                        if (!url) return;
                        return new Promise(resolve => {
                            if (audioInst) audioInst.pause();
                            audioInst = new Audio(url);
                            audioInst.onended = resolve;
                            audioInst.onerror = resolve;
                            audioInst.play().catch(resolve);
                        });
                    });
                }
            }
        }

        chatHistory.push({ role: 'assistant', content: fullText });
        showStatus('✅ Answer ready!', 'ok');
    } catch (e) {
        showStatus('❌ ' + e.message, 'error');
        appendChatUI('system', e.message);
    }

    document.getElementById('btn-send-chat').disabled = false;
}
