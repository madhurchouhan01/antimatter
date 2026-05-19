import React from 'react';
import Editor from '@monaco-editor/react';
import { useAppStore } from '../../store/useAppStore';
import EditorTabs from './EditorTabs';

export default function MonacoEditorWrapper() {
  const { files, activeFile, updateFileContent } = useAppStore();

  const handleEditorChange = (value) => {
    if (activeFile) {
      updateFileContent(activeFile, value);
    }
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
        <div className="editor-empty-state" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text3)' }}>
          <h3>⚛ AntiMatter — No File Selected</h3>
        </div>
      )}
    </div>
  );
}