import { useState } from 'react';
import axios from 'axios';

const API = 'http://localhost:8000';

export default function SendAlert({ result }) {
  const [status,   setStatus]   = useState(null); // null | 'sending' | 'done' | 'error'
  const [response, setResponse] = useState(null);

  if (!result?.alert) return null; // only show on HIGH risk

  const handleSend = async () => {
    setStatus('sending');
    try {
      const { data } = await axios.post(`${API}/send-alert`, result.input_features
        ? {
            County:            parseInt(result.input_features.County),
            Latitude:          parseFloat(result.input_features.Latitude),
            Longitude:         parseFloat(result.input_features.Longitude),
            PercentContained:  parseFloat(result.input_features.PercentContained),
            PersonnelInvolved: parseInt(result.input_features.PersonnelInvolved),
            Engines:           parseInt(result.input_features.Engines),
            Helicopters:       parseInt(result.input_features.Helicopters),
            Dozers:            parseInt(result.input_features.Dozers),
            WaterTenders:      parseInt(result.input_features.WaterTenders),
            MajorIncident:     parseInt(result.input_features.MajorIncident),
          }
        : {}
      );
      setResponse(data.alerts);
      setStatus('done');
    } catch (err) {
      setStatus('error');
    }
  };

  const emailOk  = response?.email?.success;
  const smsOk    = response?.sms?.success;
  const emailSkip = response?.email?.skipped;
  const smsSkip   = response?.sms?.skipped;

  return (
    <div style={{
      marginTop: 16,
      padding: '16px 18px',
      background: 'rgba(255,87,34,0.06)',
      border: '1px solid rgba(255,87,34,0.25)',
      borderRadius: 'var(--radius-md)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
            Emergency Notification System
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
            Alert Authorities & Emergency Services
          </div>
        </div>
        <div style={{ fontSize: 20 }}>📡</div>
      </div>

      {/* Channel indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[
          { icon: '📧', label: 'Email', ok: emailOk, skip: emailSkip },
          { icon: '📱', label: 'SMS',   ok: smsOk,   skip: smsSkip   },
        ].map(ch => (
          <div key={ch.label} style={{
            flex: 1, padding: '8px 10px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${
              status === 'done'
                ? ch.ok   ? 'rgba(0,191,85,0.4)'
                : ch.skip ? 'rgba(255,193,7,0.3)'
                :           'rgba(255,87,34,0.3)'
                :           'var(--glass-border)'
            }`,
            borderRadius: 'var(--radius-sm)',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ fontSize: 14 }}>{ch.icon}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{ch.label}</div>
              <div style={{ fontSize: 10, color:
                status === 'done'
                  ? ch.ok   ? '#00bf55'
                  : ch.skip ? '#ffc107'
                  :           '#ff5722'
                  : 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                {status === null    ? 'ready'
                : status === 'sending' ? '...'
                : ch.ok   ? '✓ sent'
                : ch.skip ? '⚠ not configured'
                :           '✗ failed'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Send button */}
      {status !== 'done' && (
        <button
          onClick={handleSend}
          disabled={status === 'sending'}
          style={{
            width: '100%', padding: '11px',
            background: status === 'sending' ? 'rgba(255,87,34,0.2)' : 'var(--ember-500)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-display)', cursor: status === 'sending' ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'var(--transition)',
          }}
        >
          {status === 'sending'
            ? <><span className="spinner" style={{ width: 14, height: 14 }}/> Dispatching alerts...</>
            : '🚨 Send Emergency Alert Now'}
        </button>
      )}

      {/* Success summary */}
      {status === 'done' && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(0,191,85,0.08)',
          border: '1px solid rgba(0,191,85,0.25)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
        }}>
          <span style={{ color: '#00bf55', fontWeight: 600 }}>✓ Alerts dispatched. </span>
          {emailOk  && `Email sent to ${response.email.sent_to?.length} recipient(s). `}
          {smsOk    && `SMS sent to ${response.sms.sent_to?.length} number(s). `}
          {emailSkip && !emailOk && 'Email not configured — add GMAIL_SENDER to .env. '}
          {smsSkip   && !smsOk   && 'SMS not configured — add TWILIO credentials to .env.'}
        </div>
      )}

      {status === 'error' && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(255,87,34,0.08)',
          border: '1px solid rgba(255,87,34,0.25)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12, color: 'var(--ember-300)',
        }}>
          Failed to reach API. Is the server running on port 8000?
        </div>
      )}

      {/* Config hint */}
      {status === null && (
        <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
          Configure recipients in .env — ALERT_EMAILS and ALERT_PHONES · Only triggers on HIGH severity
        </div>
      )}
    </div>
  );
}
