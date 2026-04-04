import { useNavigate } from 'react-router-dom';

const RISK_CONFIG = {
  LOW:    { color: '#00bf55', bg: 'rgba(0,191,85,0.08)',   border: 'rgba(0,191,85,0.25)',   icon: '✓',  label: 'Low Risk' },
  MEDIUM: { color: '#ffc107', bg: 'rgba(255,193,7,0.08)',  border: 'rgba(255,193,7,0.25)',  icon: '⚠',  label: 'Medium Risk' },
  HIGH:   { color: '#ff5722', bg: 'rgba(255,87,34,0.1)',   border: 'rgba(255,87,34,0.4)',   icon: '🔥', label: 'High Risk' },
};

function ProbBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 11, color, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: color, width: `${value * 100}%`, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }}/>
      </div>
    </div>
  );
}

export default function RiskCard({ result }) {
  const navigate = useNavigate();
  if (!result) return null;

  const cfg = RISK_CONFIG[result.risk_level] || RISK_CONFIG.LOW;

  /* Build map URL from input features */
  const lat  = result.input_features?.Latitude  || 37.5;
  const lng  = result.input_features?.Longitude || -119.5;
  const mapUrl = `/map?lat=${lat}&lng=${lng}&risk=${result.risk_level}&acres=${result.acres_est}&personnel=${result.input_features?.PersonnelInvolved || 0}&engines=${result.input_features?.Engines || 0}&helicopters=${result.input_features?.Helicopters || 0}`;

  return (
    <div className="glass-card animate-fade-up" style={{
      padding: 28,
      border: `1px solid ${cfg.border}`,
      background: cfg.bg,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            Predicted Severity
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, color: cfg.color, letterSpacing: '-0.02em' }}>
              {result.risk_level}
            </div>
            <span style={{ fontSize: 20 }}>{cfg.icon}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Confidence</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: '#fff', letterSpacing: '-0.02em' }}>
            {(result.confidence * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Acres estimate */}
      <div style={{
        padding: '12px 16px', background: 'rgba(255,255,255,0.04)',
        borderRadius: 'var(--radius-sm)', marginBottom: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Estimated Acres Burned</span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: cfg.color, fontSize: 18 }}>
          {result.acres_est.toLocaleString()}{' '}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({result.acres_range})</span>
        </span>
      </div>

      {/* Probability bars */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Class Probabilities
        </div>
        <ProbBar label="Low"    value={result.probabilities?.LOW    ?? 0} color="#00bf55" />
        <ProbBar label="Medium" value={result.probabilities?.MEDIUM ?? 0} color="#ffc107" />
        <ProbBar label="High"   value={result.probabilities?.HIGH   ?? 0} color="#ff5722" />
      </div>

      {/* Message */}
      <div style={{
        padding: '12px 14px', borderLeft: `3px solid ${cfg.color}`,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55,
        marginBottom: 16,
      }}>
        {result.message}
      </div>

      {/* View on Map button */}
      <button
        onClick={() => navigate(mapUrl)}
        style={{
          width: '100%', padding: '11px 16px',
          background: 'transparent',
          border: `1px solid ${cfg.border}`,
          borderRadius: 'var(--radius-sm)',
          color: cfg.color, cursor: 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 600,
          fontSize: 13, letterSpacing: '0.04em',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, transition: 'var(--transition)',
        }}
        onMouseEnter={e => e.currentTarget.style.background = `${cfg.color}12`}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 10c0 0-4 3-4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M4 14l3-4 3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        View Firebreak Zones on Map
      </button>

      {/* Model tag */}
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        Model: {result.model_name} · {result.acres_range} acres
      </div>
    </div>
  );
}
