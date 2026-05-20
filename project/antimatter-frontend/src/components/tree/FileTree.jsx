import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

const getFileIcon = (name) => {
  const ext = name.split('.').pop().toLowerCase();
  const icons = { py: '🐍', js: '🟨', ts: '🔷', jsx: '⚛', tsx: '⚛', html: '🌐', css: '🎨', json: '📋', md: '📝' };
  return icons[ext] || '📄';
};

const TreeNode = ({ node, path, level, activeFile, openFile }) => {
  const [isOpen, setIsOpen] = useState(true);
  const isFile = node === null;
  const isActive = path === activeFile;

  if (isFile) {
    const name = path.split(/[/\\]/).pop();
    return (
      <div
        onClick={() => openFile(path)}
        style={{
          padding: `6px 14px 6px ${14 + level * 12}px`,
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
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </div>
    );
  }

  // Directory node
  const name = path ? path.split(/[/\\]/).pop() : '';
  const entries = Object.keys(node).sort((a, b) => {
    // Sort directories first
    const aIsDir = node[a] !== null;
    const bIsDir = node[b] !== null;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.localeCompare(b);
  });

  return (
    <div>
      {path && (
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            padding: `6px 14px 6px ${14 + level * 12}px`,
            fontFamily: 'var(--font-ui)',
            fontSize: 11,
            color: 'var(--text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            userSelect: 'none'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg3)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: 10, display: 'inline-block', width: 12, textAlign: 'center', transition: 'transform 0.1s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          <span style={{ color: 'var(--accent)', fontSize: 14 }}>📁</span>
          <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </div>
      )}
      {(!path || isOpen) && (
        <div>
          {entries.map(child => (
            <TreeNode 
              key={child} 
              node={node[child]} 
              path={path ? `${path}/${child}` : child} 
              level={path ? level + 1 : level} 
              activeFile={activeFile} 
              openFile={openFile} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function FileTree() {
  const { files, activeFile, openFile } = useAppStore();
  const fileNames = Object.keys(files);

  if (fileNames.length === 0) {
    return (
      <div style={{ margin: '12px', padding: '16px 12px', textAlign: 'center', backgroundColor: 'var(--bg3)', borderRadius: 8, color: 'var(--text2)', fontSize: 11, fontFamily: 'var(--font-ui)' }}>
        No files open
      </div>
    );
  }

  // Build tree structure
  const root = {};
  fileNames.forEach(path => {
    // Handle both / and \ as separators
    const parts = path.split(/[/\\]/);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = null; // file
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  });

  return (
    <div style={{ paddingBottom: '10px' }}>
      <TreeNode node={root} path="" level={0} activeFile={activeFile} openFile={openFile} />
    </div>
  );
}