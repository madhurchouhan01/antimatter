// src/App.jsx
import React, { useEffect } from 'react';
import TopBar from './components/layout/TopBar';
import Sidebar from './components/layout/Sidebar';
import MonacoEditorWrapper from './components/editor/MonacoEditorWrapper';
import TerminalPanel from './components/layout/TerminalPanel';
import AIPanel from './components/ai/AIPanel';
import { useAppStore } from './store/useAppStore';

function App() {
  const { terminalOpen, saveCurrentFileToDisk } = useAppStore();

  useEffect(() => {
    const handleGlobalHotkeys = (e) => {
      // Capture Ctrl+S or Cmd+S patterns reactively 
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentFileToDisk();
        
        // Show confirmation popup alert layout block helper element visually
        const flashAlert = document.createElement('div');
        flashAlert.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--green);color:#0d0f12;padding:6px 12px;border-radius:4px;font-size:12px;font-weight:600;z-index:99999;font-family:var(--font-mono);';
        flashAlert.innerText = 'Syncing buffer changes down to disk...';
        document.body.appendChild(flashAlert);
        setTimeout(() => flashAlert.remove(), 1500);
      }
    };

    window.addEventListener('keydown', handleGlobalHotkeys);
    return () => window.removeEventListener('keydown', handleGlobalHotkeys);
  }, [saveCurrentFileToDisk]);

  return (
    <div className="app-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar />
      <div className="main-workout-area" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Sidebar />
        <div className="editor-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <MonacoEditorWrapper />
          {terminalOpen && <TerminalPanel />}
        </div>
        <AIPanel />
      </div>
    </div>
  );
}

export default App;