import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../../store/useAppStore';

export default function OraclePanel() {
  const { activeFile, files, backendUrl } = useAppStore();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.1-8b-instant');
  const [webSearch, setWebSearch] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    const userText = inputValue.trim();
    setInputValue('');
    
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setIsStreaming(true);

    try {
      const response = await fetch(`${backendUrl}/oracle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          file_content: activeFile ? files[activeFile] : '',
          filename: activeFile || '',
          model: selectedModel,
          use_web_search: webSearch,
          history: newMessages.slice(-10)
        })
      });

      if (!response.ok) throw new Error('Network error');

      setMessages(prev => [...prev, { role: 'ai', content: '' }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        accumulatedResponse += chunk;

        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = accumulatedResponse;
          return updated;
        });
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', content: `⚠️ Error generation failed: ${err.message}` }]);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflowX: 'hidden' }}>
      {/* Configuration Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>MODEL</span>
          <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}
          >
            <option value="llama-3.1-8b-instant">llama-3.3-70b</option>
            <option value="openai/gpt-oss-120b">openai/gpt-oss-120b</option>
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} style={{ margin: 0 }} />
          Web Search Integration
        </label>
      </div>

      {/* Message Output Viewport */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text3)' }}>
            <div style={{ fontSize: 32 }}>🔮</div>
            <h4 style={{ color: 'var(--text2)', margin: '8px 0' }}>ORACLE CONSOLE</h4>
            <p style={{ fontSize: 12 }}>Ask questions about your open workspace assets.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: msg.role === 'user' ? 'var(--text3)' : 'var(--accent)' }}>
                {msg.role === 'user' ? '● YOU' : '🔮 ORACLE'}
              </span>
              <div style={{ 
                padding: '10px 12px', 
                borderRadius: 8, 
                fontSize: 13, 
                lineHeight: 1.6,
                background: msg.role === 'user' ? 'var(--bg3)' : 'rgba(79, 156, 249, 0.06)',
                border: msg.role === 'user' ? '1px solid var(--border)' : '1px solid rgba(79, 156, 249, 0.15)',
                color: 'var(--text)',
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isStreaming && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Tray */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, display: 'flex', flexDirection: 'column' }}>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            placeholder="Ask anything..."
            rows={2}
            style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: 'var(--text)', padding: 10, fontSize: 13 }}
          />
          <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>↵ send</span>
            <button 
              onClick={handleSendMessage}
              disabled={isStreaming}
              style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--accent2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}