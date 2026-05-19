import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import OraclePanel from './modes/OraclePanel';
import ForgePanel from './modes/ForgePanel';
import CortexPanel from './modes/CortexPanel';

export default function AIPanel() {
  const { currentMode, setMode, aiPanelWidth } = useAppStore();

  return (
    <div style={{ width: aiPanelWidth, backgroundColor: 'var(--bg2)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
        ⚛ ANTIMATTER CONSOLE
      </div>
      
      {/* Mode Select Tabs */}
      <div className="mode-toggle" style={{ display: 'flex', borderBottom: '1px solid var(--border2)', backgroundColor: 'var(--bg3)' }}>
        {['forge', 'oracle', 'cortex'].map((mode) => (
          <button
            key={mode}
            className={`mode-btn ${currentMode === mode ? 'active' : ''}`}
            onClick={() => setMode(mode)}
            style={{ 
              flex: 1, padding: '10px 0', textTransform: 'uppercase', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: currentMode === mode ? 600 : 400,
              border: 'none', background: 'transparent',
              color: currentMode === mode ? 'var(--text)' : 'var(--text3)',
              borderBottom: currentMode === mode ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Dynamic Content Window Rendering */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {currentMode === 'forge' && <ForgePanel />}
        {currentMode === 'oracle' && <OraclePanel />}
        {currentMode === 'cortex' && <CortexPanel />}
      </div>
    </div>
  );
}