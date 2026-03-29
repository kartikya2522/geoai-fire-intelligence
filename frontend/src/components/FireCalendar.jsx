/**
 * FireCalendar.jsx
 * 12-month fire season risk calendar heatmap.
 * Rendered as a 4×3 grid with intensity-coded cells.
 * Fetches /fire-calendar from the FastAPI backend.
 */

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import axios from 'axios';

const API = 'http://localhost:8000';

const RISK_CFG = {
  EXTREME: { color: '#ff3d00', bg: 'rgba(255,61,0,0.18)',  border: 'rgba(255,61,0,0.5)',   glow: '0 0 12px rgba(255,61,0,0.35)',  emoji: '🔥' },
  HIGH:    { color: '#ff5722', bg: 'rgba(255,87,34,0.12)', border: 'rgba(255,87,34,0.4)',  glow: '0 0 8px rgba(255,87,34,0.25)', emoji: '⚠️' },
  MODERATE:{ color: '#ff9800', bg: 'rgba(255,152,0,0.09)', border: 'rgba(255,152,0,0.3)',  glow: 'none',                          emoji: '🌤️' },
  LOW:     { color: '#00bf55', bg: 'rgba(0,191,85,0.06)',  border: 'rgba(0,191,85,0.2)',   glow: 'none',                          emoji: '✅' },
};

function CalCell({ month, delay }) {
  const ref  = useRef(null);
  const cfg  = RISK_CFG[month.risk_label] || RISK_CFG.LOW;
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current,
      { opacity: 0, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.4)', delay }
    );
  }, []);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '14px 10px',
        borderRadius: 'var(--radius-md)',
        background: hover ? cfg.bg.replace('0.18','0.28').replace('0.12','0.2').replace('0.09','0.15').replace('0.06','0.1') : cfg.bg,
        border: `1px solid ${cfg.border}`,
        boxShadow: hover ? cfg.glow : 'none',
        cursor: 'default',
        transition: 'all 0.2s',
        opacity: 0,
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Month abbr */}
      <div style={{
        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
        color: cfg.color, letterSpacing: '0.06em', textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        {cfg.emoji} {month.abbr}
      </div>

      {/* Risk score ring */}
      <div style={{
        fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)',
        color: '#fff', lineHeight: 1, marginBottom: 4,
      }}>
        {Math.round(month.risk_score)}
      </div>

      {/* Risk label */}
      <div style={{
        fontSize: 9, fontFamily: 'var(--font-display)', fontWeight: 600,
        color: cfg.color, letterSpacing: '0.05em', textTransform: 'uppercase',
        marginBottom: hover ? 6 : 0,
        transition: 'margin 0.2s',
      }}>
        {month.risk_label}
      </div>

      {/* Hover detail */}
      <div style={{
        overflow: 'hidden',
        maxHeight: hover ? 80 : 0,
        transition: 'max-height 0.25s ease',
      }}>
        <div style={{ borderTop: `1px solid ${cfg.border}`, paddingTop: 6, marginTop: 4 }}>
          {[
            ['Avg incidents/mo', month.avg_incidents?.toFixed(1)],
            ['Avg acres burned', month.avg_acres?.toLocaleString()],
            ['% HIGH severity', `${month.pct_high}%`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
              <span>{k}</span>
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Intensity bar at bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        height: 3, width: `${month.risk_score}%`,
        background: cfg.color, borderRadius: '0 0 0 var(--radius-md)',
        transition: 'width 0.5s ease',
      }}/>
    </div>
  );
}

export default function FireCalendar() {
  const [calData, setCalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    axios.get(`${API}/fire-calendar`)
      .then(r => { setCalData(r.data); setLoading(false); })
      .catch(() => { setErr('Could not load fire calendar. Is the API running?'); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
      <span className="spinner" style={{ width: 18, height: 18 }}/>
      Computing fire season calendar…
    </div>
  );

  if (err) return (
    <div style={{ padding: 20, color: 'var(--ember-400)', fontSize: 13 }}>{err}</div>
  );

  if (!calData) return null;

  const { months, peak_month, fire_season } = calData;

  return (
    <div>
      {/* Legend + meta strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
        flexWrap: 'wrap', justifyContent: 'space-between',
      }}>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {Object.entries(RISK_CFG).map(([label, cfg]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.color }}/>
              <span style={{ color: 'var(--text-muted)' }}>{cfg.emoji} {label.charAt(0) + label.slice(1).toLowerCase()}</span>
            </div>
          ))}
        </div>

        {/* Fire season pill */}
        {fire_season?.length > 0 && (
          <div style={{
            fontSize: 10, color: '#ff5722',
            background: 'rgba(255,87,34,0.08)',
            border: '1px solid rgba(255,87,34,0.25)',
            borderRadius: 12, padding: '3px 10px',
            fontFamily: 'var(--font-display)', fontWeight: 600,
          }}>
            🔥 Fire Season: {fire_season[0]} – {fire_season[fire_season.length - 1]}
          </div>
        )}
      </div>

      {/* 4×3 grid (Jan–Dec) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 10,
      }}>
        {(months || []).map((m, i) => (
          <CalCell key={m.month} month={m} delay={i * 0.05} />
        ))}
      </div>

      {/* Peak month callout */}
      {peak_month && (
        <div style={{
          marginTop: 16, padding: '12px 16px',
          background: 'rgba(255,61,0,0.06)',
          border: '1px solid rgba(255,61,0,0.2)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 700, color: '#ff3d00', marginBottom: 2 }}>
              Peak Fire Month: {peak_month}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Historical data shows {peak_month} has the highest composite risk score. Ensure maximum resource pre-positioning before this month.
            </div>
          </div>
        </div>
      )}

      {/* Score key */}
      <div style={{
        marginTop: 12, fontSize: 10, color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span>Score 0–100 =</span>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'linear-gradient(90deg,#00bf55,#ff9800,#ff5722,#ff3d00)' }}/>
        <span>Low → Extreme risk</span>
        <span style={{ marginLeft: 12 }}>· Hover cells for detail</span>
      </div>
    </div>
  );
}
