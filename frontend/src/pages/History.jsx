import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import PredictionHistory from '../components/PredictionHistory';

export default function History() {
  const headerRef = useRef(null);

  useEffect(() => {
    gsap.fromTo(headerRef.current,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
    );
  }, []);

  return (
    <div className="page-content">
      <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div ref={headerRef} style={{ marginBottom: 32, opacity: 0 }}>
          <div style={{
            fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--ember-400)', fontFamily: 'var(--font-display)',
            fontWeight: 600, marginBottom: 8,
          }}>
            Prediction Intelligence
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: 32, letterSpacing: '-0.03em', marginBottom: 6,
          }}>
            Prediction History
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Every severity prediction logged — timestamped, trackable, auditable.
            Full audit trail for incident commanders and environmental agencies.
          </p>
        </div>

        {/* History component */}
        <PredictionHistory />

      </div>
    </div>
  );
}
