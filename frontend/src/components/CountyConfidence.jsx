import { useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function confidenceColor(pct) {
  if (pct >= 90) return { bg: 'rgba(0,191,85,0.15)',  text: '#00bf55' };
  if (pct >= 75) return { bg: 'rgba(0,191,165,0.12)', text: '#00bfa5' };
  if (pct >= 60) return { bg: 'rgba(255,193,7,0.12)', text: '#ffc107' };
  return           { bg: 'rgba(255,87,34,0.12)',  text: '#ff5722' };
}

function riskColor(risk) {
  if (risk === 'HIGH')   return '#ff5722';
  if (risk === 'MEDIUM') return '#ffc107';
  return '#00bf55';
}

export default function CountyConfidence() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy,  setSortBy]  = useState('certainty_pct');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    axios.get(`${API}/county-confidence`)
      .then(r => setData(r.data.counties || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy];
    if (typeof av === 'string') return sortDir === 'desc'
      ? bv.localeCompare(av) : av.localeCompare(bv);
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const SortBtn = ({ col, label }) => (
    <button onClick={() => toggleSort(col)} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: sortBy === col ? 'var(--ember-400)' : 'var(--text-muted)',
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.08em', fontFamily: 'var(--font-display)',
      display: 'flex', alignItems: 'center', gap: 3, padding: 0,
    }}>
      {label} {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
    </button>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24 }}>
      <span className="spinner"/><span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Computing county confidence...
      </span>
    </div>
  );

  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)', marginBottom: 4 }}>
          Model Confidence by County
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Certainty = % of incidents in the dominant risk class. Higher = model more decisive.
          Counties below 60% have mixed fire history — model is less certain there.
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {[
            { label: '≥ 90% — High certainty',   color: '#00bf55' },
            { label: '75–90% — Good certainty',  color: '#00bfa5' },
            { label: '60–75% — Moderate',        color: '#ffc107' },
            { label: '< 60% — Uncertain',        color: '#ff5722' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }}/>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>
                <SortBtn col="county" label="County" />
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>
                <SortBtn col="certainty_pct" label="Confidence" />
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>
                <SortBtn col="dominant_risk" label="Dominant Risk" />
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>
                <SortBtn col="total" label="Incidents" />
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>
                <SortBtn col="high_pct" label="HIGH %" />
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left' }}>Risk Profile</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const conf = confidenceColor(row.certainty_pct);
              return (
                <tr key={row.county_code} style={{
                  borderBottom: '1px solid var(--glass-border)',
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                }}>
                  <td style={{ padding: '9px 14px', color: 'var(--text-primary)',
                    fontWeight: 500 }}>{row.county}</td>

                  {/* Confidence bar */}
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.06)',
                        borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: `${row.certainty_pct}%`, height: '100%',
                          background: conf.text, borderRadius: 3 }}/>
                      </div>
                      <span style={{ fontSize: 11, color: conf.text, fontFamily: 'var(--font-mono)',
                        fontWeight: 600, minWidth: 38 }}>
                        {row.certainty_pct}%
                      </span>
                    </div>
                  </td>

                  <td style={{ padding: '9px 14px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 10,
                      fontWeight: 700, fontFamily: 'var(--font-display)',
                      background: `${riskColor(row.dominant_risk)}18`,
                      color: riskColor(row.dominant_risk),
                    }}>{row.dominant_risk}</span>
                  </td>

                  <td style={{ padding: '9px 14px', color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.total}</td>

                  <td style={{ padding: '9px 14px', color: row.high_pct > 10 ? '#ff5722' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontSize: 11,
                    fontWeight: row.high_pct > 10 ? 600 : 400 }}>
                    {row.high_pct > 0 ? `${row.high_pct}%` : '—'}
                  </td>

                  {/* Stacked bar */}
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', height: 8, width: 90,
                      borderRadius: 4, overflow: 'hidden', gap: 0 }}>
                      {row.low_pct > 0 && <div style={{ width: `${row.low_pct}%`,
                        background: '#00bf55', opacity: 0.8 }}/>}
                      {row.medium_pct > 0 && <div style={{ width: `${row.medium_pct}%`,
                        background: '#ffc107', opacity: 0.8 }}/>}
                      {row.high_pct > 0 && <div style={{ width: `${row.high_pct}%`,
                        background: '#ff5722', opacity: 0.8 }}/>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '10px 16px', fontSize: 10, color: 'var(--text-muted)',
        borderTop: '1px solid var(--glass-border)', fontFamily: 'var(--font-mono)' }}>
        {data.length} counties · Sorted by {sortBy.replace('_', ' ')} {sortDir} · Click column headers to sort
      </div>
    </div>
  );
}
