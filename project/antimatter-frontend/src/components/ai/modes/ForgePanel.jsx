import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';

export default function ForgePanel() {
  const { activeFile, files, backendUrl, updateFileContent } = useAppStore();
  const [prompt, setPrompt] = useState('');
  const [steps, setSteps] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const runInlineForge = async () => {
    if (!prompt.trim() || !activeFile || isProcessing) return;

    setIsProcessing(true);
    setSteps([{ text: 'Analyzing file contents with context...', type: 'step' }]);

    try {
      const response = await fetch(`${backendUrl}/patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: prompt,
          open_filename: activeFile,
          open_file_content: files[activeFile],
          all_files: files,
        })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Patch processing failed');

      setSteps(prev => [...prev, { text: 'Resolving code patches...', type: 'step' }]);

      // Bottom-up application structural alignment strategy
      if (data.results && data.results[0] && data.results[0].patches) {
        let lines = files[activeFile].split('\n');
        const sortedPatches = [...data.results[0].patches].sort((a, b) => b.start_line - a.start_line);

        sortedPatches.forEach(patch => {
          const start = patch.start_line - 1;
          const end = patch.end_line;
          const newLines = patch.replacement.split('\n');
          lines.splice(start, end - start, ...newLines);
        });

        const updatedCode = lines.join('\n');
        updateFileContent(activeFile, updatedCode);
        setSteps(prev => [...prev, { text: 'Patches seamlessly applied directly into active layer!', type: 'done' }]);
        setPrompt('');
      }
    } catch (err) {
      setSteps(prev => [...prev, { text: `⚠️ Optimization failed: ${err.message}`, type: 'warning' }]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Step Processing Stream Viewer */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text3)' }}>
            <div style={{ fontSize: 32 }}>⚡</div>
            <h4 style={{ color: 'var(--text2)', margin: '8px 0' }}>FORGE MOTOR</h4>
            <p style={{ fontSize: 12, padding: '0 20px' }}>Describe your target structural alterations. Edits modify files directly inside the active buffer.</p>
          </div>
        ) : (
          steps.map((step, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: step.type === 'done' ? 'var(--green)' : step.type === 'warning' ? 'var(--red)' : 'var(--text2)' }}>
              <div style={{ 
                width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                background: step.type === 'done' ? 'var(--green)' : step.type === 'warning' ? 'var(--red)' : 'var(--amber)'
              }} />
              <span>{step.text}</span>
            </div>
          ))
        )}
        {isProcessing && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', paddingLeft: 14 }}>Forging edits...</div>}
      </div>

      {/* Input Action Panel */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!activeFile || isProcessing}
          placeholder={activeFile ? "What do you want to change inline?" : "Open a workspace file first..."}
          rows={3}
          style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, color: 'var(--text)', padding: 10, fontSize: 12, outline: 'none', resize: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>↵ apply shifts</span>
          <button 
            onClick={runInlineForge}
            disabled={!prompt.trim() || isProcessing || !activeFile}
            style={{ padding: '4px 12px', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.4)', color: 'var(--amber)', borderRadius: 6, cursor: 'pointer' }}
          >
            ⚡ Apply
          </button>
        </div>
      </div>
    </div>
  );
}