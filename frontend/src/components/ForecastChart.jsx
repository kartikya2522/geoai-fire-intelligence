/**
 * ForecastChart.jsx
 * Time-series forecast of monthly wildfire incident counts.
 * Uses Chart.js Line chart with confidence interval shading.
 * Fetches /forecast from the FastAPI backend.
 */

import { useEffect, useRef, useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  LineElement, PointElement, BarElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import axios from 'axios';

ChartJS.register(
  CategoryScale, LinearScale, LineElement, PointElement,
  BarElement, Tooltip, Legend, Filler,
);

const API = 'http://localhost:8000';

const TREND_BADGE = {
  increasing: { label: '↑ Increasing', color: '#ff5722', bg: 'rgba(255,87,34,0.1)' },
  decreasing: { label: '↓ Decreasing', color: '#00bf55', bg: 'rgba(0,191,85,0.1)'  },
  stable:     { label: '→ Stable',     color: '#ffc107', bg: 'rgba(255,193,7,0.1)'  },
};

export default function ForecastChart() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [tab,     setTab]     = useState('forecast'); // 'forecast' | 'seasonality'

  useEffect(() => {
    axios.get(`${API}/forecast`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => { setErr('Could not load forecast. Is the API running?'); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', fontSize: 13 }}>
      <span className="spinner" style={{ width: 20, height: 20 }}/>
      Loading forecast…
    </div>
  );

  if (err) return (
    <div style={{ padding: 24, color: 'var(--ember-400)', fontSize: 13 }}>{err}</div>
  );

  if (!data) return null;

  const { historical, forecast, seasonality, trend_direction, peak_month, model_type } = data;

  // ── Chart 1: Historical + Forecast line with CI band ────────────────────
  const histLabels = historical.map(h => h.ds.slice(0, 7));
  const fcLabels   = forecast.map(f => f.ds.slice(0, 7));
  const allLabels  = [...histLabels, ...fcLabels];

  const histY     = historical.map(h => h.y);
  const fcYhat    = forecast.map(f => f.yhat);
  const fcYLower  = forecast.map(f => f.yhat_lower);
  const fcYUpper  = forecast.map(f => f.yhat_upper);

  const forecastLineData = {
    labels: allLabels,
    datasets: [
      {
        label: 'Historical',
        data: [...histY, ...Array(fcLabels.length).fill(null)],
        borderColor: '#ff5722',
        backgroundColor: 'rgba(255,87,34,0.08)',
        borderWidth: 2,
        pointRadius: histY.length > 60 ? 0 : 2,
        pointBackgroundColor: '#ff5722',
        tension: 0.35,
        fill: true,
        order: 1,
      },
      {
        label: 'Forecast',
        data: [...Array(histY.length).fill(null), ...fcYhat],
        borderColor: '#ffc107',
        backgroundColor: 'rgba(255,193,7,0.06)',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 3,
        pointBackgroundColor: '#ffc107',
        tension: 0.3,
        fill: false,
        order: 2,
      },
      {
        label: 'CI Upper',
        data: [...Array(histY.length).fill(null), ...fcYUpper],
        borderColor: 'transparent',
        backgroundColor: 'rgba(255,193,7,0.10)',
        fill: '+1',
        pointRadius: 0,
        tension: 0.3,
        order: 3,
      },
      {
        label: 'CI Lower',
        data: [...Array(histY.length).fill(null), ...fcYLower],
        borderColor: 'transparent',
        backgroundColor: 'rgba(255,193,7,0.10)',
        fill: false,
        pointRadius: 0,
        tension: 0.3,
        order: 4,
      },
    ],
  };

  const lineOpts = {
    responsive: true,
    animation: { duration: 1200, easing: 'easeOutQuart' },
    plugins: {
      legend: {
        labels: {
          color: '#8892aa',
          font: { family: 'DM Sans', size: 11 },
          filter: item => item.text !== 'CI Upper' && item.text !== 'CI Lower',
        },
      },
      tooltip: {
        callbacks: {
          label: ctx => {
            if (ctx.dataset.label === 'CI Upper' || ctx.dataset.label === 'CI Lower') return null;
            return ` ${ctx.dataset.label}: ${ctx.parsed.y !== null ? Math.round(ctx.parsed.y) : 'N/A'} incidents`;
          },
        },
        filter: item => item.dataset.label !== 'CI Upper' && item.dataset.label !== 'CI Lower',
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#8892aa',
          maxTicksLimit: 14,
          maxRotation: 45,
          font: { size: 10 },
        },
        grid: { color: 'rgba(255,255,255,0.03)' },
      },
      y: {
        ticks: { color: '#8892aa', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        title: { display: true, text: 'Incidents / month', color: '#8892aa', font: { size: 10 } },
      },
    },
  };

  // ── Chart 2: Monthly Seasonality index bar ───────────────────────────────
  const seasonColors = (seasonality || []).map(s => {
    if (s.index >= 75) return 'rgba(255,87,34,0.75)';
    if (s.index >= 50) return 'rgba(255,193,7,0.7)';
    if (s.index >= 25) return 'rgba(255,152,0,0.55)';
    return 'rgba(0,191,85,0.6)';
  });

  const seasonData = {
    labels: (seasonality || []).map(s => s.month),
    datasets: [{
      label: 'Risk Index',
      data: (seasonality || []).map(s => s.index),
      backgroundColor: seasonColors,
      borderColor: seasonColors.map(c => c.replace('0.75)', '1)').replace('0.7)', '1)').replace('0.55)', '1)').replace('0.6)', '1)')),
      borderWidth: 1,
      borderRadius: 4,
    }],
  };

  const seasonOpts = {
    responsive: true,
    animation: { duration: 900 },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` Risk index: ${ctx.parsed.y.toFixed(1)}` } },
    },
    scales: {
      x: { ticks: { color: '#8892aa', font: { size: 11 } }, grid: { display: false } },
      y: {
        ticks: { color: '#8892aa', font: { size: 10 } },
        grid: { color: 'rgba(255,255,255,0.04)' },
        min: 0, max: 100,
        title: { display: true, text: 'Risk Index (0–100)', color: '#8892aa', font: { size: 10 } },
      },
    },
  };

  const trend  = TREND_BADGE[trend_direction] || TREND_BADGE.stable;
  const isProphet = model_type === 'prophet';

  return (
    <div>
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 12,
          background: trend.bg, color: trend.color,
          border: `1px solid ${trend.color}30`,
          fontFamily: 'var(--font-display)', fontWeight: 600,
        }}>
          {trend.label}
        </span>
        {peak_month && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Peak month: <strong style={{ color: '#ff5722' }}>{peak_month}</strong>
          </span>
        )}
        <span style={{
          fontSize: 10, marginLeft: 'auto', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          padding: '2px 8px', border: '1px solid var(--glass-border)',
          borderRadius: 8, background: 'rgba(255,255,255,0.02)',
        }}>
          {isProphet ? '⚗️ Prophet' : '📊 Statistical'} model · {forecast.length} months
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--glass-border)' }}>
        {[['forecast','📈 Forecast'], ['seasonality','🌡️ Seasonality']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600,
            color: tab === k ? '#ff5722' : 'var(--text-muted)',
            borderBottom: `2px solid ${tab === k ? '#ff5722' : 'transparent'}`,
            transition: 'all 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'forecast' && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-display)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Monthly incident count — historical + 12-month projection with 80% confidence interval
          </div>
          <Line data={forecastLineData} options={lineOpts} />
        </>
      )}

      {tab === 'seasonality' && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-display)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Monthly fire risk index — relative seasonal pattern (0 = lowest, 100 = peak)
          </div>
          <Bar data={seasonData} options={seasonOpts} />
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['🔴 Extreme', '≥75', '#ff5722'], ['🟠 High', '≥50', '#ffc107'], ['🟡 Moderate', '≥25', '#ff9800'], ['🟢 Low', '<25', '#00bf55']].map(([label, range, color]) => (
              <div key={label} style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }}/>
                {label} ({range})
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
