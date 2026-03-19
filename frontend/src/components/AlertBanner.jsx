import { useEffect, useRef } from 'react';

export default function AlertBanner({ result, onDismiss }) {
  const audioRef = useRef(null);

  /* play a short alarm tone using Web Audio API */
  useEffect(() => {
    if (!result?.alert) return;

    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const play = (freq, start, dur) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type      = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      play(880, 0,    0.18);
      play(660, 0.22, 0.18);
      play(880, 0.44, 0.18);
      audioRef.current = ctx;
    } catch (_) { /* browsers may block without user gesture */ }
  }, [result?.alert]);

  if (!result?.alert) return null;

  return (
    <div style={{
      animation: 'alarm-flash 1s ease-in-out infinite',
      border: '1px solid rgba(255,87,34,0.5)',
      borderRadius: 'var(--radius-md)',
      padding: '18px 22px',
      marginBottom: 24,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      position: 'relative',
    }}>
      {/* pulsing dot */}
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: 'var(--ember-500)', flexShrink: 0, marginTop: 3,
        animation: 'pulse-ember 1s infinite',
      }}/>

      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 15, color: 'var(--ember-400)', marginBottom: 4,
          letterSpacing: '0.03em',
        }}>
          🚨 CRITICAL WILDFIRE ALERT
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          Severity classified as <strong style={{ color: '#fff' }}>HIGH</strong> — deploy maximum resources immediately.
          Initiate evacuation procedures and request external support.
          Confidence: <strong style={{ color: 'var(--ember-300)' }}>{(result.confidence * 100).toFixed(1)}%</strong>
        </div>
      </div>

      {onDismiss && (
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0,
        }}>×</button>
      )}
    </div>
  );
}
