import { useEffect, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const RISK_COLORS = {
  EXTREME: '#ff1744',
  HIGH:    '#ff5722',
  MODERATE:'#ffc107',
  LOW:     '#00bf55',
};

function WeatherStat({ icon, label, value, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, padding: '10px 16px',
      borderRight: '1px solid var(--glass-border)',
      minWidth: 90,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: color || 'var(--text-primary)',
        fontFamily: 'var(--font-display)' }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.06em', fontFamily: 'var(--font-display)' }}>{label}</span>
    </div>
  );
}

export default function WeatherStrip({ lat, lon }) {
  const [weather, setWeather]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);

  useEffect(() => {
    if (!lat || !lon) return;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await axios.get(`${API}/weather`, { params: { lat, lon } });
        setWeather(data);
      } catch {
        setError('Weather unavailable');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [lat, lon]);

  if (!lat || !lon) return null;

  if (loading) return (
    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-md)', marginBottom: 16 }}>
      <span className="spinner"/>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fetching live weather...</span>
    </div>
  );

  if (error || !weather) return null;

  const riskColor = RISK_COLORS[weather.fire_weather_risk] || '#00bf55';

  return (
    <div style={{
      background: 'var(--glass-bg)',
      border: `1px solid ${weather.red_flag_warning ? 'rgba(255,87,34,0.4)' : 'var(--glass-border)'}`,
      borderRadius: 'var(--radius-md)',
      marginBottom: 16,
      overflow: 'hidden',
      animation: weather.red_flag_warning ? 'alarm-flash 2s ease-in-out infinite' : 'none',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px',
        background: weather.red_flag_warning ? 'rgba(255,87,34,0.1)' : 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid var(--glass-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>🌤</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            fontFamily: 'var(--font-display)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Live Weather — {weather.location}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {weather.red_flag_warning && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              borderRadius: 10, background: 'rgba(255,87,34,0.2)',
              color: '#ff5722', fontFamily: 'var(--font-display)',
              letterSpacing: '0.06em', animation: 'pulse-ember 1.5s infinite',
            }}>🚩 RED FLAG WARNING</span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px',
            borderRadius: 10, background: `${riskColor}18`,
            color: riskColor, fontFamily: 'var(--font-display)',
          }}>
            Fire Weather: {weather.fire_weather_risk}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto' }}>
        <WeatherStat icon="🌡" label="Temp"      value={`${weather.temperature_c}°C`} />
        <WeatherStat icon="💧" label="Humidity"  value={`${weather.humidity_pct}%`}
          color={weather.humidity_pct <= 25 ? '#ff5722' : undefined} />
        <WeatherStat icon="💨" label="Wind"
          value={`${weather.wind_speed_kmh} km/h`}
          color={weather.wind_speed_kmh >= 25 ? '#ffc107' : undefined} />
        <WeatherStat icon="🧭" label="Direction" value={weather.wind_direction} />
        <WeatherStat icon="🌥" label="Condition" value={weather.description} />
        <WeatherStat icon="🌡" label="Feels Like" value={`${weather.feels_like_c}°C`} />
        <div style={{ padding: '10px 14px', fontSize: 11,
          color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap' }}>
          Pressure: {weather.raw.pressure_hpa} hPa<br/>
          Visibility: {(weather.raw.visibility_m / 1000).toFixed(1)} km
        </div>
      </div>
    </div>
  );
}
