import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  const perimeterLayersRef = useRef([]);
  const [incidents,       setIncidents]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [filter,          setFilter]          = useState('ALL');
  const [stats,           setStats]           = useState({ LOW: 0, MEDIUM: 0, HIGH: 0 });
  const [firebreakActive, setFirebreakActive] = useState(false);
  const [zoneInfo,        setZoneInfo]        = useState(null);
  const firmsMarkersRef = useRef([]);
  const [satelliteFires,  setSatelliteFires]  = useState([]);
  const [firmsLoading,    setFirmsLoading]    = useState(false);
  const [showSatellite,   setShowSatellite]   = useState(true);
  const [showHistorical,  setShowHistorical]  = useState(false);
  const [firmsDays,       setFirmsDays]       = useState(1);
  const [perimeters,        setPerimeters]        = useState([]);
  const [showPerimeters,    setShowPerimeters]    = useState(false);
  const [perimetersLoading, setPerimetersLoading] = useState(false);
  const [spreadPolygons,    setSpreadPolygons]    = useState(null);
  const [showSpread,        setShowSpread]        = useState(false);
  const spreadLayersRef     = useRef([]);
  const [smokePlume,        setSmokePlume]        = useState(null);
  const [showSmoke,         setShowSmoke]         = useState(false);
  const smokePlumeLayerRef  = useRef(null);
  const [weatherData,       setWeatherData]       = useState(null);
  const [evacuationRoutes,  setEvacuationRoutes]  = useState(null);
  const [showEvacuation,    setShowEvacuation]    = useState(false);
  const evacuationLayersRef = useRef([]);

  /* Read URL params — set by RiskCard "View on Map" button */
  const paramLat   = parseFloat(searchParams.get('lat'))   || null;
  const paramLng   = parseFloat(searchParams.get('lng'))   || null;
  const paramRisk  = searchParams.get('risk')              || null;
  const paramAcres = parseInt(searchParams.get('acres'))   || null;
  const paramPersonnel   = parseInt(searchParams.get('personnel'))   || 0;
  const paramEngines     = parseInt(searchParams.get('engines'))     || 0;
  const paramHelicopters = parseInt(searchParams.get('helicopters')) || 0;

  const hasPrediction = paramLat && paramLng && paramRisk;

  /* ── Init Leaflet ─────────────────────────────────────────── */
  useEffect(() => {
    const init = async () => {
      if (leafletRef.current) return;
      if (mapRef.current._leaflet_id) return;
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
  const drawFirebreakZones = async (L, map, lat, lng, risk, acres) => {
    zoneLayersRef.current.forEach(l => l.remove());
    zoneLayersRef.current = [];

    const cfg = RISK_COLORS[risk] || RISK_COLORS.HIGH;

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
    map.flyTo([lat, lng], 8, { duration: 1.4, easeLinearity: 0.3 });
    setZoneInfo({ lat, lng, risk, acres });

    // Fetch evacuation routes
    fetchEvacuationRoutes(lat, lng);

    // Fetch weather data for spread/smoke predictions
    try {
      const { data: weather } = await axios.get(`${API}/weather`, { params: { lat, lon: lng } });
      setWeatherData(weather);

      // Auto-fetch spread and smoke predictions
      const windSpeed = weather?.wind_speed_kmh || 15;
      const windDeg = weather?.wind_deg || 270;
      fetchSpreadPrediction(lat, lng, windSpeed, windDeg, risk, acres);
      fetchSmokePlume(lat, lng, windDeg, windSpeed);
    } catch (e) {
      console.warn('Weather fetch failed:', e);
    }
  };

  /* ── Fetch spread prediction ──────────────────────────────── */
  const fetchSpreadPrediction = async (lat, lng, windSpeed, windDeg, risk, acres) => {
    try {
      const { data } = await axios.post(`${API}/spread-prediction`, {
        latitude: lat,
        longitude: lng,
        wind_speed_kmh: windSpeed,
        wind_deg: windDeg,
        risk_level: risk,
        acres_est: acres || 1000,
      });
      setSpreadPolygons(data);
      setShowSpread(true);
    } catch (e) {
      console.warn('Spread prediction failed:', e);
    }
  };

  /* ── Fetch smoke plume ─────────────────────────────────────── */
  const fetchSmokePlume = async (lat, lng, windDeg, windSpeed) => {
    try {
      const { data } = await axios.post(`${API}/smoke-plume`, {
        latitude: lat,
        longitude: lng,
        wind_deg: windDeg,
        wind_speed_kmh: windSpeed,
      });
      setSmokePlume(data);
      setShowSmoke(true);
    } catch (e) {
      console.warn('Smoke plume fetch failed:', e);
    }
  };

  /* ── Fetch evacuation routes ──────────────────────────────────── */
  const fetchEvacuationRoutes = async (lat, lng) => {
    try {
      const { data } = await axios.get(`${API}/evacuation-routes`, {
        params: { lat, lon: lng },
      });
      setEvacuationRoutes(data);
      setShowEvacuation(true);
    } catch (e) {
      console.warn('Evacuation routes fetch failed:', e);
    }
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

  /* ── Fetch NASA FIRMS satellite fires ─────────────────────── */
  useEffect(() => {
    const fetchFirms = async () => {
      setFirmsLoading(true);
      try {
        const { data } = await axios.get(`${API}/active-fires?days=${firmsDays}`);
        setSatelliteFires(data.fires || []);
      } catch {
        setSatelliteFires([]);
      } finally {
        setFirmsLoading(false);
      }
    };
    fetchFirms();
  }, [firmsDays]);

  /* ── Fetch fire perimeters ────────────────────────────────── */
  useEffect(() => {
    const fetchPerimeters = async () => {
      setPerimetersLoading(true);
      try {
        const { data } = await axios.get(`${API}/fire-perimeters`);
        setPerimeters(data.perimeters || []);
      } catch {
        setPerimeters([]);
      } finally {
        setPerimetersLoading(false);
      }
    };
    fetchPerimeters();
  }, []);

  /* ── Render incident markers ──────────────────────────────── */
  useEffect(() => {
    if (!leafletRef.current) return;
    const { L, map } = leafletRef.current;

    // Always clear first
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!showHistorical || incidents.length === 0) return;

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
  }, [incidents, filter, showHistorical]);

  /* ── Render NASA FIRMS satellite markers ──────────────────── */
  useEffect(() => {
    if (!leafletRef.current) return;
    const { L, map } = leafletRef.current;

    firmsMarkersRef.current.forEach(m => m.remove());
    firmsMarkersRef.current = [];

    if (!showSatellite) return;

    satelliteFires.forEach(fire => {
      const cfg    = RISK_COLORS[fire.risk_level] || RISK_COLORS.LOW;
      const radius = RISK_RADIUS[fire.risk_level] || 6;

      const outerRing = L.circleMarker([fire.latitude, fire.longitude], {
        radius:      radius + 6,
        color:       cfg.color,
        fillColor:   'transparent',
        fillOpacity: 0,
        weight:      1.5,
        opacity:     0.4,
      }).addTo(map);

      const inner = L.circleMarker([fire.latitude, fire.longitude], {
        radius,
        color:       '#fff',
        fillColor:   cfg.color,
        fillOpacity: 0.95,
        weight:      2,
        opacity:     1,
      });

      inner.bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;color:#f0f4ff;min-width:210px">
          <div style="font-weight:700;font-size:13px;color:${cfg.color};
            margin-bottom:8px;padding-bottom:6px;
            border-bottom:1px solid rgba(255,255,255,0.1)">
            🛰 NASA FIRMS — Live Detection
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px">
            <span style="color:#8892aa">Risk Level</span>
            <span style="color:${cfg.color};font-weight:700">${fire.risk_level}</span>
            <span style="color:#8892aa">Fire Power</span>
            <span>${fire.frp} MW</span>
            <span style="color:#8892aa">Confidence</span>
            <span>${fire.confidence}</span>
            <span style="color:#8892aa">Detected</span>
            <span>${fire.acq_date} ${fire.acq_time}Z</span>
            <span style="color:#8892aa">Satellite</span>
            <span>VIIRS NOAA-20</span>
            <span style="color:#8892aa">Day/Night</span>
            <span>${fire.daynight === 'D' ? '☀ Day' : '🌙 Night'}</span>
          </div>
        </div>
      `, { className: 'fire-popup', maxWidth: 260 });

      inner.addTo(map);
      firmsMarkersRef.current.push(outerRing);
      firmsMarkersRef.current.push(inner);
    });
  }, [satelliteFires, showSatellite]);

  /* ── Render fire perimeter overlays ──────────────────────── */
  useEffect(() => {
    if (!leafletRef.current) return;
    const { L, map } = leafletRef.current;

    perimeterLayersRef.current.forEach(l => l.remove());
    perimeterLayersRef.current = [];

    if (!showPerimeters || perimeters.length === 0) return;

    perimeters.forEach(p => {
      const latlngs = p.coordinates.map(([lng, lat]) => [lat, lng]);

      const polygon = L.polygon(latlngs, {
        color:       p.color,
        fillColor:   p.fill,
        fillOpacity: 1,
        weight:      2,
        opacity:     0.9,
        dashArray:   '6, 4',
      }).addTo(map);

      polygon.bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;color:#f0f4ff;min-width:220px">
          <div style="font-weight:700;font-size:13px;color:${p.color};
            margin-bottom:8px;padding-bottom:6px;
            border-bottom:1px solid rgba(255,255,255,0.1)">
            🔥 ${p.name}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:12px">
            <span style="color:#8892aa">Year</span><span>${p.year}</span>
            <span style="color:#8892aa">Acres Burned</span><span>${p.acres.toLocaleString()}</span>
            <span style="color:#8892aa">Deaths</span><span style="color:#ff5722;font-weight:600">${p.deaths}</span>
            <span style="color:#8892aa">County</span><span>${p.county}</span>
          </div>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);
            font-size:11px;color:#8892aa;line-height:1.5">
            ${p.description}
          </div>
        </div>
      `, { className: 'fire-popup', maxWidth: 280 });

      perimeterLayersRef.current.push(polygon);
    });
  }, [perimeters, showPerimeters]);

  /* ── Render fire spread polygons ──────────────────────────── */
  useEffect(() => {
    if (!leafletRef.current) return;
    const { L, map } = leafletRef.current;

    spreadLayersRef.current.forEach(l => l.remove());
    spreadLayersRef.current = [];

    if (!showSpread || !spreadPolygons) return;

    const { spread_6h, spread_12h, spread_24h } = spreadPolygons;

    // 24h polygon (largest, lowest opacity, red)
    if (spread_24h?.length) {
      const poly24 = L.polygon(spread_24h, {
        color:       '#ff1744',
        fillColor:   '#ff1744',
        fillOpacity: 0.08,
        weight:      2,
        opacity:     0.6,
        dashArray:   '8, 6',
      }).addTo(map);
      poly24.bindTooltip('24-hour spread projection', { permanent: false });
      spreadLayersRef.current.push(poly24);
    }

    // 12h polygon (medium, orange)
    if (spread_12h?.length) {
      const poly12 = L.polygon(spread_12h, {
        color:       '#ff9800',
        fillColor:   '#ff9800',
        fillOpacity: 0.12,
        weight:      2,
        opacity:     0.7,
        dashArray:   '6, 4',
      }).addTo(map);
      poly12.bindTooltip('12-hour spread projection', { permanent: false });
      spreadLayersRef.current.push(poly12);
    }

    // 6h polygon (smallest, highest opacity, amber)
    if (spread_6h?.length) {
      const poly6 = L.polygon(spread_6h, {
        color:       '#ffc107',
        fillColor:   '#ffc107',
        fillOpacity: 0.18,
        weight:      2.5,
        opacity:     0.85,
        dashArray:   '4, 3',
      }).addTo(map);
      poly6.bindTooltip('6-hour spread projection', { permanent: false });
      spreadLayersRef.current.push(poly6);
    }
  }, [spreadPolygons, showSpread]);

  /* ── Render smoke plume ────────────────────────────────────── */
  useEffect(() => {
    if (!leafletRef.current) return;
    const { L, map } = leafletRef.current;

    if (smokePlumeLayerRef.current) {
      smokePlumeLayerRef.current.remove();
      smokePlumeLayerRef.current = null;
    }

    if (!showSmoke || !smokePlume?.plume) return;

    const plume = L.polygon(smokePlume.plume, {
      color:       '#8B5A2B',
      fillColor:   'rgba(120,80,40,0.15)',
      fillOpacity: 1,
      weight:      2,
      opacity:     0.6,
      dashArray:   '6, 4',
    }).addTo(map);

    plume.bindTooltip('Smoke plume trajectory (50km downwind)', { permanent: false });
    smokePlumeLayerRef.current = plume;
  }, [smokePlume, showSmoke]);

  /* ── Render evacuation routes ──────────────────────────────── */
  useEffect(() => {
    if (!leafletRef.current) return;
    const { L, map } = leafletRef.current;

    // Clear existing routes
    evacuationLayersRef.current.forEach(l => l.remove());
    evacuationLayersRef.current = [];

    if (!showEvacuation || !evacuationRoutes?.routes) return;

    evacuationRoutes.routes.forEach(route => {
      // Draw route polyline
      const polyline = L.polyline(route.coordinates, {
        color: '#00ff88',
        weight: 3,
        opacity: 0.85,
      }).addTo(map);

      polyline.bindTooltip(
        `<div style="font-family:'DM Sans',sans-serif;font-size:11px">
          <div style="color:#00ff88;font-weight:700;margin-bottom:3px">🚗 Evacuate to ${route.city}</div>
          <div style="color:#8892aa">
            ${route.distance_km} km • ~${route.duration_min} min drive
            ${route.fallback ? '<br><span style="color:#ffc107;font-size:10px">⚠ Estimated route</span>' : ''}
          </div>
        </div>`,
        { permanent: false, direction: 'top' }
      );

      evacuationLayersRef.current.push(polyline);

      // Add city marker at endpoint
      const cityMarker = L.circleMarker([route.city_lat, route.city_lon], {
        radius: 8,
        color: '#00ff88',
        fillColor: '#00ff88',
        fillOpacity: 0.7,
        weight: 2,
      }).addTo(map);

      cityMarker.bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;color:#f0f4ff;min-width:150px">
          <div style="font-weight:700;font-size:13px;color:#00ff88;margin-bottom:6px">
            🏙 Safe Zone: ${route.city}
          </div>
          <div style="font-size:11px;color:#8892aa">
            Distance from fire: ${route.distance_km} km<br>
            Estimated drive: ${route.duration_min} min
          </div>
        </div>
      `, { className: 'fire-popup' });

      evacuationLayersRef.current.push(cityMarker);
    });
  }, [evacuationRoutes, showEvacuation]);

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
      path.leaflet-interactive:focus { outline: none !important; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  /* ── Clear zones handler ──────────────────────────────────── */
  const clearZones = () => {
    // Remove zone circles
    zoneLayersRef.current.forEach(l => l.remove());
    zoneLayersRef.current = [];

    // Remove spread
    spreadLayersRef.current.forEach(l => l.remove());
    spreadLayersRef.current = [];
    setSpreadPolygons(null);
    setShowSpread(false);

    // Remove smoke
    if (smokePlumeLayerRef.current) {
      smokePlumeLayerRef.current.remove();
      smokePlumeLayerRef.current = null;
    }
    setSmokePlume(null);
    setShowSmoke(false);

    // Remove evacuation routes
    if (evacuationLayersRef.current) {
      evacuationLayersRef.current.forEach(l => l.remove());
      evacuationLayersRef.current = [];
    }
    setEvacuationRoutes(null);
    setShowEvacuation(false);

    // Reset state
    setFirebreakActive(false);
    setZoneInfo(null);

    if (leafletRef.current?.map) {
      leafletRef.current.map.flyTo([37.5, -119.5], 6, { duration: 1.2 });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

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
            <div style={{ display: 'flex', gap: 12 }}>
              {ZONES.map(z => (
                <div key={z.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.color, opacity: 0.8 }}/>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{z.label} ({z.km}km)</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {firebreakActive ? 'Firebreak zones drawn from prediction ↓' : ''}
            </span>
            <button onClick={clearZones} className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>
              Clear zones
            </button>
          </div>
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
          {satelliteFires.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%',
                background: '#ff5722', border: '2px solid #fff' }}/>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Live: <strong style={{ color: '#ff5722' }}>{satelliteFires.length}</strong>
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Risk filter — only shows when historical is on */}
          {showHistorical && ['ALL', 'LOW', 'MEDIUM', 'HIGH'].map(f => {
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

        {/* Satellite + Historical + Perimeters toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Historical toggle */}
          <button onClick={() => setShowHistorical(h => !h)} style={{
            padding: '5px 12px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${showHistorical ? '#ffc107' : 'var(--glass-border)'}`,
            background: showHistorical ? 'rgba(255,193,7,0.15)' : 'transparent',
            color: showHistorical ? '#ffc107' : 'var(--text-muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
            transition: 'var(--transition)',
          }}>
            📍 Historical ({incidents.length})
          </button>
          {/* Perimeters toggle */}
          <button onClick={() => setShowPerimeters(p => !p)} style={{
            padding: '5px 12px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${showPerimeters ? '#aa00ff' : 'var(--glass-border)'}`,
            background: showPerimeters ? 'rgba(170,0,255,0.15)' : 'transparent',
            color: showPerimeters ? '#aa00ff' : 'var(--text-muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
            transition: 'var(--transition)',
          }}>
            🗺 Perimeters ({perimeters.length})
          </button>
          {/* Spread toggle */}
          {firebreakActive && (
            <button onClick={() => setShowSpread(s => !s)} style={{
              padding: '5px 12px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${showSpread ? '#ffc107' : 'var(--glass-border)'}`,
              background: showSpread ? 'rgba(255,193,7,0.15)' : 'transparent',
              color: showSpread ? '#ffc107' : 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
              transition: 'var(--transition)',
            }}>
              🔥 Spread
            </button>
          )}
          {/* Smoke toggle */}
          {firebreakActive && (
            <button onClick={() => setShowSmoke(s => !s)} style={{
              padding: '5px 12px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${showSmoke ? '#8B5A2B' : 'var(--glass-border)'}`,
              background: showSmoke ? 'rgba(139,90,43,0.15)' : 'transparent',
              color: showSmoke ? '#8B5A2B' : 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
              transition: 'var(--transition)',
            }}>
              💨 Smoke
            </button>
          )}
          {/* Evacuation toggle */}
          {firebreakActive && (
            <button onClick={() => setShowEvacuation(e => !e)} style={{
              padding: '5px 12px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${showEvacuation ? '#00ff88' : 'var(--glass-border)'}`,
              background: showEvacuation ? 'rgba(0,255,136,0.15)' : 'transparent',
              color: showEvacuation ? '#00ff88' : 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
              transition: 'var(--transition)',
            }}>
              🟢 Evacuation
            </button>
          )}
          {/* Satellite toggle */}
          <button onClick={() => setShowSatellite(s => !s)} style={{
            padding: '5px 12px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${showSatellite ? '#ff5722' : 'var(--glass-border)'}`,
            background: showSatellite ? 'rgba(255,87,34,0.15)' : 'transparent',
            color: showSatellite ? '#ff5722' : 'var(--text-muted)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
            transition: 'var(--transition)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            🛰 {firmsLoading ? 'Loading...' : `Live (${satelliteFires.length})`}
          </button>
          <select value={firmsDays} onChange={e => setFirmsDays(Number(e.target.value))}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
              fontSize: 11, padding: '4px 8px', cursor: 'pointer',
            }}>
            <option value={1}>Today</option>
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
          </select>
        </div>
      </div>

      {/* Map */}
      <div style={{ position: 'relative', flex: 1, minHeight: 300 }}>
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
        <div ref={mapRef} style={{ width: '100%', height: '100%' }}/>

        {/* NIMS Resource Gap Alert */}
        {(() => {
          // Only show when firebreak active, zoneInfo exists, and resource data is available
          if (!firebreakActive || !zoneInfo || (paramPersonnel === 0 && paramEngines === 0 && paramHelicopters === 0)) return null;

          const NIMS_STANDARDS = {
            HIGH:   { personnel: 700, engines: 70, helicopters: 14 },
            MEDIUM: { personnel: 200, engines: 28, helicopters: 5 },
            LOW:    { personnel: 50,  engines: 8,  helicopters: 1 },
          };

          const recommended = NIMS_STANDARDS[paramRisk] || NIMS_STANDARDS.LOW;
          
          const resources = [
            { key: 'personnel', label: 'Personnel', deployed: paramPersonnel, needed: recommended.personnel },
            { key: 'engines', label: 'Engines', deployed: paramEngines, needed: recommended.engines },
            { key: 'helicopters', label: 'Helicopters', deployed: paramHelicopters, needed: recommended.helicopters },
          ];

          const hasGap = resources.some(r => r.deployed < r.needed);
          const statusColor = hasGap ? '#ffc107' : '#00bf55';

          return (
            <div style={{
              position: 'absolute',
              bottom: 80,
              left: 12,
              zIndex: 900,
              background: 'rgba(13,17,23,0.92)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 10,
              padding: '12px 16px',
              minWidth: 220,
              maxWidth: 260,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }}/>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                  NIMS COMPLIANCE
                </span>
              </div>

              {/* Resource rows */}
              {resources.map(r => {
                const adequate = r.deployed >= r.needed;
                const textColor = adequate ? '#00bf55' : '#ff5722';
                return (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: textColor, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {adequate ? `${r.deployed} / ${r.needed}` : `${r.deployed} deployed — need ${r.needed}`}
                      </span>
                      <span style={{ fontSize: 13 }}>{adequate ? '✓' : '⚠'}</span>
                    </div>
                  </div>
                );
              })}

              {/* Footer */}
              <div style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--glass-border)',
                fontSize: 11,
                color: statusColor,
                fontWeight: 500,
              }}>
                {hasGap ? '⚠️ Resource gap detected' : `✅ Resources adequate for ${paramRisk} risk`}
              </div>
            </div>
          );
        })()}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="16" height="16">
            <circle cx="8" cy="8" r="5" fill="#ff5722" stroke="#fff" strokeWidth="2"/>
            <circle cx="8" cy="8" r="9" fill="none" stroke="#ff5722" strokeWidth="1" opacity="0.4"/>
          </svg>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            🛰 NASA FIRMS Live Detection
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="16" height="10">
            <rect x="0" y="2" width="16" height="6"
              fill="rgba(170,0,255,0.15)" stroke="#aa00ff"
              strokeWidth="1.5" strokeDasharray="4,3"/>
          </svg>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            🗺 Historical Perimeters
          </span>
        </div>
        {firebreakActive && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg width="16" height="10">
                <rect x="0" y="2" width="16" height="6"
                  fill="rgba(255,193,7,0.18)" stroke="#ffc107"
                  strokeWidth="2" strokeDasharray="4,3"/>
              </svg>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                🔥 Fire Spread (6h/12h/24h)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg width="16" height="10">
                <rect x="0" y="2" width="16" height="6"
                  fill="rgba(120,80,40,0.15)" stroke="#8B5A2B"
                  strokeWidth="2" strokeDasharray="6,4"/>
              </svg>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                💨 Smoke Plume (50km)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <svg width="20" height="4">
                <line x1="0" y1="2" x2="20" y2="2" stroke="#00ff88" strokeWidth="3"/>
              </svg>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>🟢 Evacuation Routes</span>
            </div>
          </>
        )}
        {!firebreakActive && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            Run a prediction to see firebreak zones
          </span>
        )}
      </div>
    </div>
  );
}