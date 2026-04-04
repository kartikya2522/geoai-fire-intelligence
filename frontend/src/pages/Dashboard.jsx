import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrediction }      from '../hooks/usePrediction';
import AlertBanner            from '../components/AlertBanner';
import RiskCard               from '../components/RiskCard';
import CarbonImpact           from '../components/CarbonImpact';
import FeatureImportance      from '../components/FeatureImportance';
import ResourceRecommendation from '../components/ResourceRecommendation';
import SendAlert              from '../components/SendAlert';
import IncidentReport         from '../components/IncidentReport';
import WeatherStrip           from '../components/WeatherStrip';
import ShapWaterfall          from '../components/ShapWaterfall';
import MutualAidRequest       from '../components/MutualAidRequest';
import axios from 'axios';

const API = 'http://localhost:8000';

/* ── Scenario presets ─────────────────────────────────────────── */
const SCENARIOS = {
  custom:    { label: 'Custom Input',           County: 10, Latitude: 37.0, Longitude: -120.0, PercentContained: 50, PersonnelInvolved: 50,  Engines: 10,  Helicopters: 2,  Dozers: 1,  WaterTenders: 3,  MajorIncident: 0 },
  minor:     { label: 'Minor Brush Fire',        County: 15, Latitude: 38.5, Longitude: -121.5, PercentContained: 75, PersonnelInvolved: 25,  Engines: 5,   Helicopters: 1,  Dozers: 0,  WaterTenders: 1,  MajorIncident: 0 },
  moderate:  { label: 'Growing Moderate Fire',   County: 25, Latitude: 36.5, Longitude: -119.5, PercentContained: 30, PersonnelInvolved: 150, Engines: 25,  Helicopters: 5,  Dozers: 3,  WaterTenders: 8,  MajorIncident: 1 },
  critical:  { label: 'Critical Major Incident', County: 35, Latitude: 39.0, Longitude: -122.0, PercentContained: 5,  PersonnelInvolved: 800, Engines: 100, Helicopters: 20, Dozers: 15, WaterTenders: 25, MajorIncident: 1 },
  contained: { label: 'Nearly Contained',        County: 20, Latitude: 37.8, Longitude: -120.8, PercentContained: 95, PersonnelInvolved: 80,  Engines: 10,  Helicopters: 2,  Dozers: 1,  WaterTenders: 4,  MajorIncident: 0 },
};

/* ── Tab definitions — 3 tabs, unchanged ─────────────────────── */
const TABS = [
  { key: 'risk',      label: '🎯 Risk'      },
  { key: 'resources', label: '🚒 Resources'  },
  { key: 'impact',    label: '🌿 Impact'     },
  { key: 'explain',   label: '🧠 Explain'    },
];

const RISK_COLOR = { HIGH: '#ff5722', MEDIUM: '#ffc107', LOW: '#00bf55' };
const RISK_BG    = { HIGH: 'rgba(255,87,34,0.08)', MEDIUM: 'rgba(255,193,7,0.07)', LOW: 'rgba(0,191,85,0.07)' };

/* ── Scenario Comparison — full width in left column ────────────── */
function ScenarioComparison({ baseResult }) {
  const [compVals, setCompVals] = useState(null);
  const [compResult, setCompResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!baseResult?.input_features) return;
    const f = baseResult.input_features;
    setCompVals({
      PercentContained: f.PercentContained ?? 50,
      PersonnelInvolved: f.PersonnelInvolved ?? 50,
      Engines: f.Engines ?? 10,
      Helicopters: f.Helicopters ?? 2,
    });
    setCompResult(null);
  }, [baseResult?.risk_level]);

  const runComparison = async () => {
    if (!baseResult?.input_features || !compVals) return;
    setLoading(true);
    try {
      const payload = {
        ...baseResult.input_features,
        PercentContained: parseFloat(compVals.PercentContained),
        PersonnelInvolved: parseInt(compVals.PersonnelInvolved),
        Engines: parseInt(compVals.Engines),
        Helicopters: parseInt(compVals.Helicopters),
        County: parseInt(baseResult.input_features.County),
        MajorIncident: parseInt(baseResult.input_features.MajorIncident),
        Dozers: parseInt(baseResult.input_features.Dozers),
        WaterTenders: parseInt(baseResult.input_features.WaterTenders),
      };
      const { data } = await axios.post(`${API}/predict`, payload);
      setCompResult(data);
    } catch (err) {
      console.error('Comparison failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!baseResult) return null;

  const renderPredictionCard = (result, label, isPlaceholder = false) => {
    if (isPlaceholder) {
      return (
        <div style={{
          padding: '16px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 220,
          overflow: 'hidden',
          minWidth: 0,
        }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            Run comparison to see result
          </div>
        </div>
      );
    }

    if (!result) return null;
    const risk = result.risk_level;
    const color = RISK_COLOR[risk];
    const bg = RISK_BG[risk];
    return (
      <div style={{
        padding: '16px',
        borderRadius: 'var(--radius-md)',
        background: bg,
        border: `1px solid ${color}30`,
        minHeight: 220,
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}>{label}</div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 28,
          color: color,
          letterSpacing: '-0.02em',
          marginBottom: 10,
        }}>{risk}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Confidence: <strong style={{ color: '#fff' }}>{(result.confidence * 100).toFixed(1)}%</strong>
        </div>
        {/* Probability bars */}
        {result.probabilities && (
          <div style={{ marginTop: 10 }}>
            {[['LOW', '#00bf55'], ['MEDIUM', '#ffc107'], ['HIGH', '#ff5722']].map(([cls, clr]) => (
              <div key={cls} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{cls}</span>
                  <span style={{ fontSize: 10, color: clr, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {((result.probabilities[cls] || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 2,
                    background: clr,
                    width: `${(result.probabilities[cls] || 0) * 100}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const baseRisk = baseResult.risk_level;
  const compRisk = compResult?.risk_level;
  const riskChanged = compResult && baseRisk !== compRisk;

  return (
    <div className="glass-card" style={{ padding: 20, marginTop: 16 }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 14,
        marginBottom: 16,
        paddingBottom: 10,
        borderBottom: '1px solid var(--glass-border)',
      }}>
        🔮 Scenario Comparison
      </div>

      {/* Top section: two cards side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {renderPredictionCard(baseResult, 'CURRENT SCENARIO')}
        {compResult ? renderPredictionCard(compResult, 'MODIFIED SCENARIO') : renderPredictionCard(null, 'MODIFIED SCENARIO', true)}
      </div>

      {/* Status bar between cards */}
      {compResult && (
        <div style={{
          textAlign: 'center',
          padding: '10px',
          marginBottom: 16,
          borderRadius: 'var(--radius-sm)',
          background: riskChanged ? 'rgba(255,193,7,0.08)' : 'rgba(0,191,85,0.08)',
          border: riskChanged ? '1px solid rgba(255,193,7,0.2)' : '1px solid rgba(0,191,85,0.2)',
        }}>
          {riskChanged ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ffc107' }}>
              ⚠️ Risk changed: {baseRisk} → {compRisk}
            </div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#00bf55' }}>
              ✓ No change in risk level
            </div>
          )}
        </div>
      )}

      {/* Bottom section: sliders */}
      {compVals && (
        <div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>Modify Parameters</div>

          {[
            { key: 'PercentContained', label: 'Containment %', min: 0, max: 100, step: 5, unit: '%' },
            { key: 'PersonnelInvolved', label: 'Personnel', min: 0, max: 1000, step: 10, unit: '' },
            { key: 'Engines', label: 'Engines', min: 0, max: 150, step: 1, unit: '' },
            { key: 'Helicopters', label: 'Helicopters', min: 0, max: 30, step: 1, unit: '' },
          ].map(field => (
            <div key={field.key} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{field.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ember-400)', fontWeight: 600 }}>
                  {compVals[field.key]}{field.unit}
                </span>
              </div>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={compVals[field.key]}
                onChange={(e) => setCompVals({ ...compVals, [field.key]: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--ember-500)', cursor: 'pointer' }}
              />
            </div>
          ))}

          <button
            onClick={runComparison}
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
          >
            {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Running...</> : '▶ Run Comparison'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Tabbed result panel — 3 tabs, unchanged ─────────────────── */
function ResultTabs({ result }) {
  const [active, setActive] = useState('risk');
  const COLOR = { HIGH: '#ff5722', MEDIUM: '#ffc107', LOW: '#00bf55' };
  const color  = COLOR[result.risk_level] || 'var(--text-secondary)';

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--glass-border)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)} style={{
            flex: 1, padding: '13px 8px',
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: `2px solid ${active === t.key ? color : 'transparent'}`,
            color: active === t.key ? color : 'var(--text-muted)',
            fontSize: 12, fontWeight: 600,
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.02em',
            transition: 'all 0.18s',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 20 }}>
        {active === 'risk' && (
          <>
            <RiskCard result={result} />
            <SendAlert result={result} />
          </>
        )}

        {active === 'resources' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <FeatureImportance result={result} />
            <div style={{ height: 1, background: 'var(--glass-border)' }}/>
            <ResourceRecommendation result={result} />
          </div>
        )}

        {active === 'impact'   && <CarbonImpact result={result} />}
        {active === 'explain'  && <ShapWaterfall result={result} />}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="input-label">{label}</label>
      {children}
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────── */
export default function Dashboard() {
  const [scenario,  setScenario]  = useState('custom');
  const [form,      setForm]      = useState({ ...SCENARIOS.custom });
  const [dismissed, setDismissed] = useState(false);
  const { result, loading, error, predict, reset } = usePrediction();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const loadScenario = (key) => {
    setScenario(key);
    const { label, ...vals } = SCENARIOS[key];
    setForm(vals);
    reset();
    setDismissed(false);
  };

  const handleSubmit = async () => {
    setDismissed(false);
    await predict({
      ...form,
      County:            parseInt(form.County),
      PersonnelInvolved: parseInt(form.PersonnelInvolved),
      Engines:           parseInt(form.Engines),
      Helicopters:       parseInt(form.Helicopters),
      Dozers:            parseInt(form.Dozers),
      WaterTenders:      parseInt(form.WaterTenders),
      MajorIncident:     parseInt(form.MajorIncident),
      PercentContained:  parseFloat(form.PercentContained),
      Latitude:          parseFloat(form.Latitude),
      Longitude:         parseFloat(form.Longitude),
    });
  };

  const inputNum = (field, min = 0, step = 1) => (
    <input type="number" className="input-field" min={min} step={step}
      value={form[field]} onChange={e => set(field, e.target.value)} />
  );

  return (
    <div className="page-content" style={{ padding: '40px 40px 80px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ember-400)', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 8 }}>
          Prediction Engine
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 38, letterSpacing: '-0.03em', marginBottom: 8 }}>
          Wildfire Severity Predictor
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          Enter incident parameters to receive severity classification, deployment recommendation, and environmental impact.
        </p>
      </div>

      {/* Scenario selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {Object.entries(SCENARIOS).map(([key, val]) => (
          <button key={key} onClick={() => loadScenario(key)} style={{
            padding: '7px 14px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${scenario === key ? 'var(--ember-500)' : 'var(--glass-border)'}`,
            background: scenario === key ? 'var(--ember-glow)' : 'transparent',
            color: scenario === key ? 'var(--ember-400)' : 'var(--text-secondary)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
            transition: 'var(--transition)',
          }}>{val.label}</button>
        ))}
      </div>

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 24, alignItems: 'start' }}>

        {/* ── Left — Form ───────────────────────────────────── */}
        <div className="glass-card" style={{ padding: 28, minWidth: 0, overflow: 'hidden' }}>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--glass-border)' }}>
              📍 Location
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="County Code (0–58)">{inputNum('County', 0)}</Field>
              <Field label="Latitude">{inputNum('Latitude', 32, 0.001)}</Field>
              <Field label="Longitude">{inputNum('Longitude', -125, 0.001)}</Field>
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--glass-border)' }}>
              🔥 Fire Status
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Containment (%)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input type="range" min={0} max={100} step={5}
                    value={form.PercentContained}
                    onChange={e => set('PercentContained', e.target.value)}
                    style={{ accentColor: 'var(--ember-500)', cursor: 'pointer' }}/>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ember-400)' }}>
                    {form.PercentContained}%
                  </span>
                </div>
              </Field>
              <Field label="Major Incident">
                <select className="input-field" value={form.MajorIncident} onChange={e => set('MajorIncident', e.target.value)}>
                  <option value={0}>No</option>
                  <option value={1}>Yes</option>
                </select>
              </Field>
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--glass-border)' }}>
              🚒 Deployed Resources
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <Field label="Personnel">{inputNum('PersonnelInvolved')}</Field>
              <Field label="Engines">{inputNum('Engines')}</Field>
              <Field label="Helicopters">{inputNum('Helicopters')}</Field>
              <Field label="Dozers">{inputNum('Dozers')}</Field>
              <Field label="Water Tenders">{inputNum('WaterTenders')}</Field>
            </div>
          </div>

          <button className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '14px' }}
            onClick={handleSubmit} disabled={loading}>
            {loading ? <><span className="spinner"/>&nbsp;Analysing…</> : '⚡ Predict Severity'}
          </button>

          {error && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(255,87,34,0.08)', border: '1px solid rgba(255,87,34,0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--ember-300)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Weather Strip — shows after prediction */}
          {result && (
            <>
              <WeatherStrip
                lat={parseFloat(form.Latitude)}
                lon={parseFloat(form.Longitude)}
              />
              <ScenarioComparison baseResult={result} />
            </>
          )}
        </div>

        {/* ── Right column ──────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Alert banner */}
          {result && !dismissed && (
            <AlertBanner result={result} onDismiss={() => setDismissed(true)} />
          )}

          {/* Result tabs */}
          {result ? (
            <ResultTabs result={result} />
          ) : (
            <div className="glass-card" style={{
              padding: 40, textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            }}>
              <div style={{ fontSize: 40, opacity: 0.3 }}>🔥</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
                Fill in the incident parameters<br/>and click{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>Predict Severity</strong>
              </div>
            </div>
          )}

          {/* Model info */}
          <div className="glass-card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Model Info
            </div>
            {[
              ['Algorithm',  'Gradient Boosting'],
              ['Accuracy',   '72.3%'],
              ['CV F1 Mean', '82.1%'],
              ['Classes',    'LOW / MEDIUM / HIGH'],
              ['Dataset',    '1,636 CA incidents'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--glass-border)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Operational Documents Section — full width below grid */}
      {result && (
        <div style={{ marginTop: 32 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 20,
            letterSpacing: '-0.02em',
            marginBottom: 18,
            paddingBottom: 10,
            borderBottom: '1px solid var(--glass-border)',
          }}>
            📄 Operational Documents
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <IncidentReport result={result} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <MutualAidRequest result={result} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
