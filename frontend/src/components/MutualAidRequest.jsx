import { useState } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

export default function MutualAidRequest({ result }) {
  const [status, setStatus] = useState(null); // null | 'generating' | 'done' | 'error'
  const [request, setRequest] = useState(null);

  if (!result) return null;

  // Only show for HIGH or MEDIUM risk
  if (result.risk_level !== 'HIGH' && result.risk_level !== 'MEDIUM') return null;

  const handleGenerate = async () => {
    setStatus('generating');
    setRequest(null);
    try {
      const params = {
        risk_level: result.risk_level,
        acres_est: result.acres_est || 1000,
        county: 'California',
        personnel: parseInt(result.input_features?.PersonnelInvolved || 0),
        engines: parseInt(result.input_features?.Engines || 0),
        helicopters: parseInt(result.input_features?.Helicopters || 0),
        incident_id: result.incident_id || undefined,
      };
      const { data } = await axios.get(`${API}/mutual-aid-request`, { params });
      setRequest(data);
      setStatus('done');
    } catch (err) {
      setStatus('error');
      console.error('Mutual aid request generation failed:', err);
    }
  };

  const handleDownload = () => {
    const text = request?.request_text;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MutualAid-${request.incident_id || 'Request'}.txt`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const riskColor = result.risk_level === 'HIGH' ? '#ff5722' : '#ffc107';

  return (
    <div style={{ marginTop: 20 }}>
      {/* Header + Generate button */}
      <div style={{
        padding: '14px 18px',
        background: `${riskColor}12`,
        border: `1px solid ${riskColor}30`,
        borderRadius: status === 'done'
          ? 'var(--radius-md) var(--radius-md) 0 0'
          : 'var(--radius-md)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: 13, color: 'var(--text-primary)',
            }}>
              Generate Mutual Aid Request
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              NIMS ICS-213 formatted document for {result.risk_level} severity incident
            </div>
          </div>
        </div>

        {status === null && (
          <button onClick={handleGenerate} className="btn-primary" style={{
            padding: '7px 16px', fontSize: 12, flexShrink: 0,
          }}>
            Generate Request
          </button>
        )}

        {status === 'generating' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" style={{ width: 14, height: 14 }}/>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Generating...</span>
          </div>
        )}
      </div>

      {/* Request output */}
      {status === 'done' && request && (
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          border: `1px solid ${riskColor}30`,
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-md) var(--radius-md)',
          padding: 16,
        }}>
          <textarea
            readOnly
            value={request.request_text}
            style={{
              width: '100%',
              minHeight: 400,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: 12,
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={handleDownload} className="btn-primary" style={{
              padding: '8px 16px', fontSize: 12,
            }}>
              ⬇ Download .txt
            </button>
            <div style={{
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>Incident ID: <strong style={{ color: 'var(--text-secondary)' }}>{request.incident_id}</strong></span>
              {request.resource_gaps && (
                <>
                  <span>•</span>
                  <span>Gaps: Personnel +{request.resource_gaps.personnel}, Engines +{request.resource_gaps.engines}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          background: 'rgba(220,38,38,0.1)',
          border: '1px solid rgba(220,38,38,0.3)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-md) var(--radius-md)',
          padding: 14,
          color: '#ff5555',
          fontSize: 12,
        }}>
          ⚠ Failed to generate mutual aid request. Please try again.
        </div>
      )}
    </div>
  );
}
