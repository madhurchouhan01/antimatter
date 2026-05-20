import React, { useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import FileTree from '../tree/FileTree';

export default function Sidebar() {
  const fileInputRef = useRef(null);
  const { files, setFiles, openFile, sidebarWidth } = useAppStore();

  const handleFileUpload = (event) => {
    const fileInputs = Array.from(event.target.files);
    const updatedFiles = { ...files };

    fileInputs.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        updatedFiles[file.name] = e.target.result;
        setFiles(updatedFiles);
        openFile(file.name); // Automatically open the first uploaded file
      };
      reader.readAsText(file);
    });
  };

  return (
    <div style={{ width: sidebarWidth, backgroundColor: 'var(--bg2)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text3)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
        Explorer
      </div>

      {/* Upload Zone */}
      <label 
        style={{ margin: 12, border: '1px dashed var(--border2)', borderRadius: 8, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', display: 'block' }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border2)'}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          multiple 
          onChange={handleFileUpload} 
          style={{ display: 'none' }} 
        />
        <div style={{ fontSize: 20, marginBottom: 6 }}>📂</div>
        <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
          Drop files or <span style={{ color: 'var(--accent)' }}>browse</span>
        </p>
      </label>

      {/* Scrollable File List Container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <FileTree />
      </div>

      <div style={{ padding: '0 12px 12px', marginTop: 'auto' }}>
        <button 
          className="btn" 
          style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', padding: '6px', background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 5, cursor: 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
        >
          + Open file
        </button>
      </div>
    </div>
  );
}