import React from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function FileTree() {
  const { files, activeFile, openFile } = useAppStore();
  const fileNames = Object.keys(files);

  const getFileIcon = (name) => {
    const ext = name.split('.').pop().toLowerCase();
    const icons = { py: '🐍', js: '🟨', ts: '🔷', jsx: '⚛', tsx: '⚛', html: '🌐', css: '🎨', json: '📋', md: '📝' };
    return icons[ext] || '📄';
  };

  if (fileNames.length === 0) {
    return (
      <div style={{ margin: '12px', padding: '16px 12px', textAlign: 'center', backgroundColor: 'var(--bg3)', borderRadius: 8, color: 'var(--text2)', fontSize: 11, fontFamily: 'var(--font-ui)' }}>
        No files open
      </div>
    );
  }

  return (
    <div>
      {fileNames.map((name) => {
        const isActive = name === activeFile;
        return (
          <div
            key={name}
            onClick={() => openFile(name)}
            style={{
              padding: '6px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: isActive ? 'var(--accent)' : 'var(--text2)',
              backgroundColor: isActive ? 'var(--bg3)' : 'transparent',
              borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              transition: 'all 0.1s'
            }}
            onMouseEnter={(e) => { if(!isActive) e.currentTarget.style.backgroundColor = 'var(--bg3)'; }}
            onMouseLeave={(e) => { if(!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span>{getFileIcon(name)}</span>
            {name}
          </div>
        );
      })}
    </div>
  );
}