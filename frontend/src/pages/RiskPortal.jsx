import { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const RISK_COLORS = {
  HIGH:   { bg: 'rgba(255,87,34,0.15)', border: 'rgba(255,87,34,0.3)', color: '#ff5722' },
  MEDIUM: { bg: 'rgba(255,193,7,0.12)', border: 'rgba(255,193,7,0.25)', color: '#ffc107' },
  LOW:    { bg: 'rgba(0,191,85,0.12)',  border: 'rgba(0,191,85,0.25)',  color: '#00bf55' },
};

// Haversine formula for distance calculation
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function RiskPortal() {
  const [zipCode, setZipCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [location, setLocation] = useState(null); // { lat, lon, display_name }
  const [riskResult, setRiskResult] = useState(null);
  const [nearbyFires, setNearbyFires] = useState([]);
  
  const [email, setEmail] = useState('');
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [subscribeSuccess, setSubscribeSuccess] = useState(false);
  const [subscribeError, setSubscribeError] = useState(null);

  const handleLookup = async () => {
    if (!zipCode.trim()) {
      setError('Please enter a zip code');
      return;
    }

    setLoading(true);
    setError(null);
    setRiskResult(null);
    setNearbyFires([]);
    setSubscribeSuccess(false);

    try {
      // Step 1: Get lat/lon from Nominatim
      const nominatimResp = await axios.get(
        `https://nominatim.openstreetmap.org/search?q=${zipCode}&format=json&countrycodes=us`,
        {
          headers: {
            'User-Agent': 'GeoAI-Fire-Intelligence/1.0'
          }
        }
      );

      if (!nominatimResp.data || nominatimResp.data.length === 0) {
        setError('Zip code not found. Please enter a valid California zip code.');
        setLoading(false);
        return;
      }

      const loc = nominatimResp.data[0];
      const lat = parseFloat(loc.lat);
      const lon = parseFloat(loc.lon);

      // Validate California bounds
      if (lat < 32 || lat > 42 || lon < -125 || lon > -114) {
        setError('This zip code is outside California. This system only serves California residents.');
        setLoading(false);
        return;
      }

      setLocation({
        lat,
        lon,
        display_name: loc.display_name,
      });

      // Step 2: Call /predict with median values
      const predictResp = await axios.post(`${API}/predict`, {
        County: 15,
        Latitude: lat,
        Longitude: lon,
        PercentContained: 50,
        PersonnelInvolved: 151,
        Engines: 11,
        Helicopters: 1,
        Dozers: 0,
        WaterTenders: 2,
        MajorIncident: 0,
      });

      setRiskResult(predictResp.data);

      // Step 3: Fetch active fires
      const firesResp = await axios.get(`${API}/active-fires?days=3`);
      const fires = firesResp.data.fires || [];

      // Filter fires within 50km
      const nearby = fires
        .map(fire => ({
          ...fire,
          distance: haversineDistance(lat, lon, fire.latitude, fire.longitude),
        }))
        .filter(fire => fire.distance <= 50)
        .sort((a, b) => a.distance - b.distance);

      setNearbyFires(nearby);

    } catch (err) {
      console.error('Lookup error:', err);
      setError(err.response?.data?.detail || 'Failed to fetch risk data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!email.trim()) {
      setSubscribeError('Please enter an email address');
      return;
    }
    if (!location) {
      setSubscribeError('Please lookup a zip code first');
      return;
    }

    setSubscribeLoading(true);
    setSubscribeError(null);
    setSubscribeSuccess(false);

    try {
      await axios.post(`${API}/subscribe-alerts`, {
        email: email.trim(),
        latitude: location.lat,
        longitude: location.lon,
        zip_code: zipCode,
      });

      setSubscribeSuccess(true);
      setEmail('');
    } catch (err) {
      console.error('Subscribe error:', err);
      setSubscribeError(err.response?.data?.detail || 'Failed to subscribe. Please try again.');
    } finally {
      setSubscribeLoading(false);
    }
  };

  return (
    <div className="page-content" style={{ padding: '80px 40px', maxWidth: 900, margin: '0 auto' }}>
      
      {/* Header */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--ember-400)', fontFamily: 'var(--font-display)',
          fontWeight: 600, marginBottom: 8
        }}>
          For California Residents
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 42, letterSpacing: '-0.03em', marginBottom: 12
        }}>
          Citizen Risk Portal
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 600, margin: '0 auto' }}>
          Enter your zip code to check wildfire risk, view nearby active fires, and subscribe to emergency alerts.
        </p>
      </div>

      {/* Section 1: Risk Lookup */}
      <div className="glass-card" style={{ padding: 32, marginBottom: 24 }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
          marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--glass-border)'
        }}>
          🔍 Risk Lookup
        </h2>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <input
            type="text"
            className="input-field"
            placeholder="Enter California zip code (e.g., 95814)"
            value={zipCode}
            onChange={e => setZipCode(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleLookup()}
            style={{ flex: 1 }}
          />
          <button
            className="btn-primary"
            onClick={handleLookup}
            disabled={loading}
            style={{ padding: '12px 24px' }}
          >
            {loading ? <><span className="spinner" /> Checking...</> : '🔍 Lookup'}
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px', background: 'rgba(255,87,34,0.1)',
            border: '1px solid rgba(255,87,34,0.3)', borderRadius: 'var(--radius-sm)',
            color: '#ff5722', fontSize: 13, marginBottom: 16
          }}>
            {error}
          </div>
        )}

        {location && (
          <div style={{
            padding: '10px 14px', background: 'rgba(0,191,165,0.08)',
            border: '1px solid rgba(0,191,165,0.2)', borderRadius: 'var(--radius-sm)',
            fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16
          }}>
            📍 Location: {location.display_name}
          </div>
        )}

        {/* Risk Result Card */}
        {riskResult && (
          <div style={{
            background: RISK_COLORS[riskResult.risk_level]?.bg,
            border: `2px solid ${RISK_COLORS[riskResult.risk_level]?.border}`,
            borderRadius: 'var(--radius-lg)', padding: 24, marginTop: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  PREDICTED RISK LEVEL
                </div>
                <div style={{
                  fontSize: 36, fontWeight: 800, fontFamily: 'var(--font-display)',
                  color: RISK_COLORS[riskResult.risk_level]?.color, letterSpacing: '-0.02em'
                }}>
                  {riskResult.risk_level}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  CONFIDENCE
                </div>
                <div style={{
                  fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-display)',
                  color: RISK_COLORS[riskResult.risk_level]?.color
                }}>
                  {(riskResult.confidence * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            <div style={{
              padding: '12px 16px', background: 'rgba(255,255,255,0.05)',
              borderRadius: 'var(--radius-sm)', fontSize: 14, color: 'var(--text-secondary)',
              lineHeight: 1.6
            }}>
              {riskResult.message}
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16
            }}>
              <div style={{
                padding: '10px', background: 'rgba(255,255,255,0.03)',
                borderRadius: 'var(--radius-sm)', textAlign: 'center'
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Est. Acres
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                  {riskResult.acres_est?.toLocaleString() || '—'}
                </div>
              </div>
              <div style={{
                padding: '10px', background: 'rgba(255,255,255,0.03)',
                borderRadius: 'var(--radius-sm)', textAlign: 'center'
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Acres Range
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {riskResult.acres_range || '—'}
                </div>
              </div>
              <div style={{
                padding: '10px', background: 'rgba(255,255,255,0.03)',
                borderRadius: 'var(--radius-sm)', textAlign: 'center'
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Model
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>
                  {riskResult.model_name || 'ML'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Nearby Active Fires */}
      {location && (
        <div className="glass-card" style={{ padding: 32, marginBottom: 24 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
            marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--glass-border)'
          }}>
            🛰 Nearby Active Fires
          </h2>

          {nearbyFires.length === 0 ? (
            <div style={{
              padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)',
              fontSize: 14, lineHeight: 1.6
            }}>
              <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 12 }}>✅</div>
              <div>No active satellite detections within 50km of your location.</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>
                Data from NASA FIRMS (last 3 days)
              </div>
            </div>
          ) : (
            <>
              <div style={{
                padding: '10px 14px', background: 'rgba(255,87,34,0.1)',
                border: '1px solid rgba(255,87,34,0.25)', borderRadius: 'var(--radius-sm)',
                fontSize: 13, color: '#ff5722', marginBottom: 16
              }}>
                ⚠️ {nearbyFires.length} active fire{nearbyFires.length !== 1 ? 's' : ''} detected within 50km
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {nearbyFires.map((fire, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '14px 16px', background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
                      display: 'flex', alignItems: 'center', gap: 16
                    }}
                  >
                    <div style={{
                      width: 50, height: 50, borderRadius: '50%',
                      background: `rgba(255,87,34,0.15)`, border: '2px solid #ff5722',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, flexShrink: 0
                    }}>
                      🔥
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: '#ff5722', marginBottom: 4
                      }}>
                        {fire.distance.toFixed(1)} km away
                      </div>
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                        fontSize: 12, color: 'var(--text-secondary)'
                      }}>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Fire Power:</span>{' '}
                          <strong>{fire.frp} MW</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Detected:</span>{' '}
                          {fire.acq_date} {fire.acq_time.toString().replace(/(\d{2})(\d{2})/, '$1:$2')}
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Confidence:</span>{' '}
                          {fire.confidence}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Section 3: Alert Subscription */}
      {location && (
        <div className="glass-card" style={{ padding: 32 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
            marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--glass-border)'
          }}>
            🔔 Alert Subscription
          </h2>

          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
            Subscribe to receive email alerts when HIGH severity wildfires are detected within 50km of this location.
          </p>

          {subscribeSuccess ? (
            <div style={{
              padding: '16px 20px', background: 'rgba(0,191,85,0.12)',
              border: '1px solid rgba(0,191,85,0.25)', borderRadius: 'var(--radius-md)',
              color: '#00bf55', fontSize: 14, lineHeight: 1.6
            }}>
              ✅ <strong>Subscription successful!</strong><br />
              You will be alerted if a HIGH severity fire is detected within 50km of this location.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <input
                  type="email"
                  className="input-field"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSubscribe()}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-primary"
                  onClick={handleSubscribe}
                  disabled={subscribeLoading}
                  style={{ padding: '12px 24px' }}
                >
                  {subscribeLoading ? <><span className="spinner" /> Subscribing...</> : '🔔 Subscribe'}
                </button>
              </div>

              {subscribeError && (
                <div style={{
                  padding: '12px 16px', background: 'rgba(255,87,34,0.1)',
                  border: '1px solid rgba(255,87,34,0.3)', borderRadius: 'var(--radius-sm)',
                  color: '#ff5722', fontSize: 13
                }}>
                  {subscribeError}
                </div>
              )}

              <div style={{
                padding: '12px 16px', background: 'rgba(0,191,165,0.08)',
                border: '1px solid rgba(0,191,165,0.2)', borderRadius: 'var(--radius-sm)',
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6
              }}>
                📍 <strong>Subscribed Location:</strong> {location.display_name}<br />
                📮 <strong>Alert Radius:</strong> 50km<br />
                🔥 <strong>Alert Trigger:</strong> HIGH severity fires only
              </div>
            </>
          )}
        </div>
      )}

      {/* Initial state hint */}
      {!location && !loading && !error && (
        <div style={{
          textAlign: 'center', padding: '60px 40px',
          color: 'var(--text-muted)', fontSize: 14
        }}>
          <div style={{ fontSize: 64, opacity: 0.2, marginBottom: 16 }}>🔍</div>
          <div>Enter your California zip code above to get started</div>
        </div>
      )}
    </div>
  );
}
