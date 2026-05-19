// src/components/layout/TopBar.jsx
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';

export default function TopBar() {
  const { 
    activeFile, 
    files, 
    toggleTerminal, 
    backendUrl,
    currentUser,
    setCurrentUser
  } = useAppStore();

  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState('⬡ Index project');

  // Verify Auth State on Mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${backendUrl}/auth/me`, {
  credentials: 'include'
});
        if (res.ok) {
          const user = await res.json();
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
      } catch (e) {
        console.error('Auth verification handshake failed:', e);
        setCurrentUser(null);
      }
    }
    checkAuth();
  }, [backendUrl, setCurrentUser]);

  // Handle Logout Event Action
  const handleLogout = async () => {
    try {
      await fetch(`${backendUrl}/auth/logout`, {
  method: 'POST',
  credentials: 'include'
});
      setCurrentUser(null);
      window.location.reload();
    } catch (e) {
      console.error('Logout request failed:', e);
    }
  };

  const handleIndexProject = async () => {
    if (Object.keys(files).length === 0) {
      alert('Open or upload workspace assets before initializing RAG indexing.');
      return;
    }
    
    setIsIndexing(true);
    setIndexStatus('⬡ Indexing...');

    try {
      const res = await fetch(`${backendUrl}/index-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });
      
      const data = await res.json();
      setIndexStatus(`✓ ${data.chunks_created || 0} chunks`);
      
      setTimeout(() => setIndexStatus('⬡ Index project'), 4000);
    } catch (e) {
      setIndexStatus('⬡ Index project');
      alert(`Indexing pipeline failure: ${e.message}`);
    } finally {
      setIsIndexing(false);
    }
  };

  const displayFileName = activeFile ? activeFile.split('/').pop().split('\\').pop() : '';

  return (
    <div style={{
      height: '44px',
      background: 'var(--bg2)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      justifyContent: 'space-between',
      flexShrink: 0,
      zIndex: 10,
      color: 'var(--text)'
    }}>
      {/* Left section: Branding & Active File Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ 
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--accent)',
          letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
          AntiMatter
        </div>

        {activeFile && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', background: 'var(--bg3)',
            border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            <span>{displayFileName}</span>
          </div>
        )}
      </div>

      {/* Right section: Control Actions and Authentication node */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        
        {/* Conditional Auth Gateway Segment */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4, paddingRight: 12, borderRight: '1px solid var(--border)' }}>
          {!currentUser ? (
            <button 
              onClick={() => window.location.href = `${backendUrl}/auth/github/login`}
              className="btn primary"
              style={{
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, padding: '5px 12px',
                borderRadius: 5, background: 'var(--accent2)', color: '#fff', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              Login with GitHub
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img 
                src={currentUser.avatar_url} 
                alt="Profile avatar"
                style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--border)' }} 
              />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                {currentUser.username}
              </span>
              <button 
                onClick={handleLogout}
                style={{ padding: '2px 6px', fontSize: 10, background: 'var(--bg3)', border: '1px solid var(--border2)', color: 'var(--text2)', borderRadius: 4, cursor: 'pointer' }}
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <button 
          onClick={handleIndexProject}
          disabled={isIndexing}
          className="btn"
          style={{
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, padding: '5px 12px',
            borderRadius: 5, border: '1px solid var(--border2)', background: 'var(--bg3)',
            color: isIndexing ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          {indexStatus}
        </button>

        <button 
          onClick={toggleTerminal}
          className="btn"
          style={{
            fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 500, padding: '5px 12px',
            borderRadius: 5, border: '1px solid var(--border2)', background: 'var(--bg3)',
            color: 'var(--text2)', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          ⌨ Terminal
        </button>
      </div>
    </div>
  );
}