import { useState, useRef, useEffect, Component } from 'react'

// ══════════════════════════════════════════════════════════
//  ERROR BOUNDARY — shows the error instead of blank screen
// ══════════════════════════════════════════════════════════
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, color: '#f85149', fontFamily: 'monospace', background: '#0d1117', minHeight: '100vh' }}>
        <h2>⚠️ App Error</h2>
        <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: '#e6edf3' }}>
          {String(this.state.error)}
        </pre>
        <button style={{ marginTop: 16, padding: '8px 18px', cursor: 'pointer' }}
          onClick={() => this.setState({ error: null })}>🔄 Retry</button>
      </div>
    )
    return this.props.children
  }
}

const API = '/api'

function useStatus() {
  const [status, setStatus] = useState({ msg: '', type: 'idle' })
  const show = (msg, type = 'info') => setStatus({ msg, type })
  return [status, show]
}


// ── tiny helper: call backend ──────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(API + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

async function apiBlob(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('TTS failed')
  return res.blob()
}

// ══════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════
function Sidebar({ docState, setDocState, bookmarks, setBookmarks, apiReady, onStatus, onSpeak, setActiveTab }) {
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [jumping, setJumping] = useState(docState.page + 1)

  async function handleUpload(file) {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    setUploading(true)
    try {
      const data = await fetch(API + '/upload', { method: 'POST', body: fd })
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.detail) }); return r.json() })
      setDocState({
        loaded: true, page: 0,
        total: data.page_count ?? 1,
        label: data.label ?? 'Page 1',
        text: data.text ?? '',
        title: data.title ?? file.name,
        ext: data.doc_type ?? 'doc',
      })
      setJumping(1)
      setBookmarks([])
      onStatus('✅ Loaded: ' + (data.title ?? file.name), 'ok')
      onSpeak('File uploaded successfully. Proceed.')
      setActiveTab('chat')
    } catch (e) {
      onStatus('❌ ' + e.message, 'error')
    } finally { setUploading(false) }
  }

  async function navigate(action, page = 0) {
    try {
      const data = await api('/navigate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, page }) })
      setDocState(s => ({
        ...s,
        page: data.page ?? s.page,
        total: data.total ?? s.total,
        label: data.label ?? s.label,
        text: data.text ?? s.text,
      }))
      setJumping((data.page ?? 0) + 1)
    } catch (e) { onStatus('❌ ' + e.message, 'error') }
  }

  async function addBookmark() {
    try {
      const data = await api('/bookmarks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: docState.page, label: docState.label }) })
      setBookmarks(data.bookmarks)
      onStatus('🔖 Bookmarked: ' + docState.label, 'ok')
    } catch (e) { onStatus('❌ ' + e.message, 'error') }
  }

  async function removeBookmark(page) {
    try {
      const data = await api('/bookmarks/' + page, { method: 'DELETE' })
      setBookmarks(data.bookmarks)
    } catch { /* ignore */ }
  }

  async function jumpToBookmark(page) {
    await navigate('goto', page)
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <h2>🔊 VoiceRead</h2>
        <p>AI Reading Assistant</p>
      </div>

      {/* API status */}
      <div className="sidebar-section">
        <div className={`api-badge ${apiReady ? 'ok' : 'warn'}`}>
          {apiReady ? '✅ Groq AI Ready' : '⚠️ API key not set in .env'}
        </div>
      </div>

      {/* File upload */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">📂 Open Document</div>
        <div
          className="drop-zone"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag') }}
          onDragLeave={e => e.currentTarget.classList.remove('drag')}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('drag'); handleUpload(e.dataTransfer.files[0]) }}
        >
          <div className="dz-icon">{uploading ? '⏳' : '📄'}</div>
          <div className="dz-text">{uploading ? 'Loading…' : 'Click or drag PDF / DOCX / EPUB / TXT'}</div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.epub,.txt" onChange={e => handleUpload(e.target.files[0])} />
        </div>
      </div>

      {/* Doc info / navigation */}
      {docState.loaded && (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-title">📑 Document</div>
            <div className="doc-info">
              <div className="doc-info-title">{docState.title}</div>
              <div className="doc-info-meta">{docState.ext} · {docState.total} pages</div>
            </div>
            <div className="metrics">
              <div className="metric-pill"><div className="val">{docState.page + 1}</div><div className="lbl">Page</div></div>
              <div className="metric-pill"><div className="val">{docState.total}</div><div className="lbl">Total</div></div>
            </div>

            <div className="nav-row mb-8">
              <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => navigate('prev')}>◀ Prev</button>
              <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => navigate('next')}>Next ▶</button>
            </div>

            <div className="row mb-8">
              <input type="number" min={1} max={docState.total} value={jumping}
                onChange={e => setJumping(parseInt(e.target.value) || 1)}
                style={{ width: '70px', flexShrink: 0 }}
              />
              <button className="btn btn-primary btn-sm btn-full"
                onClick={() => navigate('goto', jumping - 1)}>
                Go →
              </button>
            </div>
          </div>

          {/* Bookmarks */}
          <div className="sidebar-section" style={{ flex: 1 }}>
            <div className="row-sb mb-8">
              <div className="sidebar-section-title">🔖 Bookmarks</div>
              <button className="btn btn-ghost btn-sm" onClick={addBookmark}>+ Add</button>
            </div>
            {bookmarks.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No bookmarks yet.</div>}
            {bookmarks.map(b => (
              <div key={b.page} className="bm-item" onClick={() => jumpToBookmark(b.page)}>
                <div className="bm-info">
                  <span className="bm-page">p.{b.page + 1}</span>
                  <span className="bm-label">{b.label}</span>
                </div>
                <button className="btn btn-danger btn-sm bm-del" onClick={e => { e.stopPropagation(); removeBookmark(b.page) }}>×</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--border2)', textAlign: 'center' }}>HackxAmrita 2.0 · VoiceRead</div>
      </div>
    </aside>
  )
}

// ══════════════════════════════════════════════════════════
//  DOCUMENT TAB
// ══════════════════════════════════════════════════════════
function DocumentTab({ docState, setDocState, onStatus, onSpeak }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  async function doSearch() {
    if (!search.trim()) return
    setSearching(true)
    try {
      const data = await api('/search?q=' + encodeURIComponent(search))
      setResults(data.results)
      if (data.results.length) {
        onStatus(`🔍 ${data.count} result(s) for "${search}"`, 'ok')
      } else {
        onStatus(`No results for "${search}"`, 'warn')
      }
    } catch (e) { onStatus('❌ ' + e.message, 'error') }
    setSearching(false)
  }

  async function jumpToResult(page) {
    try {
      const data = await api('/navigate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'goto', page }) })
      setDocState(s => ({ ...s, page: data.page, total: data.total, label: data.label, text: data.text }))
    } catch { /* */ }
  }

  if (!docState.loaded) {
    return (
      <div className="empty-state">
        <div className="es-icon">📂</div>
        <h3>No Document Loaded</h3>
        <p>Upload a PDF, DOCX, EPUB, or TXT from the sidebar.</p>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar */}
      <div className="document-search-bar inset-3d-soft" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.8rem', padding: '0.5rem' }}>
        <input type="text" placeholder="Search in document..." value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={doSearch} disabled={searching} style={{ minWidth: '100px' }}>
          {searching ? <span className="spinner" /> : 'Search'}
        </button>
        {results.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setResults([])}>Clear</button>}
      </div>

      {/* Search results */}
      {results.length > 0 && (
        <div id="search-results" className="search-results-card card-3d">
          <div className="results-header">3 Results found</div>
          <ul className="results-list" style={{ listStyle: 'none', padding: 0 }}>
            {results.slice(0, 8).map((r, i) => (
              <li key={i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}
                onClick={() => jumpToResult(r.page)}>
                <span style={{ color: 'var(--blue)', fontWeight: 600, marginRight: '10px' }}>p.{r.page + 1}</span> {(r.snippet ?? '').slice(0, 80)}…
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Reader Content */}
      <div className="reader-area card-3d" id="reader-view">
        <div className="reader-header">
          <span className="page-indicator">Page {docState.page + 1} of {docState.total}</span>
          <span className="file-badge">{docState.ext.toUpperCase()}</span>
        </div>
        <div className="reader-content">
          <p>{docState.text}</p>
        </div>
        <div className="reader-actions">
          <button className="btn btn-success" onClick={() => onSpeak(docState.label + '. ' + docState.text)}>Read Aloud</button>
          <button className="btn btn-ghost" onClick={() => onSpeak(null)}>Stop</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  CHAT TAB
// ══════════════════════════════════════════════════════════
function ChatTab({ docState, apiReady, onStatus, onSpeak, chatHistory, setChatHistory, aiLoading, askManual, pendingConfirmation, setPendingConfirmation }) {
  const [question, setQuestion] = useState('')
  const chatEndRef = useRef(null)

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  async function askAI(q) {
    const q_ = (q || question).trim()
    if (!q_) return
    setQuestion('')
    askManual(q_)
  }

  const SUGGESTIONS = ['What is the main topic?', 'Summarize key points', 'What conclusions are drawn?', 'Who are the key people?']

  if (!apiReady) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔑</div>
        <h3>Groq API Key Required</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Add to your <code>.env</code> file:</p>
        <div style={{ background: 'var(--bg3)', fontFamily: 'JetBrains Mono, monospace', padding: '12px 20px', borderRadius: 8, marginTop: 12, color: 'var(--orange)', display: 'inline-block' }}>
          GROQ_API_KEY=your_key_here
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.88rem' }}>
          Get a free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a>
        </p>
      </div>
    )
  }

  if (!docState.loaded) {
    return <div className="alert alert-warn">📂 Upload a document first to start chatting.</div>
  }

  return (
    <div id="chat-tab" className="tab-content active" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Chat History */}
      <div className="chat-history scrollable" id="chat-messages" style={{ flex: 1, overflowY: 'auto', paddingRight: 8, marginBottom: 16 }}>
        {chatHistory.length === 0 && (
          <div className="chat-empty" style={{ marginTop: 40, textAlign: 'center' }}>
            <div className="empty-icon-style" style={{ fontSize: '3rem', marginBottom: 20 }}>💬</div>
            <h3>AI Reading Assistant</h3>
            <p style={{ color: 'var(--text-muted)' }}>Ask questions or ask for a summary using your voice.</p>
            <div className="suggestion-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 24 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} className="chip" onClick={() => askAI(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {chatHistory.map((msg, idx) => (
          <div key={idx} style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
          }}>
            <div className={`message ${msg.role === 'user' ? 'user' : 'ai'}`}>
              {msg.role === 'system' && <strong style={{ color: 'var(--orange)' }}>🤖 System: </strong>}
              {msg.content}
              {msg.role === 'assistant' && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => onSpeak(msg.content)}>🔊 Read Aloud</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {aiLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <div className="message ai">
              <span className="spinner" style={{ width: 14, height: 14, marginRight: 8, borderTopColor: 'var(--accent-blue)' }}></span> Thinking...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area inset-3d-soft" style={{ marginTop: 'auto' }}>
        <input type="text" placeholder="Ask about the document..." id="chat-input"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && askAI()}
          style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '10px 15px', outline: 'none', width: '100%' }}
          disabled={aiLoading}
        />
        <button className="btn btn-primary" onClick={() => askAI()} disabled={aiLoading || !question.trim()}>
          {aiLoading ? <span className="spinner" style={{ width: 16, height: 16, borderTopColor: 'white' }} /> : 'Send'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  VOICE TAB
// ══════════════════════════════════════════════════════════
function VoiceTab({ docState, setDocState, setBookmarks, apiReady, onStatus, onSpeak, micState, startListening, stopListening, dispatchCommand }) {
  const [typedCmd, setTypedCmd] = useState('')

  const QUICK = [
    { label: '▶️ Read Page', fn: () => docState.loaded && onSpeak(docState.label + '. ' + docState.text) },
    { label: '⏹️ Stop', fn: () => onSpeak(null) },
    { label: '✨ Summarize', fn: () => dispatchCommand('summarize') },
    { label: '◀ Prev', fn: () => dispatchCommand('previous page') },
    { label: '▶ Next', fn: () => dispatchCommand('next page') },
    { label: '🔖 Bookmark', fn: () => dispatchCommand('bookmark this') },
    { label: '↩ Go BM', fn: () => dispatchCommand('go to bookmark') },
    { label: '❓ Help', fn: () => dispatchCommand('help') },
  ]

  return (
    <div id="voice-tab" className="tab-content active" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Mic center */}
      <div className="mic-center card-3d">
        <button
          className={`mic-btn ${micState === 'active' ? 'active' : 'idle'}`} id="main-mic-btn"
          onClick={micState === 'idle' ? startListening : stopListening}
          disabled={micState === 'loading'}
        >
          <div className="mic-icon-visual" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem',
            opacity: micState === 'loading' ? 0.5 : 1
          }}>
            {micState === 'active' ? '🎙️' : micState === 'loading' ? '⏳' : '🎤'}
          </div>
        </button>
        <p className="helper-text">
          {micState === 'idle' && 'Press Ctrl+M or click to start listening'}
          {micState === 'active' && 'Listening... speak your command'}
          {micState === 'loading' && 'Processing audio...'}
        </p>
      </div>

      {/* Quick actions */}
      <div className="quick-actions-grid" style={{ marginTop: '30px' }}>
        {QUICK.slice(0, 4).map((q, i) => (
          <button key={i} className="btn btn-secondary" onClick={q.fn}>{q.label}</button>
        ))}
      </div>
      <div className="quick-actions-grid" style={{ marginTop: '15px' }}>
        {QUICK.slice(4, 8).map((q, i) => (
          <button key={i} className="btn btn-secondary" onClick={q.fn}>{q.label}</button>
        ))}
      </div>

      {/* Type a command */}
      <div className="card-3d" style={{ marginTop: 'auto', padding: '20px' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px' }}>⌨️ Or type a voice command directly:</p>
        <div className="document-search-bar inset-3d-soft" style={{ display: 'flex', gap: '10px', padding: '5px' }}>
          <input type="text" placeholder='e.g. "summarize" or "next page"'
            value={typedCmd} onChange={e => setTypedCmd(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && typedCmd.trim()) { dispatchCommand(typedCmd.trim()); setTypedCmd('') } }}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', padding: '10px 15px', outline: 'none', width: '100%' }}
          />
          <button className="btn btn-primary" onClick={() => { if (typedCmd.trim()) { dispatchCommand(typedCmd.trim()); setTypedCmd('') } }}>Run</button>
        </div>

        {!docState.loaded && <div className="info-banner card-3d-mini" style={{ marginTop: '15px' }}><p>📂 Upload a document from the sidebar to use most commands.</p></div>}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  COMMANDS TAB
// ══════════════════════════════════════════════════════════
function CommandsTab() {
  const groups = [
    {
      cat: '📖 Reading', cmds: [
        ['"read document" / "read page"', 'Reads current page aloud'],
        ['"stop" / "pause"', 'Stops audio immediately'],
      ]
    },
    {
      cat: '✨ AI', cmds: [
        ['"summarize"', 'Medium AI summary'],
        ['"brief summary"', 'Short 2-3 sentence summary'],
        ['"summarize in detail"', '3-5 paragraph detailed summary'],
        ['"summarize chapter 3"', 'AI summary of chapter 3'],
        ['"ask what is the main topic"', 'AI Q&A on document'],
        ['"explain the conclusion"', 'Natural question to AI'],
      ]
    },
    {
      cat: '🗂️ Navigation', cmds: [
        ['"next page" / "forward"', 'Go to next page'],
        ['"previous page" / "go back"', 'Go to previous page'],
        ['"go to page 5"', 'Jump to page 5'],
        ['"first page" / "beginning"', 'Jump to first page'],
        ['"last page" / "end"', 'Jump to last page'],
      ]
    },
    {
      cat: '🔖 Bookmarks', cmds: [
        ['"bookmark this" / "save bookmark"', 'Save current position'],
        ['"go to bookmark"', 'Return to last saved bookmark'],
        ['"remove bookmark"', 'Remove bookmark from current page'],
      ]
    },
    {
      cat: '❓ Help', cmds: [
        ['"help"', 'Reads all commands aloud'],
      ]
    },
  ]

  return (
    <div id="commands-tab" className="tab-content active" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="info-banner card-3d-mini" style={{ marginBottom: '20px' }}>
        <p>🎙️ Speak commands after clicking the mic (Ctrl+M), or type them in the Voice tab.</p>
      </div>

      <div className="commands-table-container card-3d" style={{ padding: '0' }}>
        <table className="commands-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '15px 20px', color: 'var(--text-muted)' }}>Category / Command</th>
              <th style={{ textAlign: 'left', padding: '15px 20px', color: 'var(--text-muted)' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, grpIdx) => (
              <React.Fragment key={g.cat}>
                <tr>
                  <td colSpan="2" style={{ padding: '10px 20px', background: 'var(--bg-card)', color: 'var(--accent-blue)', fontWeight: 600, borderTop: grpIdx > 0 ? '1px solid var(--border-soft)' : 'none' }}>
                    {g.cat}
                  </td>
                </tr>
                {g.cmds.map(([key, desc], cmdIdx) => (
                  <tr key={`${g.cat}-${cmdIdx}`} style={{ borderTop: '1px solid var(--border-soft)' }}>
                    <td style={{ padding: '12px 20px', color: 'var(--text-primary)' }}><code>{key}</code></td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>{desc}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-3d" style={{ marginTop: '20px', padding: '20px' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '15px', color: 'var(--accent-blue)' }}>💡 Tips</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {[
            '🔑 Put GROQ_API_KEY in .env — auto-loads on backend start.',
            '🎙️ Voice uses your browser built-in Web Speech API (works in Chrome & Edge).',
            '⌨️ Press Ctrl+M to toggle the microphone from anywhere in the app.',
            '🗣️ Speak commands and see real-time transcription on screen.',
            '📚 Supported formats: PDF, DOCX/DOC, EPUB, TXT',
            '🔍 Full-text search in Document tab.',
            '🔖 Bookmarks persist between sessions (saved in data/ folder).',
          ].map((tip, i) => (
            <li key={i} style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '8px', paddingLeft: '15px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: 'var(--accent-blue)' }}>•</span> {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  APP ROOT
// ══════════════════════════════════════════════════════════
const TABS = [
  { id: 'doc', label: '📄 Document' },
  { id: 'chat', label: '💬 Chat' },
  { id: 'voice', label: '🎙️ Voice' },
  { id: 'commands', label: '📖 Commands' },
]

function AppInner() {
  const [activeTab, setActiveTab] = useState('doc')
  const [docState, setDocState] = useState({ loaded: false, page: 0, total: 0, label: '', text: '', title: '', ext: '' })
  const [bookmarks, setBookmarks] = useState([])
  const [apiReady, setApiReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [status, setStatus] = useStatus()

  // Chat/AI State
  const [chatHistory, setChatHistory] = useState([])
  const [aiLoading, setAiLoading] = useState(false)

  const audioRef = useRef(null)

  // Check API status on load
  useEffect(() => {
    api('/status').then(d => setApiReady(d.api_ready)).catch(() => { })
  }, [])

  const [micState, setMicState] = useState('idle')   // idle | active | loading
  const [liveTranscript, setLiveTranscript] = useState('')
  const recognitionRef = useRef(null)

  function playBeep(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      if (type === 'start') {
        osc.frequency.setValueAtTime(600, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1)
      } else {
        osc.frequency.setValueAtTime(1200, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1)
      }
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
    } catch (e) { /* ignore web audio errors */ }
  }

  function startListening() {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch (e) { }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      showStatus('❌ Speech Recognition not supported. Use Chrome/Edge.', 'error')
      return
    }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = true // Real-time feedback
    rec.maxAlternatives = 1
    recognitionRef.current = rec

    rec.onstart = () => {
      setLiveTranscript('')
      setMicState('active')
      playBeep('start')
    }
    rec.onerror = (e) => {
      setMicState('idle')
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        showStatus('❌ Mic error: ' + e.error, 'error')
      }
    }
    rec.onend = () => { setMicState('idle'); setLiveTranscript('') }
    rec.onresult = e => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLiveTranscript(final || interim)

      if (final) {
        rec.stop()

        // --- VOICE DECISION TREE ---
        const textLower = final.toLowerCase()

        // Ignore stray confirmation words that leaked into a new listening session
        if (['yes', 'yeah', 'no', 'cancel', 'stop', 'proceed'].includes(textLower.trim().replace('.', ''))) {
          return
        }

        // If it sounds like a chat question, go to chat workflow, otherwise dispatch command
        if (activeTab === 'chat' || textLower.startsWith('ask ') || textLower.startsWith('what ') || textLower.startsWith('how ') || textLower.startsWith('why ') || textLower.startsWith('summarize') || textLower.startsWith('summarise')) {
          let question = final
          if (question.toLowerCase().startsWith('ask ')) question = question.substring(4)

          // Switch to chat tab
          setActiveTab('chat')

          // Directly ask the manual question
          askManual(question)
        } else {
          // Document navigation commands
          dispatchCommand(final)
        }
      }
    }
    rec.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setMicState('idle')
    setLiveTranscript('')
    playBeep('stop')
  }

  // Update askManual to stream to ChatHistory
  async function askManual(q) {
    if (!q) return
    setActiveTab('chat')
    setAiLoading(true)

    // Create placeholders
    setChatHistory(prev => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }])

    try {
      // Create request history from existing chatHistory (everything up to this point)
      // Exclude system messages
      const apiHistory = chatHistory.filter(m => m.role === 'user' || m.role === 'assistant')

      const res = await fetch(API + '/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: apiHistory })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Streaming failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let fullText = ""

      // For progressive TTS
      let spokenTextLength = 0
      let ttsQueue = Promise.resolve()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          // Speak any remaining text that wasn't caught by sentence boundaries
          const remainingText = fullText.slice(spokenTextLength).trim()
          if (remainingText.length > 0) {
            const audioBlobPromise = apiBlob('/tts', { text: remainingText }).then(blob => URL.createObjectURL(blob)).catch(() => null)
            ttsQueue = ttsQueue.then(async () => {
              const url = await audioBlobPromise
              if (!url) return
              return new Promise(resolve => {
                if (audioRef.current) audioRef.current.pause()
                const audio = new Audio(url)
                audioRef.current = audio
                audio.onended = resolve
                audio.onerror = resolve
                audio.play().catch(resolve)
              })
            })
          }
          break
        }
        const chunk = decoder.decode(value, { stream: true })
        fullText += chunk

        // Look for sentence boundaries to play chunked audio without waiting for the whole response
        const newTextPart = fullText.slice(spokenTextLength)
        const match = newTextPart.match(/[^.!?]+[.!?]+/)
        if (match) {
          const sentenceToSpeak = match[0].trim()
          spokenTextLength += match.index + match[0].length

          if (sentenceToSpeak.length > 0) {
            const audioBlobPromise = apiBlob('/tts', { text: sentenceToSpeak }).then(blob => URL.createObjectURL(blob)).catch(() => null)
            ttsQueue = ttsQueue.then(async () => {
              const url = await audioBlobPromise
              if (!url) return
              return new Promise(resolve => {
                if (audioRef.current) audioRef.current.pause()
                const audio = new Audio(url)
                audioRef.current = audio
                audio.onended = resolve
                audio.onerror = resolve
                audio.play().catch(resolve)
              })
            })
          }
        }

        // Update the last assistant message in history
        setChatHistory(prev => {
          const newArr = [...prev]
          newArr[newArr.length - 1].content = fullText
          return newArr
        })
      }

      showStatus(`✅ Answer ready!`, 'ok')
    } catch (e) {
      showStatus('❌ ' + e.message, 'error')
      setChatHistory(prev => [...prev, { role: 'system', content: `Error: ${e.message}` }])
    }
    setAiLoading(false)
  }

  // Update summarize flow to use chat flow
  function summarizeManual(length, chapter) {
    let q = `Please summarize the document`
    if (chapter) q += ` chapter ${chapter}`
    if (length) q += ` in ${length} detail`
    askManual(q)
  }

  async function dispatchCommand(text) {
    setMicState('loading')
    showStatus(`🎙️ "${text}"`, 'info')
    try {
      const data = await api('/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      if (!data) {
        setMicState('idle')
        return
      }
      if (data.action === 'file_loaded') {
        setDocState({
          loaded: true, page: data.page, total: data.total,
          label: data.label, text: data.text, title: data.title, ext: data.ext
        })
        setActiveTab('doc')
      } else if (data.page !== undefined) {
        setDocState(s => ({ ...s, page: data.page, total: data.total, label: data.label, text: data.text }))
      }
      if (data.bookmarks) setBookmarks(data.bookmarks)
      if (data.tts_text) handleSpeak(data.tts_text)
      if (data.message) showStatus(data.message, data.action === 'error' ? 'error' : 'ok')
      if (data.action === 'stop') handleSpeak(null)
      if (data.action === 'stream_summary') summarizeManual(data.length, null)
      if (data.action === 'stream_answer') askManual(data.question)
      if (data.action === 'open_file_dialog') {
        const fileInput = document.querySelector('input[type="file"]')
        if (fileInput) fileInput.click()
      }
    } catch (e) { showStatus('❌ ' + e.message, 'error') }
    setMicState('idle')
  }

  // Ctrl+M global shortcut
  useEffect(() => {
    function handleKeyDown(e) {
      // Toggle mic with Ctrl+M
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setMicState(prev => {
          if (prev === 'idle') {
            startListening()
            return 'active'
          } else if (prev === 'active') {
            stopListening()
            return 'idle'
          }
          return prev
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function showStatus(msg, type = 'info') { setStatus(msg, type) }

  function handleSpeak(text) {
    return new Promise(async (resolve, reject) => {
      if (!text) {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
        resolve()
        return
      }
      try {
        const blob = await apiBlob('/tts', { text })
        const url = URL.createObjectURL(blob)
        if (audioRef.current) audioRef.current.pause()
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => resolve()
        audio.onerror = (e) => reject(e)
        audio.play()
      } catch (e) {
        showStatus('❌ TTS error: ' + e.message, 'error')
        resolve() // resolve anyway to avoid hanging
      }
    })
  }

  useEffect(() => {
    function onInteract() {
      if (!started) {
        setStarted(true)
        handleSpeak("Welcome to Voice Read. Please upload a document to begin.")
      }
    }
    if (!started) {
      window.addEventListener('keydown', onInteract)
      window.addEventListener('pointerdown', onInteract)
    }
    return () => {
      window.removeEventListener('keydown', onInteract)
      window.removeEventListener('pointerdown', onInteract)
    }
  }, [started])

  const sharedProps = { docState, setDocState, bookmarks, setBookmarks, apiReady, onStatus: showStatus, onSpeak: handleSpeak, micState, startListening, stopListening, dispatchCommand, setActiveTab }
  const chatProps = { chatHistory, setChatHistory, aiLoading, askManual }

  if (!started) {
    return (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '50px 40px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          <h1 style={{ fontSize: '3rem', marginBottom: '20px' }}>🔊 VoiceRead</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>Press any key on your keyboard to start</p>
        </div>
      </div>
    )
  }

  return (
    <div id="app-shell" className="view active">
      {micState !== 'idle' && (
        <div id="voice-hud" className="hud-container" style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          <div className="hud-pill card-3d pulsing" style={{ padding: '15px 30px', borderRadius: '50px', display: 'flex', gap: '15px', alignItems: 'center' }}>
            {micState === 'active' ? <div className="mic-active" style={{ width: 16, height: 16, background: 'var(--accent-blue)', borderRadius: '50%' }}></div> : <span className="spinner" style={{ width: 16, height: 16, borderTopColor: 'var(--accent-blue)' }}></span>}
            <div style={{ flex: 1 }}>
              <span className="hud-status" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
                {micState === 'active' ? 'Listening...' : 'Processing...'}
              </span>
              {liveTranscript && <span id="transcription" className="hud-transcription" style={{ color: 'var(--text-primary)', marginLeft: 10 }}>{liveTranscript}</span>}
            </div>
          </div>
        </div>
      )}

      <Sidebar {...sharedProps} />

      <main className="main-container">
        {/* Header */}
        <header className="top-header">
          <div className="header-titles">
            <h1>VoiceRead</h1>
            <p>AI Reading Assistant for Visually Impaired Learners</p>
          </div>
          <nav className="tab-nav inset-3d-soft">
            {TABS.map(t => (
              <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {/* Content */}
        <section className="content-area" style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'doc' && <div className="tab-content active"><DocumentTab {...sharedProps} /></div>}
          {activeTab === 'chat' && <div className="tab-content active"><ChatTab {...sharedProps} {...chatProps} /></div>}
          {activeTab === 'voice' && <div className="tab-content active"><VoiceTab {...sharedProps} /></div>}
          {activeTab === 'commands' && <div className="tab-content active"><CommandsTab /></div>}
        </section>

        {/* Status bar */}
        <footer className="status-bar">
          <span className={`status-dot ${status.type === 'ok' ? 'green' : 'red'}`} style={{ backgroundColor: status.type === 'ok' ? 'var(--accent-green)' : 'var(--accent-red)' }} />
          <span className="status-text" style={{ color: 'var(--text-muted)' }}>
            {status.msg || 'Ready — upload a document to get started'}
          </span>
        </footer>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  )
}
