// src/components/layout/TerminalPanel.jsx
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useAppStore } from '../../store/useAppStore';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPanel() {
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const socketRef = useRef(null);
  
  const { 
    terminalHeight, 
    toggleTerminal, 
    backendUrl, 
    setSandboxSessionId, 
    setFiles,
    setSendTerminalCommand
  } = useAppStore();

  // Keep a mutable reference to the files store so the socket can access it
  // without triggering a complete terminal connection unmount cycle.
  const filesRef = useRef(useAppStore.getState().files);
  useEffect(() => {
    filesRef.current = useAppStore.getState().files;
  });

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize layout dimensions
    const term = new Terminal({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      theme: { background: '#0d0d0d', foreground: '#ffffff', cursor: '#7c6aff' },
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;

    const ws = new WebSocket('ws://localhost:1842/terminal');
    socketRef.current = ws;
    let sseWatcher = null;

    const fetchFreshWorkspaceTree = async (sessionId) => {
      try {
        const res = await fetch(`${backendUrl}/fs/list?session_id=${sessionId}&path=.`);
        const data = await res.json();
        if (data.entries) {
          const fileMatrix = {};
          for (const entry of data.entries) {
            if (entry.type === 'file') {
              const contentRes = await fetch(`${backendUrl}/fs/read?session_id=${sessionId}&path=${encodeURIComponent(entry.path)}`);
              const contentData = await contentRes.json();
              fileMatrix[entry.path] = contentData.content || '';
            }
          }
          setFiles(fileMatrix);
        }
      } catch (e) {
        console.error("Error refreshing file layout mapping tree:", e);
      }
    };

    ws.onopen = () => {
      term.writeln('\x1b[32m⚡ ANTIMATTER Sandbox environment connected...\x1b[0m');
      // Pass file structures via static component ref layer safely
      ws.send(JSON.stringify({ type: 'init', files: filesRef.current }));
      
      setSendTerminalCommand(() => (cmd) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
        }
      });
      
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
        }
      }, 400);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "session_ready") {
          const sid = msg.session_id;
          setSandboxSessionId(sid);
          term.writeln(`\x1b[34m⚛ Watcher active for context container [${sid.slice(0, 8)}]\x1b[0m\r\n`);
          
          fetchFreshWorkspaceTree(sid);

          sseWatcher = new EventSource(`${backendUrl}/fs/watch?session_id=${sid}`);
          sseWatcher.onmessage = (e) => {
            const updateEvent = JSON.parse(e.data);
            if (updateEvent.type === "tree_change") {
              fetchFreshWorkspaceTree(sid);
            }
          };
          return;
        }
      } catch (_) {}
      term.write(event.data);
    };

    const dataListener = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
    });

    ws.onclose = () => {
      term.writeln('\r\n\x1b[31m[Sandbox connection terminated or backend dead]\x1b[0m');
    };

    const handleWindowResize = () => fitAddon.fit();
    window.addEventListener('resize', handleWindowResize);

    // Operational Cleanup Layer 
    return () => {
      setSendTerminalCommand(null);
      dataListener.dispose();
      window.removeEventListener('resize', handleWindowResize);
      if (sseWatcher) sseWatcher.close();
      ws.close();
      term.dispose();
    };
    // CRITICAL FIX: Empty dependency array ensures this connection mounts EXACTLY once on startup
  }, [backendUrl, setFiles, setSandboxSessionId, setSendTerminalCommand]);

  return (
    <div style={{ flex: `0 0 ${terminalHeight}px`, height: terminalHeight, background: '#0d0d0d', borderTop: '2px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 12px', background: '#141414', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: '#888', fontSize: 12, fontFamily: "'JetBrains Mono'" }}>TERMINAL</span>
        <button onClick={toggleTerminal} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
      </div>
      <div ref={terminalRef} style={{ flex: 1, padding: '4px 12px', overflow: 'hidden' }} />
    </div>
  );
}