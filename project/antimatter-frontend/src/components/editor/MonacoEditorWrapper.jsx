import React, { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useAppStore } from '../../store/useAppStore';
import EditorTabs from './EditorTabs';

export default function MonacoEditorWrapper() {
  const { 
    files, 
    activeFile, 
    updateFileContent,
    setFiles,
    openFile,
    setTerminalOpen,
    sendTerminalCommand 
  } = useAppStore();

  const folderInputRef = useRef(null);
  const [showClonePrompt, setShowClonePrompt] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [repoBranch, setRepoBranch] = useState('');

  const handleEditorChange = (value) => {
    if (activeFile) {
      updateFileContent(activeFile, value);
    }
  };

  const handleFolderUpload = (event) => {
    const fileInputs = Array.from(event.target.files);
    const updatedFiles = { ...files };

    fileInputs.forEach((file) => {
      const path = file.webkitRelativePath || file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        updatedFiles[path] = e.target.result;
        setFiles(updatedFiles);
        if (fileInputs.indexOf(file) === 0) {
          openFile(path);
        }
      };
      reader.readAsText(file);
    });
  };

  const executeClone = () => {
    if (!repoUrl) return;
    setTerminalOpen(true);
    if (sendTerminalCommand) {
      const branchFlag = repoBranch ? `-b ${repoBranch} ` : '';
      sendTerminalCommand(`git clone ${branchFlag}${repoUrl}`);
    }
    setShowClonePrompt(false);
    setRepoUrl('');
    setRepoBranch('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <EditorTabs />
      {activeFile ? (
        <Editor
          height="100%"
          theme="vs-dark"
          path={activeFile}
          value={files[activeFile] || ''}
          onChange={handleEditorChange}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 22,
            minimap: { enabled: true },
            wordWrap: 'on',
          }}
        />
      ) : (
        <div className="editor-empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text3)' }}>
          <h3 style={{ marginBottom: 24, fontSize: 24, color: 'var(--text2)', fontWeight: 300, fontFamily: 'var(--font-ui)' }}>⚛ AntiMatter IDE</h3>
          
          <div style={{ display: 'flex', gap: 16 }}>
            <button 
              onClick={() => folderInputRef.current?.click()}
              className="btn primary"
              style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              📂 Open Folder
            </button>
            <input 
              type="file" 
              webkitdirectory="true"
              directory="true"
              ref={folderInputRef} 
              onChange={handleFolderUpload} 
              style={{ display: 'none' }} 
            />

            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowClonePrompt(!showClonePrompt)}
                className="btn"
                style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                ↓ Clone Repository
              </button>

              {showClonePrompt && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: '8px', padding: '16px',
                  background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 100, width: 280
                }}>
                  <input 
                    type="text" 
                    placeholder="Repository URL" 
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && executeClone()}
                    style={{ width: '100%', padding: '8px', background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', borderRadius: 4, fontFamily: 'var(--font-ui)', fontSize: 13 }}
                  />
                  <input 
                    type="text" 
                    placeholder="Branch (optional)" 
                    value={repoBranch}
                    onChange={(e) => setRepoBranch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && executeClone()}
                    style={{ width: '100%', padding: '8px', background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text)', borderRadius: 4, fontFamily: 'var(--font-ui)', fontSize: 13 }}
                  />
                  <button 
                    onClick={executeClone}
                    style={{ padding: '8px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13, marginTop: 4 }}
                  >
                    Clone
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}