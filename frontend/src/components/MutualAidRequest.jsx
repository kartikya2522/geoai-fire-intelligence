import { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

export default function MutualAidRequest({ result }) {
  const [status, setStatus] = useState(null); // null | 'generating' | 'done' | 'error'
  const [request, setRequest] = useState(null);
  const [copied, setCopied] = useState(false);

  // Auto-reset when result changes
  useEffect(() => {
    if (!result) return;
    const inputKey = JSON.stringify(result.input_features);
    setStatus(null);
    setRequest(null);
  }, [result?.input_features ? JSON.stringify(result.input_features) : null]);

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

  const handleCopy = async () => {
    const text = request?.request_text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    <div style={{ marginTop: 16, minHeight: 80 }}>

      {/* Header + Action buttons */}
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
              Mutual Aid Request Generator
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              NIMS ICS-213 formatted document for {result.risk_level} severity incident
            </div>
          </div>
        </div>

        {status === 'done' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCopy} style={{
              padding: '6px 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--glass-border)',
              background: copied ? 'rgba(0,191,85,0.1)' : 'transparent',
              color: copied ? '#00bf55' : 'var(--text-secondary)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
              transition: 'var(--transition)',
            }}>
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
            <button onClick={handleDownload} style={{
              padding: '6px 12px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              ⬇ Download
            </button>
            <button onClick={handleGenerate} style={{
              padding: '6px 12px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${riskColor}`,
              background: `${riskColor}14`,
              color: riskColor,
              fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              ↺ Regenerate
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={status === 'generating'}
            style={{
              padding: '9px 18px', borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: status === 'generating'
                ? `${riskColor}33`
                : `${riskColor}cc`,
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: status === 'generating' ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)',
              display: 'flex', alignItems: 'center', gap: 7,
              transition: 'var(--transition)', whiteSpace: 'nowrap',
            }}
          >
            {status === 'generating'
              ? <><span className="spinner" style={{ width: 13, height: 13 }}/> Generating...</>
              : '✦ Generate Request'}
          </button>
        )}
      </div>

      {/* Request output */}
      {status === 'done' && request && (
        <div style={{
          border: `1px solid ${riskColor}30`,
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-md) var(--radius-md)',
          overflow: 'hidden',
          maxHeight: 420,
          overflowY: 'auto',
        }}>
          <textarea
            readOnly
            value={request.request_text}
            style={{
              width: '100%',
              minHeight: 400,
              background: 'rgba(0,0,0,0.4)',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: 12,
              resize: 'none',
              lineHeight: 1.5,
            }}
          />
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div style={{
          marginTop: 8, padding: '10px 14px',
          background: 'rgba(255,87,34,0.08)',
          border: '1px solid rgba(255,87,34,0.2)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12, color: 'var(--ember-300)',
        }}>
          ⚠ Failed to generate mutual aid request. Please try again.
        </div>
      )}
    </div>
  );
}
