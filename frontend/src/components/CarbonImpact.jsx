import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/*
  Science-backed constants:
  - 1 acre of forest stores ~200 tonnes CO₂ (US Forest Service estimate)
  - 1 acre supports ~150 mature trees on average
  - 1 tree absorbs ~22 kg CO₂/year
  - Average reforestation cost: ~$400 per acre (US average)
  - Average wildfire suppression cost: ~$1,000 per acre (CAL FIRE data)
  - Prevention (early response) cost: ~$50 per acre saved
*/
const CO2_PER_ACRE        = 200;      // tonnes
const TREES_PER_ACRE      = 150;      // count
const KG_CO2_PER_TREE_YR  = 22;       // kg/year per tree
const REFOREST_COST_ACRE  = 400;      // USD per acre
const SUPPRESSION_COST    = 1000;     // USD per acre
const PREVENTION_COST     = 50;       // USD per acre saved (early response)

function formatNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + 'K';
  return Math.round(n).toLocaleString();
}

function formatCost(n) {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(1)     + 'M';
  if (n >= 1_000)         return '$' + (n / 1_000).toFixed(0)         + 'K';
  return '$' + Math.round(n).toLocaleString();
}

/* ── Animated metric tile ─────────────────────────────────────── */
function MetricTile({ icon, label, value, sub, color, delay = 0, tileRef }) {
  return (
    <div ref={tileRef} style={{
      padding: '18px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}28`,
      opacity: 0,
    }}>
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 800,
        fontSize: 26, color, letterSpacing: '-0.03em', lineHeight: 1,
        marginBottom: 4,
      }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

/* ── Prevention vs reforestation bar ─────────────────────────── */
function CostComparisonBar({ preventionCost, reforestCost }) {
  const barRef = useRef(null);
  const total  = reforestCost;
  const prevPct = Math.min((preventionCost / total) * 100, 100);

  useEffect(() => {
    if (!barRef.current) return;
    gsap.fromTo(barRef.current.querySelector('.prev-fill'),
      { width: 0 },
      { width: `${prevPct}%`, duration: 1.2, ease: 'power2.out', delay: 0.4 }
    );
    gsap.fromTo(barRef.current.querySelector('.refo-fill'),
      { width: 0 },
      { width: '100%', duration: 1.4, ease: 'power2.out', delay: 0.2 }
    );
  }, [preventionCost, reforestCost]);

  const ratio = Math.round(reforestCost / preventionCost);

  return (
    <div ref={barRef} style={{ marginTop: 20 }}>
      <div style={{
        fontSize: 11, color: 'var(--text-muted)',
        fontFamily: 'var(--font-display)', letterSpacing: '0.08em',
        textTransform: 'uppercase', marginBottom: 12,
      }}>
        Cost of prevention vs reforestation
      </div>

      {/* Prevention bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Early response (prevention)</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#00bf55', fontWeight: 600 }}>{formatCost(preventionCost)}</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
          <div className="prev-fill" style={{ height: '100%', background: '#00bf55', borderRadius: 4, width: 0 }}/>
        </div>
      </div>

      {/* Reforestation bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Reforestation (after fire)</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ff5722', fontWeight: 600 }}>{formatCost(reforestCost)}</span>
        </div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
          <div className="refo-fill" style={{ height: '100%', background: '#ff5722', borderRadius: 4, width: 0 }}/>
        </div>
      </div>

      {/* Ratio callout */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(255,87,34,0.08)',
        border: '1px solid rgba(255,87,34,0.2)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 28, color: 'var(--ember-400)', lineHeight: 1,
          flexShrink: 0,
        }}>{ratio}×</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Reforestation costs <strong style={{ color: '#fff' }}>{ratio} times more</strong> than
          early fire response. Prevention is not just smarter — it's economically decisive.
        </div>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */
export default function CarbonImpact({ result }) {
  const wrapRef  = useRef(null);
  const tile1    = useRef(null);
  const tile2    = useRef(null);
  const tile3    = useRef(null);
  const tile4    = useRef(null);

  if (!result) return null;

  const acres          = result.acres_est || 500;
  const co2Tonnes      = acres * CO2_PER_ACRE;
  const treesDestroyed = acres * TREES_PER_ACRE;
  const treesNeeded    = Math.round((co2Tonnes * 1000) / KG_CO2_PER_TREE_YR);
  const reforestCost   = acres * REFOREST_COST_ACRE;
  const preventionCost = acres * PREVENTION_COST;
  const suppressCost   = acres * SUPPRESSION_COST;

  // Years to offset if we plant treesDestroyed trees
  const yearsToOffset  = Math.round(co2Tonnes / ((treesDestroyed * KG_CO2_PER_TREE_YR) / 1000));

  useEffect(() => {
    if (!wrapRef.current) return;

    gsap.fromTo(wrapRef.current,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
    );

    [tile1, tile2, tile3, tile4].forEach((ref, i) => {
      if (!ref.current) return;
      gsap.fromTo(ref.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 + i * 0.1 }
      );
    });
  }, [result.risk_level, acres]);

  return (
    <div ref={wrapRef} className="glass-card" style={{ padding: 28, opacity: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
          }}>Environmental Impact</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 18, letterSpacing: '-0.02em',
          }}>Carbon & Ecological Cost</div>
        </div>
        <div style={{
          padding: '5px 12px', borderRadius: 20,
          background: 'rgba(255,87,34,0.1)',
          border: '1px solid rgba(255,87,34,0.25)',
          fontSize: 11, color: 'var(--ember-400)',
          fontFamily: 'var(--font-display)', fontWeight: 600,
          letterSpacing: '0.05em',
        }}>
          {acres.toLocaleString()} acres projected
        </div>
      </div>

      {/* 4 metric tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 6 }}>
        <MetricTile
          tileRef={tile1}
          icon="💨"
          label="CO₂ Released"
          value={formatNum(co2Tonnes) + ' t'}
          sub="tonnes of carbon dioxide"
          color="#ff5722"
          delay={0.1}
        />
        <MetricTile
          tileRef={tile2}
          icon="🌲"
          label="Trees Destroyed"
          value={formatNum(treesDestroyed)}
          sub={`~${TREES_PER_ACRE} trees per acre`}
          color="#e67e22"
          delay={0.2}
        />
        <MetricTile
          tileRef={tile3}
          icon="🌱"
          label="Trees to Replant"
          value={formatNum(treesNeeded)}
          sub={`to offset CO₂ in 1 year`}
          color="#ffc107"
          delay={0.3}
        />
        <MetricTile
          tileRef={tile4}
          icon="⏳"
          label="Recovery Time"
          value={yearsToOffset + ' yrs'}
          sub={`replanting ${formatNum(treesDestroyed)} trees`}
          color="#a78bfa"
          delay={0.4}
        />
      </div>

      {/* Cost comparison */}
      <CostComparisonBar
        preventionCost={preventionCost}
        reforestCost={reforestCost}
      />

      {/* Science footnote */}
      <div style={{
        marginTop: 16,
        fontSize: 10, color: 'var(--text-muted)',
        lineHeight: 1.6, fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--glass-border)', paddingTop: 10,
      }}>
        Estimates based on US Forest Service data · 1 acre ≈ {CO2_PER_ACRE}t CO₂ · {TREES_PER_ACRE} trees/acre · {KG_CO2_PER_TREE_YR}kg CO₂/tree/yr
        · Reforestation ${REFOREST_COST_ACRE}/acre · Prevention ${PREVENTION_COST}/acre
      </div>
    </div>
  );
}
