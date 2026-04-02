import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import WildfireMap from '../components/WildfireMap';

export default function Map() {
  const [searchParams] = useSearchParams();
  const risk  = searchParams.get('risk');
  const acres = searchParams.get('acres');

  // Resource tracker state (TASK 4)
  const [resourcePanel, setResourcePanel] = useState(true); // open by default
  const [deployed, setDeployed] = useState({
    personnel: 0,
    engines: 0,
    helicopters: 0,
    dozers: 0,
    waterTenders: 0,
  });

  // NIMS recommended resources based on risk level
  const nimsRecommended = {
    HIGH: { personnel: 700, engines: 70, helicopters: 14, dozers: 10, waterTenders: 18 },
    MEDIUM: { personnel: 200, engines: 28, helicopters: 5, dozers: 4, waterTenders: 7 },
    LOW: { personnel: 50, engines: 8, helicopters: 1, dozers: 1, waterTenders: 2 },
  };

  const recommended = risk ? nimsRecommended[risk] || nimsRecommended.LOW : nimsRecommended.LOW;

  const RISK_COLORS = { HIGH: '#ff5722', MEDIUM: '#ffc107', LOW: '#00bf55' };
  const riskColor   = RISK_COLORS[risk] || 'var(--text-secondary)';

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Header */}
      <div style={{
        padding: '24px 40px 18px',
        borderBottom: '1px solid var(--glass-border)',
        flexShrink: 0,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ember-400)', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 4 }}>
            Geospatial Intelligence
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', marginBottom: 2 }}>
            California Wildfire Map
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            1,636 historical incidents · click any marker for details
            {risk && <> · <span style={{ color: riskColor, fontWeight: 600 }}>{risk} risk zones active</span></>}
          </p>
        </div>

        {/* Active prediction badge */}
        {risk && (
          <div style={{
            padding: '10px 16px', borderRadius: 'var(--radius-md)',
            background: `${riskColor}12`,
            border: `1px solid ${riskColor}30`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor, animation: 'pulse-ember 1.6s infinite' }}/>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: riskColor, fontFamily: 'var(--font-display)' }}>
                Firebreak Zones Active
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {risk} · {acres ? parseInt(acres).toLocaleString() + ' acres est.' : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map fills remaining height — with resource tracker panel */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>
        <div style={{ flex: 1 }}>
          <WildfireMap />
        </div>

        {/* Resource Tracker Panel (TASK 4) */}
        {risk && (
          <div style={{
            width: resourcePanel ? '340px' : '0',
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            background: 'rgba(13,17,23,0.95)',
            borderLeft: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>
                  Resource Tracker
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Deployed vs NIMS {risk}
                </div>
              </div>
              <button onClick={() => setResourcePanel(false)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 18, padding: 4,
              }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* Input fields */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Deployed Resources
                </div>
                {[
                  { key: 'personnel', label: '👷 Personnel', max: 1000 },
                  { key: 'engines', label: '🚒 Fire Engines', max: 150 },
                  { key: 'helicopters', label: '🚁 Helicopters', max: 30 },
                  { key: 'dozers', label: '🚜 Dozers', max: 20 },
                  { key: 'waterTenders', label: '🚰 Water Tenders', max: 30 },
                ].map(r => (
                  <div key={r.key} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                      {r.label}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={r.max}
                      value={deployed[r.key]}
                      onChange={(e) => setDeployed({ ...deployed, [r.key]: parseInt(e.target.value) || 0 })}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Comparison Table */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Comparison
                </div>
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <th style={{ padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'left', fontWeight: 600 }}>Resource</th>
                        <th style={{ padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>Deploy</th>
                        <th style={{ padding: '8px 10px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>NIMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'personnel', label: 'Personnel', rec: recommended.personnel },
                        { key: 'engines', label: 'Engines', rec: recommended.engines },
                        { key: 'helicopters', label: 'Helicopters', rec: recommended.helicopters },
                        { key: 'dozers', label: 'Dozers', rec: recommended.dozers },
                        { key: 'waterTenders', label: 'Water Tenders', rec: recommended.waterTenders },
                      ].map(r => {
                        const dep = deployed[r.key];
                        const gap = r.rec - dep;
                        const status = dep >= r.rec ? 'ok' : 'gap';
                        const bgColor = status === 'ok' ? 'rgba(0,191,85,0.08)' : 'rgba(220,38,38,0.08)';
                        const textColor = status === 'ok' ? '#00bf55' : '#dc2626';
                        return (
                          <tr key={r.key} style={{ borderTop: '1px solid var(--glass-border)', background: bgColor }}>
                            <td style={{ padding: '10px', fontSize: 11, color: 'var(--text-secondary)' }}>{r.label}</td>
                            <td style={{ padding: '10px', fontSize: 13, fontWeight: 700, color: textColor, textAlign: 'center' }}>
                              {dep}
                            </td>
                            <td style={{ padding: '10px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                              {r.rec}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  background: 'rgba(255,193,7,0.08)',
                  border: '1px solid rgba(255,193,7,0.2)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}>
                  💡 <span style={{ color: '#00bf55' }}>Green</span> = adequate resources,
                  <span style={{ color: '#dc2626' }}> Red</span> = shortfall detected
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collapsed panel toggle button */}
        {risk && !resourcePanel && (
          <button
            onClick={() => setResourcePanel(true)}
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(13,17,23,0.95)',
              border: '1px solid var(--glass-border)',
              borderRight: 'none',
              borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
              padding: '12px 8px',
              cursor: 'pointer',
              fontSize: 10,
              color: 'var(--text-secondary)',
              writingMode: 'vertical-rl',
              letterSpacing: '0.08em',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
            }}
          >
            RESOURCES ▶
          </button>
        )}
      </div>
    </div>
  );
}
