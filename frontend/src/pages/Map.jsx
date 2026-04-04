import { useSearchParams } from 'react-router-dom';
import WildfireMap from '../components/WildfireMap';

export default function Map() {
  const [searchParams] = useSearchParams();
  const risk  = searchParams.get('risk');
  const acres = searchParams.get('acres');

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

      {/* Map fills remaining height */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <WildfireMap />
      </div>
    </div>
  );
}
