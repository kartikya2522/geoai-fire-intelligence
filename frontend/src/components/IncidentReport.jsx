import { useState } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

export default function IncidentReport({ result }) {
  const [status,  setStatus]  = useState(null); // null | 'generating' | 'done' | 'error'
  const [report,  setReport]  = useState(null);
  const [copied,  setCopied]  = useState(false);

  if (!result) return null;

  const handleGenerate = async () => {
    setStatus('generating');
    setReport(null);
    try {
      const payload = {
        County:            parseInt(result.input_features?.County           ?? 10),
        Latitude:          parseFloat(result.input_features?.Latitude        ?? 37.0),
        Longitude:         parseFloat(result.input_features?.Longitude       ?? -120.0),
        PercentContained:  parseFloat(result.input_features?.PercentContained ?? 50),
        PersonnelInvolved: parseInt(result.input_features?.PersonnelInvolved  ?? 50),
        Engines:           parseInt(result.input_features?.Engines            ?? 10),
        Helicopters:       parseInt(result.input_features?.Helicopters        ?? 2),
        Dozers:            parseInt(result.input_features?.Dozers             ?? 1),
        WaterTenders:      parseInt(result.input_features?.WaterTenders       ?? 3),
        MajorIncident:     parseInt(result.input_features?.MajorIncident      ?? 0),
      };
      const { data } = await axios.post(`${API}/generate-report`, payload);
      setReport(data.report);
      setStatus('done');
    } catch (err) {
      setStatus('error');
    }
  };

  const handleCopy = async () => {
    const text = report?.report_text;
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
      ta.style.opacity  = '0';
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
    const text = report?.report_text;
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `GeoAI-Incident-Report-${Date.now()}.txt`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <div style={{ marginTop: 16 }}>

      {/* Header + Generate button */}
      <div style={{
        padding: '14px 18px',
        background: 'rgba(139,92,246,0.06)',
        border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: status === 'done'
          ? 'var(--radius-md) var(--radius-md) 0 0'
          : 'var(--radius-md)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📄</span>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 600,
              fontSize: 13, color: 'var(--text-primary)',
            }}>
              AI Incident Report Generator
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Claude generates a formal report a fire chief would submit
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
              border: '1px solid rgba(139,92,246,0.3)',
              background: 'rgba(139,92,246,0.08)',
              color: '#a78bfa',
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
                ? 'rgba(139,92,246,0.2)'
                : 'rgba(139,92,246,0.8)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: status === 'generating' ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-display)',
              display: 'flex', alignItems: 'center', gap: 7,
              transition: 'var(--transition)', whiteSpace: 'nowrap',
            }}
          >
            {status === 'generating'
              ? <><span className="spinner" style={{ width: 13, height: 13 }}/> Generating...</>
              : '✦ Generate Report'}
          </button>
        )}
      </div>

      {/* Report output */}
      {status === 'done' && report?.report_html && (
        <div style={{
          border: '1px solid rgba(139,92,246,0.2)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius-md) var(--radius-md)',
          overflow: 'hidden',
          maxHeight: 420,
          overflowY: 'auto',
        }}>
          <div
            dangerouslySetInnerHTML={{ __html: report.report_html }}
            style={{ fontSize: 13 }}
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
          Failed to generate report. Make sure ANTHROPIC_API_KEY is set in .env and uvicorn is restarted.
        </div>
      )}
    </div>
  );
}
