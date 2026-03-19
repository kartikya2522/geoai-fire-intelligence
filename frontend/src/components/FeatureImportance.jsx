import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/* Human-readable labels for feature names */
const LABELS = {
  PercentContained:       { label: 'Containment %',        icon: '🧯', desc: 'How contained the fire is' },
  PersonnelInvolved:      { label: 'Personnel Deployed',   icon: '👷', desc: 'Firefighters on scene' },
  containment_efficiency: { label: 'Containment Efficiency', icon: '⚡', desc: 'Containment per unit of personnel' },
  resource_intensity:     { label: 'Resource Intensity',   icon: '📊', desc: 'Personnel per engine deployed' },
  AcresBurned:            { label: 'Acres Burned',         icon: '🔥', desc: 'Fire size so far' },
  suppression_power:      { label: 'Suppression Power',    icon: '🚁', desc: 'Helicopters + Dozers combined' },
  Engines:                { label: 'Engines',              icon: '🚒', desc: 'Fire engines deployed' },
  Helicopters:            { label: 'Helicopters',          icon: '🚁', desc: 'Aerial assets' },
  Dozers:                 { label: 'Bulldozers',           icon: '🚜', desc: 'Ground clearing assets' },
  WaterTenders:           { label: 'Water Tenders',        icon: '🚰', desc: 'Water supply units' },
  MajorIncident:          { label: 'Major Incident Flag',  icon: '🚨', desc: 'Officially declared major' },
  Latitude:               { label: 'Latitude',             icon: '📍', desc: 'Geographic position' },
  Longitude:              { label: 'Longitude',            icon: '📍', desc: 'Geographic position' },
  County:                 { label: 'County',               icon: '🗺️', desc: 'Location county' },
};

/* Color ramp: top features get warm colors, lower get cool */
function barColor(rank, total) {
  if (rank === 0) return '#ff5722';
  if (rank === 1) return '#ff7043';
  if (rank === 2) return '#ffc107';
  if (rank < total / 2) return '#00bfa5';
  return '#4a5568';
}

export default function FeatureImportance({ result }) {
  const wrapRef = useRef(null);
  const barsRef = useRef([]);

  if (!result?.feature_importances) return null;

  const entries = Object.entries(result.feature_importances)
    .filter(([, v]) => v > 0)
    .slice(0, 7); // top 7 only — cleaner

  const maxVal = entries[0]?.[1] || 1;

  useEffect(() => {
    if (!wrapRef.current || entries.length === 0) return;

    gsap.fromTo(wrapRef.current,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }
    );

    barsRef.current.forEach((bar, i) => {
      if (!bar) return;
      const pct = (entries[i][1] / maxVal) * 100;
      gsap.fromTo(bar,
        { width: 0 },
        { width: `${pct}%`, duration: 0.9, ease: 'power2.out', delay: 0.1 + i * 0.07 }
      );
    });
  }, [result.risk_level]);

  const topFactor   = LABELS[entries[0]?.[0]]?.label || entries[0]?.[0];
  const topPct      = entries[0] ? (entries[0][1] * 100).toFixed(1) : '—';

  return (
    <div ref={wrapRef} style={{ opacity: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          Explainable AI
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>
          What Drove This Prediction
        </div>
      </div>

      {/* Top factor callout */}
      <div style={{
        padding: '10px 14px', marginBottom: 16,
        background: 'rgba(255,87,34,0.08)',
        border: '1px solid rgba(255,87,34,0.2)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5,
      }}>
        <span style={{ color: 'var(--ember-400)', fontWeight: 600 }}>Top signal: </span>
        <strong style={{ color: '#fff' }}>{topFactor}</strong> drove{' '}
        <strong style={{ color: 'var(--ember-300)' }}>{topPct}%</strong> of the model's decision.
        {entries[0]?.[0] === 'PercentContained' || entries[0]?.[0] === 'containment_efficiency'
          ? ' Prioritise containment efforts immediately.'
          : entries[0]?.[0] === 'PersonnelInvolved' || entries[0]?.[0] === 'resource_intensity'
          ? ' Resource deployment levels are the key factor.'
          : ' Focus resources on this factor first.'}
      </div>

      {/* Feature bars */}
      <div style={{ flex: 1 }}>
        {entries.map(([key, val], i) => {
          const meta  = LABELS[key] || { label: key, icon: '📌', desc: '' };
          const pct   = (val * 100).toFixed(1);
          const color = barColor(i, entries.length);

          return (
            <div key={key} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13 }}>{meta.icon}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{meta.label}</span>
                </div>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color, fontWeight: 600,
                }}>{pct}%</span>
              </div>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  ref={el => barsRef.current[i] = el}
                  style={{ height: '100%', borderRadius: 3, background: color, width: 0 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 12, fontSize: 10, color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)', lineHeight: 1.5,
        borderTop: '1px solid var(--glass-border)', paddingTop: 10,
      }}>
        Based on GradientBoosting feature_importances_ · Global model weights,
        not per-prediction SHAP values · Higher % = stronger influence on severity class
      </div>
    </div>
  );
}
