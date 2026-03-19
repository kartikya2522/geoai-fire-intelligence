import { useState, useEffect, useRef, useCallback } from 'react';
import { usePrediction }      from '../hooks/usePrediction';
import AlertBanner            from '../components/AlertBanner';
import RiskCard               from '../components/RiskCard';
import CarbonImpact           from '../components/CarbonImpact';
import FeatureImportance      from '../components/FeatureImportance';
import ResourceRecommendation from '../components/ResourceRecommendation';
import SendAlert              from '../components/SendAlert';
import IncidentReport         from '../components/IncidentReport';
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
];

const RISK_COLOR = { HIGH: '#ff5722', MEDIUM: '#ffc107', LOW: '#00bf55' };
const RISK_BG    = { HIGH: 'rgba(255,87,34,0.08)', MEDIUM: 'rgba(255,193,7,0.07)', LOW: 'rgba(0,191,85,0.07)' };

const SIM_SLIDERS = [
  { key: 'PercentContained',  label: 'Containment %', min: 0,   max: 100,  step: 5,  unit: '%' },
  { key: 'PersonnelInvolved', label: 'Personnel',      min: 0,   max: 1000, step: 10, unit: ''  },
  { key: 'Engines',           label: 'Engines',        min: 0,   max: 150,  step: 1,  unit: ''  },
  { key: 'Helicopters',       label: 'Helicopters',    min: 0,   max: 30,   step: 1,  unit: ''  },
  { key: 'Dozers',            label: 'Bulldozers',     min: 0,   max: 20,   step: 1,  unit: ''  },
];

/* ── What-If Simulator — standalone card ─────────────────────── */
function WhatIfSimulator({ baseResult }) {
  const [simVals,   setSimVals]   = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [simming,   setSimming]   = useState(false);
  const [open,      setOpen]      = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!baseResult?.input_features) return;
    const f = baseResult.input_features;
    setSimVals({
      PercentContained:  f.PercentContained  ?? 50,
      PersonnelInvolved: f.PersonnelInvolved ?? 50,
      Engines:           f.Engines           ?? 10,
      Helicopters:       f.Helicopters       ?? 2,
      Dozers:            f.Dozers            ?? 1,
    });
    setSimResult(baseResult);
    setOpen(false);
  }, [baseResult?.risk_level]);

  const runSim = useCallback((vals) => {
    if (!baseResult?.input_features) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSimming(true);
      try {
        const payload = {
          ...baseResult.input_features,
          ...vals,
          County:            parseInt(baseResult.input_features.County),
          MajorIncident:     parseInt(baseResult.input_features.MajorIncident),
          PersonnelInvolved: parseInt(vals.PersonnelInvolved),
          Engines:           parseInt(vals.Engines),
          Helicopters:       parseInt(vals.Helicopters),
          Dozers:            parseInt(vals.Dozers),
          PercentContained:  parseFloat(vals.PercentContained),
        };
        const { data } = await axios.post(`${API}/predict`, payload);
        setSimResult(data);
      } catch { /* silent */ }
      finally { setSimming(false); }
    }, 400);
  }, [baseResult]);

  const handleSlider = (key, val) => {
    const next = { ...simVals, [key]: val };
    setSimVals(next);
    runSim(next);
  };

  if (!baseResult) return null;

  const risk   = simResult?.risk_level || baseResult.risk_level;
  const rColor = RISK_COLOR[risk];
  const rBg    = RISK_BG[risk];
  const changed = simResult && risk !== baseResult.risk_level;

  return (
    <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>

      {/* Header — always visible, click to expand */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '14px 18px',
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: open ? '1px solid var(--glass-border)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15 }}>🔮</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
              What-If Simulator
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Adjust parameters, see risk update live
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {simResult && (
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
              color: rColor, padding: '2px 8px',
              background: rBg, borderRadius: 10,
              border: `1px solid ${rColor}30`,
            }}>
              {risk}
            </span>
          )}
          <span style={{
            fontSize: 16, color: 'var(--text-muted)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s', display: 'inline-block',
          }}>▶</span>
        </div>
      </button>

      {/* Expanded body */}
      {open && simVals && (
        <div style={{ padding: '16px 18px' }}>

          {/* Live badge */}
          <div style={{
            padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--radius-sm)',
            background: rBg, border: `1px solid ${rColor}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'all 0.3s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {simming && <span className="spinner" style={{ width: 12, height: 12 }}/>}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Live Risk</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: rColor, lineHeight: 1 }}>{risk}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Confidence</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: '#fff' }}>
                {simResult ? (simResult.confidence * 100).toFixed(1) + '%' : '—'}
              </div>
            </div>
          </div>

          {/* Risk changed warning */}
          {changed && (
            <div style={{
              padding: '7px 10px', marginBottom: 12,
              background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)',
              borderRadius: 'var(--radius-sm)', fontSize: 11, color: '#ffc107', fontWeight: 500,
            }}>
              ⚠️ Risk changed: <strong>{baseResult.risk_level}</strong> → <strong style={{ color: rColor }}>{risk}</strong>
            </div>
          )}

          {/* Sliders */}
          {SIM_SLIDERS.map(s => (
            <div key={s.key} style={{ marginBottom: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: rColor, fontWeight: 600 }}>
                  {simVals[s.key]}{s.unit}
                </span>
              </div>
              <input type="range"
                min={s.min} max={s.max} step={s.step}
                value={simVals[s.key]}
                onChange={e => handleSlider(s.key, parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: rColor, cursor: 'pointer', transition: 'accent-color 0.3s' }}
              />
            </div>
          ))}

          {/* Probability bars */}
          {simResult?.probabilities && (
            <div style={{ marginTop: 8 }}>
              {[['LOW','#00bf55'],['MEDIUM','#ffc107'],['HIGH','#ff5722']].map(([cls, clr]) => (
                <div key={cls} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cls}</span>
                    <span style={{ fontSize: 11, color: clr, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {((simResult.probabilities[cls] || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, background: clr,
                      width: `${(simResult.probabilities[cls] || 0) * 100}%`,
                      transition: 'width 0.5s ease',
                    }}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--glass-border)', paddingTop: 8 }}>
            Updates every 400ms · base: {baseResult.risk_level}
          </div>
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

        {active === 'impact' && <CarbonImpact result={result} />}
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
        <div className="glass-card" style={{ padding: 28 }}>

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

          {/* Report + Simulator — stacked below form */}
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
              <IncidentReport result={result} />
              <WhatIfSimulator baseResult={result} />
            </div>
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

          {/* What-If Simulator — REMOVED from here, moved below */}

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
    </div>
  );
}
