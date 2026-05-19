// src/components/editor/EditorTabs.jsx
import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function EditorTabs() {
  const { openTabs, activeFile, openFile, closeTab } = useAppStore();

  if (openTabs.length === 0) {
    return (
      <div className="editor-tabs-container" style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>NO OPEN FILES</div>
      </div>
    );
  }

  // Helper to pull file emoji matching your original logic
  const getFileIcon = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { py: '🐍', js: '🟨', ts: '🔷', jsx: '⚛', tsx: '⚛', html: '🌐', css: '🎨', json: '📋', md: '📝' };
    return icons[ext] || '📄';
  };

  return (
    <div className="editor-tabs-container" style={{ display: 'flex', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
      <div className="editor-tabs" style={{ height: 36, display: 'flex', alignItems: 'flex-end', padding: '0 12px', gap: 2, overflowX: 'auto', flex: 1 }}>
        {openTabs.map((name) => {
          const isActive = name === activeFile;
          const baseName = name.split('/').pop().split('\\').pop();
          
          return (
            <div 
              key={name}
              className={`tab ${isActive ? 'active' : ''}`}
              onClick={() => openFile(name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: isActive ? 'var(--text)' : 'var(--text2)',
                background: isActive ? 'var(--bg)' : 'transparent',
                border: '1px solid transparent',
                borderColor: isActive ? 'var(--border) var(--border) transparent var(--border)' : 'transparent',
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <span>{getFileIcon(name)}</span>
              {baseName}
              <span 
                className="close" 
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(name);
                }}
                style={{ marginLeft: 4, opacity: isActive ? 0.6 : 0.3, transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => e.target.style.opacity = 1}
                onMouseLeave={(e) => e.target.style.opacity = isActive ? 0.6 : 0.3}
              >
                ✕
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}