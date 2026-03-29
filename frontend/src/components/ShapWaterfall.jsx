/**
 * ShapWaterfall.jsx
 * Renders a SHAP waterfall chart for a single prediction.
 * Shows which features pushed the model toward or away from its predicted class.
 */

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const FEATURE_LABELS = {
  County:               'County',
  Latitude:             'Latitude',
  Longitude:            'Longitude',
  PercentContained:     'Containment %',
  PersonnelInvolved:    'Personnel',
  Engines:              'Engines',
  Helicopters:          'Helicopters',
  Dozers:               'Dozers',
  WaterTenders:         'Water Tenders',
  MajorIncident:        'Major Incident',
  resource_intensity:   'Resource Intensity',
  suppression_power:    'Suppression Power',
  containment_efficiency: 'Containment Efficiency',
};

function Bar({ item, maxAbs, delay }) {
  const barRef  = useRef(null);
  const isPos   = item.value > 0;
  const color   = isPos ? '#ff5722' : '#60a5fa';
  const pct     = maxAbs > 0 ? Math.abs(item.value) / maxAbs * 100 : 0;

  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(barRef.current,
      { scaleX: 0, transformOrigin: isPos ? 'left center' : 'right center' },
      { scaleX: 1, duration: 0.5, ease: 'power3.out', delay }
    );
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>

      {/* Feature name */}
      <div style={{
        width: 150, fontSize: 11, color: 'var(--text-secondary)',
        textAlign: 'right', flexShrink: 0, lineHeight: 1.3,
        fontFamily: 'var(--font-body)',
      }}>
        {FEATURE_LABELS[item.feature] || item.feature}
      </div>

      {/* Bar + value */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Negative side */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          {!isPos && (
            <div ref={barRef} style={{
              width: `${pct}%`, height: 16, borderRadius: '3px 0 0 3px',
              background: `${color}cc`, border: `1px solid ${color}`,
              minWidth: pct > 0 ? 4 : 0,
            }}/>
          )}
        </div>

        {/* Centre line */}
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }}/>

        {/* Positive side */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
          {isPos && (
            <div ref={barRef} style={{
              width: `${pct}%`, height: 16, borderRadius: '0 3px 3px 0',
              background: `${color}cc`, border: `1px solid ${color}`,
              minWidth: pct > 0 ? 4 : 0,
            }}/>
          )}
        </div>

        {/* SHAP value */}
        <div style={{
          width: 46, fontSize: 10, fontFamily: 'var(--font-mono)',
          color, fontWeight: 700, textAlign: 'left', flexShrink: 0,
        }}>
          {isPos ? '+' : ''}{item.value.toFixed(3)}
        </div>

        {/* Input value */}
        <div style={{
          width: 54, fontSize: 10, fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0,
        }}>
          ={typeof item.input_value === 'number' ? item.input_value.toFixed(2) : item.input_value}
        </div>
      </div>
    </div>
  );
}

export default function ShapWaterfall({ result }) {
  const exp = result?.shap_explanation;

  if (!exp) {
    return (
      <div style={{
        padding: '32px 20px', textAlign: 'center',
        color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7,
      }}>
        <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🧠</div>
        SHAP explanation unavailable.<br/>
        <span style={{ fontSize: 11 }}>Ensure <code>shap</code> is installed and the model supports TreeExplainer.</span>
      </div>
    );
  }

  const { sorted_shap, base_value, predicted_class, probabilities, top_positive, top_negative } = exp;

  // Build combined list with input values
  const inputFeatures = result.input_features || {};
  const allItems = (sorted_shap || []).slice(0, 12).map(s => ({
    ...s,
    input_value: inputFeatures[s.feature] ?? '—',
  }));

  const maxAbs = allItems.length > 0
    ? Math.max(...allItems.map(s => Math.abs(s.value)))
    : 1;

  const riskColor = { HIGH: '#ff5722', MEDIUM: '#ffc107', LOW: '#00bf55' };
  const rc = riskColor[predicted_class] || 'var(--text-secondary)';

  return (
    <div>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18, flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Explaining
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 15, fontFamily: 'var(--font-display)', fontWeight: 800,
              color: rc, letterSpacing: '-0.01em',
            }}>{predicted_class}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>prediction</span>
            {probabilities && (
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)', color: rc,
                background: `${rc}18`, padding: '2px 7px', borderRadius: 10,
                border: `1px solid ${rc}30`,
              }}>
                {((probabilities[predicted_class] || 0) * 100).toFixed(1)}% confidence
              </span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>
            Base Value
          </div>
          <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {typeof base_value === 'number' ? base_value.toFixed(4) : '—'}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 10, color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#ff5722cc' }}/>
          Pushes toward {predicted_class}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#60a5facc' }}/>
          Pushes away from {predicted_class}
        </div>
        <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
          SHAP value / Input
        </div>
      </div>

      {/* Waterfall bars */}
      {allItems.map((item, i) => (
        <Bar key={item.feature} item={item} maxAbs={maxAbs} delay={i * 0.04} />
      ))}

      {/* Summary insight */}
      {(top_positive?.length > 0 || top_negative?.length > 0) && (
        <div style={{
          marginTop: 16, padding: '10px 14px',
          background: 'rgba(255,87,34,0.04)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          <span style={{ color: '#ff5722', fontWeight: 600 }}>Key driver: </span>
          {top_positive?.[0]
            ? `${FEATURE_LABELS[top_positive[0].feature] || top_positive[0].feature} (${top_positive[0].value > 0 ? '+' : ''}${top_positive[0].value.toFixed(3)}) pushes toward ${predicted_class}`
            : 'No dominant positive driver identified'
          }
          {top_negative?.[0] && (
            <span> · <span style={{ color: '#60a5fa' }}>dampened by</span> {FEATURE_LABELS[top_negative[0].feature] || top_negative[0].feature} ({top_negative[0].value.toFixed(3)})</span>
          )}
        </div>
      )}
    </div>
  );
}
