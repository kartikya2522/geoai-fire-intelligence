import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/*
  Resource recommendations based on NIMS (National Incident Management System)
  Incident Complexity Typing — the actual US federal standard used by CAL FIRE,
  USFS, and all federal/state fire agencies.

  Type 5 / LOW    : Small fire, single operational period
  Type 3 / MEDIUM : Extended attack, multi-agency coordination
  Type 1 / HIGH   : Major incident, unified command, full mobilisation
*/
const NIMS = {
  LOW: {
    complexity:  'Type 5 — Initial Attack',
    source:      'NIMS Incident Complexity Type 5',
    color:       '#00bf55',
    bg:          'rgba(0,191,85,0.08)',
    border:      'rgba(0,191,85,0.25)',
    description: 'Small containable fire. Single operational period. Local resources sufficient.',
    resources: [
      { key: 'Personnel',    icon: '👷', color: '#00bfa5', min: 25,  max: 100, rec: 50  },
      { key: 'Fire Engines', icon: '🚒', color: '#ff5722', min: 5,   max: 15,  rec: 8   },
      { key: 'Helicopters',  icon: '🚁', color: '#ffc107', min: 1,   max: 3,   rec: 1   },
      { key: 'Bulldozers',   icon: '🚜', color: '#a78bfa', min: 0,   max: 2,   rec: 1   },
      { key: 'Water Tenders',icon: '🚰', color: '#38bdf8', min: 1,   max: 4,   rec: 2   },
    ],
  },
  MEDIUM: {
    complexity:  'Type 3 — Extended Attack',
    source:      'NIMS Incident Complexity Type 3',
    color:       '#ffc107',
    bg:          'rgba(255,193,7,0.08)',
    border:      'rgba(255,193,7,0.25)',
    description: 'Growing fire requiring extended attack. Multi-agency coordination. Air support recommended.',
    resources: [
      { key: 'Personnel',    icon: '👷', color: '#00bfa5', min: 100, max: 500, rec: 200 },
      { key: 'Fire Engines', icon: '🚒', color: '#ff5722', min: 15,  max: 50,  rec: 28  },
      { key: 'Helicopters',  icon: '🚁', color: '#ffc107', min: 3,   max: 8,   rec: 5   },
      { key: 'Bulldozers',   icon: '🚜', color: '#a78bfa', min: 2,   max: 6,   rec: 4   },
      { key: 'Water Tenders',icon: '🚰', color: '#38bdf8', min: 4,   max: 12,  rec: 7   },
    ],
  },
  HIGH: {
    complexity:  'Type 1 — Major Incident',
    source:      'NIMS Incident Complexity Type 1',
    color:       '#ff5722',
    bg:          'rgba(255,87,34,0.08)',
    border:      'rgba(255,87,34,0.3)',
    description: 'Critical large-scale fire. Unified command required. Maximum resource mobilisation. Request mutual aid immediately.',
    resources: [
      { key: 'Personnel',    icon: '👷', color: '#00bfa5', min: 500, max: 1000, rec: 700 },
      { key: 'Fire Engines', icon: '🚒', color: '#ff5722', min: 50,  max: 100,  rec: 70  },
      { key: 'Helicopters',  icon: '🚁', color: '#ffc107', min: 8,   max: 20,   rec: 14  },
      { key: 'Bulldozers',   icon: '🚜', color: '#a78bfa', min: 6,   max: 15,   rec: 10  },
      { key: 'Water Tenders',icon: '🚰', color: '#38bdf8', min: 12,  max: 25,   rec: 18  },
    ],
  },
};

function ResourceRow({ label, icon, color, min, max, rec, delay }) {
  const barRef = useRef(null);
  const range  = max - min || 1;
  const pct    = Math.round(((rec - min) / range) * 80 + 10);

  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(barRef.current,
      { width: 0 },
      { width: `${pct}%`, duration: 0.9, ease: 'power2.out', delay }
    );
  }, [rec, pct, delay]);

  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {min}–{max}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color, letterSpacing: '-0.02em' }}>
            {rec.toLocaleString()}
          </span>
        </div>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div ref={barRef} style={{ height: '100%', borderRadius: 3, background: color, opacity: 0.85, width: 0 }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>min {min}</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>max {max}</span>
      </div>
    </div>
  );
}

export default function ResourceRecommendation({ result }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!result || !wrapRef.current) return;
    gsap.fromTo(wrapRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }
    );
  }, [result?.risk_level]);

  if (!result) return null;

  const nims = NIMS[result.risk_level] || NIMS.LOW;

  return (
    <div ref={wrapRef} style={{ opacity: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
            Decision Support
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
            Recommended Deployment
          </div>
        </div>
        <span style={{
          fontSize: 10, padding: '3px 9px', borderRadius: 20,
          background: nims.bg, color: nims.color,
          border: `1px solid ${nims.border}`,
          fontWeight: 600, fontFamily: 'var(--font-display)',
          letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8,
        }}>
          {nims.complexity}
        </span>
      </div>

      {/* Description */}
      <div style={{
        padding: '9px 12px', marginBottom: 14,
        background: nims.bg, border: `1px solid ${nims.border}`,
        borderRadius: 'var(--radius-sm)',
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55,
      }}>
        {nims.description}
      </div>

      {/* Resource rows */}
      {nims.resources.map((r, i) => (
        <ResourceRow key={r.key} {...r} label={r.key} delay={0.05 + i * 0.07} />
      ))}

      {/* Source footnote */}
      <div style={{
        marginTop: 10, fontSize: 10, color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)', lineHeight: 1.5,
        borderTop: '1px solid var(--glass-border)', paddingTop: 8,
      }}>
        {nims.source} · FEMA/DHS National Incident Management System ·
        Final deployment decisions rest with the incident commander
      </div>
    </div>
  );
}
