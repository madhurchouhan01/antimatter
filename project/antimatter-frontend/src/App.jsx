// src/App.jsx
import React, { useEffect } from 'react';
import TopBar from './components/layout/TopBar';
import Sidebar from './components/layout/Sidebar';
import MonacoEditorWrapper from './components/editor/MonacoEditorWrapper';
import TerminalPanel from './components/layout/TerminalPanel';
import AIPanel from './components/ai/AIPanel';
import { useAppStore } from './store/useAppStore';

function App() {
  const { 
    terminalOpen, 
    saveCurrentFileToDisk,
    sidebarWidth, setSidebarWidth,
    aiPanelWidth, setAiPanelWidth,
    terminalHeight, setTerminalHeight
  } = useAppStore();

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

  const handleDragSidebar = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (moveEvent) => setSidebarWidth(Math.max(150, Math.min(startWidth + (moveEvent.clientX - startX), 600)));
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleDragAIPanel = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = aiPanelWidth;
    const onMouseMove = (moveEvent) => setAiPanelWidth(Math.max(200, Math.min(startWidth - (moveEvent.clientX - startX), 800)));
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleDragTerminal = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminalHeight;
    const onMouseMove = (moveEvent) => setTerminalHeight(Math.max(100, Math.min(startHeight - (moveEvent.clientY - startY), window.innerHeight * 0.8)));
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="app-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar />
      <div className="main-workout-area" style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Sidebar />
        
        <div 
          onMouseDown={handleDragSidebar}
          style={{ width: '4px', cursor: 'col-resize', backgroundColor: 'transparent', zIndex: 10, transition: 'background-color 0.2s', marginLeft: '-2px', marginRight: '-2px' }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        />

        <div className="editor-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <MonacoEditorWrapper />
          
          {terminalOpen && (
            <div 
              onMouseDown={handleDragTerminal}
              style={{ height: '4px', cursor: 'row-resize', backgroundColor: 'transparent', zIndex: 10, transition: 'background-color 0.2s', marginTop: '-2px', marginBottom: '-2px' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            />
          )}

          {terminalOpen && <TerminalPanel />}
        </div>

        <div 
          onMouseDown={handleDragAIPanel}
          style={{ width: '4px', cursor: 'col-resize', backgroundColor: 'transparent', zIndex: 10, transition: 'background-color 0.2s', marginLeft: '-2px', marginRight: '-2px' }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'var(--accent)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        />

        <AIPanel />
      </div>
    </div>
  );
}

export default App;