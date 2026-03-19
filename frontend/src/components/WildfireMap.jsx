import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API = 'http://localhost:8000';

const RISK_COLORS  = {
  LOW:    { color: '#00bf55', fill: '#00bf55' },
  MEDIUM: { color: '#ffc107', fill: '#ffc107' },
  HIGH:   { color: '#ff5722', fill: '#ff5722' },
};
const RISK_RADIUS  = { LOW: 6, MEDIUM: 9, HIGH: 13 };

/* Zone definitions — radius in metres, shown when firebreak active */
const ZONES = [
  { key: 'immediate', label: 'Immediate Danger',  km: 5,  color: '#ff5722', fill: 'rgba(255,87,34,0.08)',  dash: null },
  { key: 'evacuate',  label: 'Evacuation Zone',   km: 15, color: '#ffc107', fill: 'rgba(255,193,7,0.06)',  dash: [8, 6] },
  { key: 'monitor',   label: 'Monitoring Zone',   km: 25, color: '#00bfa5', fill: 'rgba(0,191,165,0.04)', dash: [4, 8] },
];

export default function WildfireMap() {
  const [searchParams]    = useSearchParams();
  const mapRef            = useRef(null);
  const leafletRef        = useRef(null);
  const markersRef        = useRef([]);
  const zoneLayersRef     = useRef([]);
  const [incidents,       setIncidents]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [filter,          setFilter]          = useState('ALL');
  const [stats,           setStats]           = useState({ LOW: 0, MEDIUM: 0, HIGH: 0 });
  const [firebreakActive, setFirebreakActive] = useState(false);
  const [zoneInfo,        setZoneInfo]        = useState(null);

  /* Read URL params — set by RiskCard "View on Map" button */
  const paramLat   = parseFloat(searchParams.get('lat'))   || null;
  const paramLng   = parseFloat(searchParams.get('lng'))   || null;
  const paramRisk  = searchParams.get('risk')              || null;
  const paramAcres = parseInt(searchParams.get('acres'))   || null;

  const hasPrediction = paramLat && paramLng && paramRisk;

  /* ── Init Leaflet ─────────────────────────────────────────── */
  useEffect(() => {
    const init = async () => {
      if (leafletRef.current) return;
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const center = hasPrediction ? [paramLat, paramLng] : [37.5, -119.5];
      const zoom   = hasPrediction ? 8 : 6;

      const map = L.map(mapRef.current, {
        center, zoom, zoomControl: true, attributionControl: true,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map);

      leafletRef.current = { L, map };

      // Auto-draw zones if prediction params present
      if (hasPrediction) {
        drawFirebreakZones(L, map, paramLat, paramLng, paramRisk, paramAcres);
        setFirebreakActive(true);
      }
    };
    init();
    return () => {
      if (leafletRef.current?.map) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Draw firebreak circles ───────────────────────────────── */
  const drawFirebreakZones = (L, map, lat, lng, risk, acres) => {
    // Clear existing zone layers
    zoneLayersRef.current.forEach(l => l.remove());
    zoneLayersRef.current = [];

    const cfg = RISK_COLORS[risk] || RISK_COLORS.HIGH;

    // Draw zones largest → smallest so smaller sits on top
    [...ZONES].reverse().forEach(zone => {
      const circle = L.circle([lat, lng], {
        radius:      zone.km * 1000,
        color:       zone.color,
        fillColor:   zone.fill,
        fillOpacity: 1,
        weight:      2,
        dashArray:   zone.dash ? zone.dash.join(',') : null,
        opacity:     0.85,
      }).addTo(map);

      circle.bindTooltip(
        `<div style="font-family:'DM Sans',sans-serif;font-size:12px;color:${zone.color};font-weight:600">${zone.label}</div><div style="color:#8892aa;font-size:11px">${zone.km}km radius</div>`,
        { permanent: false, direction: 'top' }
      );
      zoneLayersRef.current.push(circle);
    });

    // Fire epicentre marker
    const epicentre = L.circleMarker([lat, lng], {
      radius: 10, color: cfg.color, fillColor: cfg.fill,
      fillOpacity: 0.9, weight: 2.5,
    }).addTo(map);

    epicentre.bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;color:#f0f4ff;min-width:180px">
        <div style="font-weight:700;font-size:14px;color:${cfg.color};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1)">
          🔥 Predicted Fire Location
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px">
          <span style="color:#8892aa">Risk Level</span><span style="color:${cfg.color};font-weight:600">${risk}</span>
          <span style="color:#8892aa">Est. Acres</span><span>${acres ? acres.toLocaleString() : '—'}</span>
          <span style="color:#8892aa">Lat</span><span>${lat.toFixed(4)}</span>
          <span style="color:#8892aa">Lng</span><span>${lng.toFixed(4)}</span>
        </div>
      </div>
    `, { className: 'fire-popup', maxWidth: 240 });

    epicentre.openPopup();
    zoneLayersRef.current.push(epicentre);

    // Pan map to fire location
    map.flyTo([lat, lng], 8, { duration: 1.4, easeLinearity: 0.3 });

    setZoneInfo({ lat, lng, risk, acres });
  };

  /* ── Fetch incidents ──────────────────────────────────────── */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await axios.get(`${API}/incidents?limit=600`);
        setIncidents(data.records);
        const s = { LOW: 0, MEDIUM: 0, HIGH: 0 };
        data.records.forEach(r => { if (s[r.risk_level] !== undefined) s[r.risk_level]++; });
        setStats(s);
      } catch {
        setError('Could not load incidents. Is the API running?');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  /* ── Render incident markers ──────────────────────────────── */
  useEffect(() => {
    if (!leafletRef.current || incidents.length === 0) return;
    const { L, map } = leafletRef.current;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const filtered = filter === 'ALL' ? incidents : incidents.filter(i => i.risk_level === filter);

    filtered.forEach(inc => {
      if (!inc.latitude || !inc.longitude) return;
      if (Math.abs(inc.latitude) < 1 || Math.abs(inc.longitude) < 1) return;
      const cfg    = RISK_COLORS[inc.risk_level] || RISK_COLORS.LOW;
      const radius = RISK_RADIUS[inc.risk_level] || 6;

      const circle = L.circleMarker([inc.latitude, inc.longitude], {
        radius, color: cfg.color, fillColor: cfg.fill,
        fillOpacity: 0.75, weight: 1.5, opacity: 0.9,
      });

      circle.bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;min-width:200px;color:#f0f4ff">
          <div style="font-weight:700;font-size:14px;color:${cfg.color};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1)">
            ${inc.name || 'Fire Incident'}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
            <span style="color:#8892aa">Risk Level</span><span style="color:${cfg.color};font-weight:600">${inc.risk_level}</span>
            <span style="color:#8892aa">Acres Burned</span><span>${(inc.acres_burned || 0).toLocaleString()}</span>
            <span style="color:#8892aa">Containment</span><span>${Math.round(inc.percent_contained || 0)}%</span>
            <span style="color:#8892aa">Major Incident</span><span>${inc.major_incident ? 'Yes' : 'No'}</span>
            ${inc.started ? `<span style="color:#8892aa">Started</span><span>${inc.started.split('T')[0]}</span>` : ''}
          </div>
        </div>
      `, { className: 'fire-popup', maxWidth: 260 });

      circle.addTo(map);
      markersRef.current.push(circle);
    });
  }, [incidents, filter]);

  /* ── Popup styles ─────────────────────────────────────────── */
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .fire-popup .leaflet-popup-content-wrapper {
        background: rgba(13,17,23,0.95) !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        border-radius: 10px !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
        backdrop-filter: blur(12px);
      }
      .fire-popup .leaflet-popup-tip { background: rgba(13,17,23,0.95) !important; }
      .fire-popup .leaflet-popup-close-button { color: #8892aa !important; font-size: 16px !important; }
      .leaflet-container { background: #060810 !important; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  /* ── Clear zones handler ──────────────────────────────────── */
  const clearZones = () => {
    zoneLayersRef.current.forEach(l => l.remove());
    zoneLayersRef.current = [];
    setFirebreakActive(false);
    setZoneInfo(null);
    if (leafletRef.current?.map) {
      leafletRef.current.map.flyTo([37.5, -119.5], 6, { duration: 1.2 });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Firebreak zone info banner */}
      {firebreakActive && zoneInfo && (
        <div style={{
          padding: '12px 20px', background: 'rgba(255,87,34,0.08)',
          borderBottom: '1px solid rgba(255,87,34,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ember-500)', animation: 'pulse-ember 1.5s infinite' }}/>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Firebreak zones active — <strong style={{ color: '#fff' }}>{zoneInfo.risk}</strong> risk fire at{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{zoneInfo.lat?.toFixed(3)}, {zoneInfo.lng?.toFixed(3)}</span>
            </span>
            {/* Zone legend inline */}
            <div style={{ display: 'flex', gap: 12 }}>
              {ZONES.map(z => (
                <div key={z.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.color, opacity: 0.8 }}/>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{z.label} ({z.km}km)</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={clearZones} className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>
            Clear zones
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', flexWrap: 'wrap', gap: 10,
        borderBottom: '1px solid var(--glass-border)',
        background: 'rgba(13,17,23,0.8)',
      }}>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'Low',    count: stats.LOW,    color: '#00bf55' },
            { label: 'Medium', count: stats.MEDIUM, color: '#ffc107' },
            { label: 'High',   count: stats.HIGH,   color: '#ff5722' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }}/>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {s.label}: <strong style={{ color: s.color }}>{s.count}</strong>
              </span>
            </div>
          ))}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {incidents.length} incidents
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {['ALL', 'LOW', 'MEDIUM', 'HIGH'].map(f => {
            const colors = { ALL: 'var(--text-secondary)', LOW: '#00bf55', MEDIUM: '#ffc107', HIGH: '#ff5722' };
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 12px', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${active ? colors[f] : 'var(--glass-border)'}`,
                background: active ? `${colors[f]}18` : 'transparent',
                color: active ? colors[f] : 'var(--text-muted)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
                transition: 'var(--transition)',
              }}>{f}</button>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div style={{ position: 'relative', flex: 1, minHeight: 480 }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,8,16,0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{ textAlign: 'center' }}>
              <span className="spinner" style={{ width: 28, height: 28 }}/>
              <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>Loading fire incidents...</div>
            </div>
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: 'var(--ember-400)', fontSize: 14 }}>{error}</div>
          </div>
        )}
        <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 480 }}/>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 20, padding: '10px 20px',
        borderTop: '1px solid var(--glass-border)',
        background: 'rgba(13,17,23,0.8)', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Incidents</span>
        {[
          { label: 'Low  (< 1K acres)',   color: '#00bf55', r: 6  },
          { label: 'Medium  (1K–10K)',    color: '#ffc107', r: 9  },
          { label: 'High  (> 10K acres)', color: '#ff5722', r: 13 },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width={l.r * 2 + 2} height={l.r * 2 + 2}>
              <circle cx={l.r + 1} cy={l.r + 1} r={l.r} fill={l.color} fillOpacity={0.75} stroke={l.color} strokeWidth={1.5}/>
            </svg>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l.label}</span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {hasPrediction ? 'Firebreak zones drawn from prediction ↑' : 'Run a prediction to see firebreak zones'}
        </span>
      </div>
    </div>
  );
}
