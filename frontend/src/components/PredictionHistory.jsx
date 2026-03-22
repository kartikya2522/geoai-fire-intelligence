import { useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const RISK_COLOR = { HIGH: '#ff5722', MEDIUM: '#ffc107', LOW: '#00bf55' };
const RISK_BG    = {
  HIGH:   'rgba(255,87,34,0.12)',
  MEDIUM: 'rgba(255,193,7,0.12)',
  LOW:    'rgba(0,191,85,0.12)',
};

function StatCard({ label, value, color }) {
  return (
    <div style={{
      flex: 1, padding: '16px 20px',
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-md)',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: 28, color: color || 'var(--text-primary)',
        letterSpacing: '-0.02em', marginBottom: 4,
      }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        fontFamily: 'var(--font-display)' }}>{label}</div>
    </div>
  );
}

export default function PredictionHistory() {
  const [history, setHistory] = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [histRes, statsRes] = await Promise.all([
        axios.get(`${API}/history?limit=20`),
        axios.get(`${API}/stats`),
      ]);
      setHistory(histRes.data.predictions || []);
      setStats(statsRes.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 24 }}>
      <span className="spinner"/>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading history...</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label="Total Predictions" value={stats.total_predictions} />
          <StatCard label="HIGH Severity"     value={stats.high_count}   color="#ff5722" />
          <StatCard label="MEDIUM Severity"   value={stats.medium_count} color="#ffc107" />
          <StatCard label="LOW Severity"      value={stats.low_count}    color="#00bf55" />
          <StatCard label="Avg Confidence"
            value={`${((stats.average_confidence || 0) * 100).toFixed(1)}%`}
            color="var(--ember-400)" />
        </div>
      )}

      {/* History table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--glass-border)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)' }}>
            Recent Predictions
          </span>
          <button onClick={fetchData} style={{
            background: 'none', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm)', padding: '4px 12px',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12,
            fontFamily: 'var(--font-display)',
          }}>↻ Refresh</button>
        </div>

        {history.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center',
            color: 'var(--text-muted)', fontSize: 13 }}>
            No predictions yet. Run a prediction to see history.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse',
              fontSize: 12, fontFamily: 'var(--font-body)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  {['Time', 'County', 'Lat / Lng', 'Contained', 'Personnel',
                    'Risk Level', 'Confidence', 'Acres Est'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.08em', color: 'var(--text-muted)',
                      fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => {
                  const riskColor = RISK_COLOR[row.risk_level] || '#8892aa';
                  const riskBg    = RISK_BG[row.risk_level]    || 'transparent';
                  const time = new Date(row.timestamp + 'Z')
                    .toLocaleString('en-IN', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    });
                  return (
                    <tr key={row.id} style={{
                      borderBottom: '1px solid var(--glass-border)',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                    }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {time}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        {row.county ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {row.latitude?.toFixed(2)}, {row.longitude?.toFixed(2)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        {row.percent_contained != null ? `${row.percent_contained}%` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                        {row.personnel ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: 20,
                          fontSize: 11, fontWeight: 700,
                          background: riskBg, color: riskColor,
                          fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
                        }}>{row.risk_level}</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {((row.confidence || 0) * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {row.acres_est?.toLocaleString() ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
