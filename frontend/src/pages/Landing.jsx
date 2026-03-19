import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/* ── Ember canvas ─────────────────────────────────────────────── */
function EmberCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const embers = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth, y: window.innerHeight + Math.random() * 200,
      r: Math.random() * 2.4 + 0.4, speed: Math.random() * 0.9 + 0.3,
      drift: (Math.random() - 0.5) * 0.45, alpha: Math.random() * 0.5 + 0.15,
      hue: Math.random() * 30 + 10,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      embers.forEach(e => {
        e.y -= e.speed; e.x += e.drift; e.alpha -= 0.0007;
        if (e.y < -10 || e.alpha <= 0) { e.x = Math.random() * canvas.width; e.y = canvas.height + 10; e.alpha = Math.random() * 0.5 + 0.15; }
        ctx.save(); ctx.globalAlpha = e.alpha; ctx.fillStyle = `hsl(${e.hue},100%,60%)`; ctx.shadowColor = `hsl(${e.hue},100%,60%)`; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, opacity: 0.7 }}/>;
}

/* ── Animated counter card ────────────────────────────────────── */
function AnimatedStat({ number, unit, label, delay = 0 }) {
  const numRef  = useRef(null);
  const cardRef = useRef(null);
  useEffect(() => {
    gsap.fromTo(cardRef.current,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', delay,
        scrollTrigger: { trigger: cardRef.current, start: 'top 85%', toggleActions: 'play none none none' } }
    );
    const rawNum = parseFloat(String(number).replace(/[^0-9.]/g, ''));
    const isFloat = String(number).includes('.');
    if (!isNaN(rawNum) && numRef.current) {
      const obj = { val: 0 };
      gsap.to(obj, {
        val: rawNum, duration: 2.2, ease: 'power2.out', delay,
        scrollTrigger: { trigger: cardRef.current, start: 'top 85%', toggleActions: 'play none none none' },
        onUpdate() { if (numRef.current) numRef.current.textContent = isFloat ? obj.val.toFixed(1) : Math.round(obj.val).toString(); },
      });
    }
  }, [number, delay]);
  return (
    <div ref={cardRef} className="glass-card" style={{ padding: '28px 24px', opacity: 0, borderTop: '2px solid var(--ember-500)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
      <div className="stat-num" style={{ fontSize: 42, color: '#fff', marginBottom: 4 }}>
        <span ref={numRef}>0</span>
        <span style={{ fontSize: 22, color: 'var(--ember-400)' }}>{unit}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{label}</div>
    </div>
  );
}

/* ── How it works step ────────────────────────────────────────── */
function Step({ n, title, desc, delay = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    gsap.fromTo(ref.current,
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.55, ease: 'power2.out', delay,
        scrollTrigger: { trigger: ref.current, start: 'top 88%', toggleActions: 'play none none none' } }
    );
  }, [delay]);
  return (
    <div ref={ref} style={{ display: 'flex', gap: 20, opacity: 0, padding: '20px 0', borderBottom: '1px solid var(--glass-border)' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: 'var(--ember-glow)', border: '1px solid rgba(255,87,34,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ember-400)', fontSize: 14 }}>{n}</div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{title}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function Landing() {
  const navigate    = useNavigate();
  const eyebrowRef  = useRef(null);
  const line1Ref    = useRef(null);
  const line2Ref    = useRef(null);
  const subRef      = useRef(null);
  const ctaRef      = useRef(null);
  const scrollRef   = useRef(null);
  const crisisRef   = useRef(null);
  const psRef       = useRef(null);
  const techRef     = useRef(null);
  const finalRef    = useRef(null);

  useEffect(() => {
    /* Hero entrance */
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo(eyebrowRef.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, 0.3)
      .fromTo(line1Ref.current,   { opacity: 0, y: 48, skewY: 2 }, { opacity: 1, y: 0, skewY: 0, duration: 0.9 }, 0.55)
      .fromTo(line2Ref.current,   { opacity: 0, y: 48, skewY: 2 }, { opacity: 1, y: 0, skewY: 0, duration: 0.9 }, 0.72)
      .fromTo(subRef.current,     { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7 }, 1.0)
      .fromTo(ctaRef.current,     { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, 1.2)
      .fromTo(scrollRef.current,  { opacity: 0 },        { opacity: 1, duration: 0.8 }, 1.6);

    /* Crisis heading */
    ScrollTrigger.create({
      trigger: crisisRef.current, start: 'top 80%',
      onEnter: () => gsap.fromTo(crisisRef.current, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }),
    });

    /* PS text */
    ScrollTrigger.create({
      trigger: psRef.current, start: 'top 80%',
      onEnter: () => gsap.fromTo(psRef.current.querySelectorAll('.ps-el'),
        { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.14, ease: 'power2.out' }),
    });

    /* Tech strip */
    ScrollTrigger.create({
      trigger: techRef.current, start: 'top 90%',
      onEnter: () => gsap.fromTo(techRef.current.querySelectorAll('span'),
        { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out' }),
    });

    /* Final CTA */
    ScrollTrigger.create({
      trigger: finalRef.current, start: 'top 85%',
      onEnter: () => gsap.fromTo(Array.from(finalRef.current.children),
        { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out' }),
    });

    return () => ScrollTrigger.getAll().forEach(t => t.kill());
  }, []);

  return (
    <div className="page-content" style={{ position: 'relative' }}>
      <EmberCanvas />

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center', padding: '80px 24px 60px', position: 'relative', zIndex: 1 }}>
        <div ref={eyebrowRef} style={{ opacity: 0, marginBottom: 24 }}>
          <div className="badge badge-high" style={{ display: 'inline-flex' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ember-500)', display: 'inline-block', animation: 'pulse-ember 1.8s infinite' }}/>
            GeoAI Early Warning System
          </div>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, lineHeight: 0.95, letterSpacing: '-0.04em', marginBottom: 24, maxWidth: 900, fontSize: 'clamp(48px, 8vw, 96px)' }}>
          <div ref={line1Ref} style={{ opacity: 0, display: 'block' }}>Wildfires don't wait.</div>
          <div ref={line2Ref} style={{ opacity: 0, display: 'block', color: 'var(--ember-500)' }}>Neither should we.</div>
        </h1>
        <p ref={subRef} style={{ opacity: 0, fontSize: 18, color: 'var(--text-secondary)', maxWidth: 560, lineHeight: 1.7, marginBottom: 40 }}>
          A machine learning–powered decision support system that predicts wildfire severity, classifies risk, and alerts response teams before fires spiral out of control.
        </p>
        <div ref={ctaRef} style={{ opacity: 0, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn-primary" onClick={() => navigate('/dashboard')}>
            Launch Predictor
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button className="btn-ghost" onClick={() => navigate('/analytics')}>View Analytics</button>
        </div>
        <div ref={scrollRef} style={{ opacity: 0, position: 'absolute', bottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-display)' }}>
          <span>Scroll to learn more</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
      </section>

      {/* CRISIS STATS */}
      <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div ref={crisisRef} style={{ opacity: 0, marginBottom: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ember-400)', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 12 }}>The Crisis Is Real</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Every year, wildfire destroys more.<br/>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>The data demands a smarter response.</span>
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          <AnimatedStat number="10.3" unit="M"   label="Acres burned in California's worst fire season (2020)" delay={0} />
          <AnimatedStat number="33"   unit=""    label="People killed in the 2018 Camp Fire alone" delay={0.15} />
          <AnimatedStat number="150"  unit="B+"  label="Economic damage from US wildfires per year (USD)" delay={0.3} />
          <AnimatedStat number="72"   unit="hrs" label="Critical early-response window before fires become uncontrollable" delay={0.45} />
        </div>
      </section>

      {/* PROBLEM STATEMENT */}
      <section ref={psRef} style={{ padding: '60px 40px 80px', maxWidth: 1100, margin: '0 auto', position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <div className="ps-el" style={{ opacity: 0, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ember-400)', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 12 }}>Why We Built This</div>
          <h2 className="ps-el" style={{ opacity: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 20 }}>
            Firefighters make life-or-death decisions with incomplete information.
          </h2>
          <p className="ps-el" style={{ opacity: 0, color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: 15, marginBottom: 16 }}>
            When a fire is reported, incident commanders must instantly decide: how many engines to dispatch, whether to call for aerial support, whether to trigger evacuation. These decisions are made under extreme time pressure, often with incomplete situational data.
          </p>
          <p className="ps-el" style={{ opacity: 0, color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: 15, marginBottom: 16 }}>
            A wrong call in the first 72 hours can be the difference between a contained incident and a catastrophic megafire. Resources sent too late are useless. Resources over-committed elsewhere leave other areas exposed.
          </p>
          <p className="ps-el" style={{ opacity: 0, color: 'var(--text-primary)', lineHeight: 1.75, fontSize: 15, fontWeight: 500 }}>
            GeoAI Forest Fire Risk Intelligence gives commanders an instant, data-driven severity prediction — so the right resources reach the right place before the window closes.
          </p>
        </div>
        <div className="glass-card" style={{ padding: '32px 28px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 20 }}>How It Works</div>
          <Step n={1} title="Enter Incident Parameters"   desc="Location, containment %, deployed resources — 10 inputs, under 60 seconds." delay={0} />
          <Step n={2} title="ML Model Analyses the Fire"  desc="Gradient Boosting classifier trained on 1,636 California incidents predicts severity." delay={0.1} />
          <Step n={3} title="Risk Level Classified"       desc="Output is LOW / MEDIUM / HIGH with confidence score and probability breakdown." delay={0.2} />
          <Step n={4} title="Alarm Triggered if Critical" desc="HIGH severity fires trigger an immediate alert with recommended emergency actions." delay={0.3} />
          <div style={{ paddingTop: 8 }}>
            <Step n={5} title="Allocate Resources" desc="Commanders dispatch the right assets before the fire escalates." delay={0.4} />
          </div>
        </div>
      </section>

      {/* TECH STRIP */}
      <section ref={techRef} style={{ borderTop: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)', padding: '28px 40px', display: 'flex', gap: 40, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1, background: 'rgba(13,17,23,0.5)' }}>
        {['Gradient Boosting', 'XGBoost', 'Random Forest', 'SMOTE Balancing', 'FastAPI', 'React 19', 'Leaflet Maps', 'Chart.js'].map(t => (
          <span key={t} style={{ opacity: 0, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t}</span>
        ))}
      </section>

      {/* FINAL CTA */}
      <section ref={finalRef} style={{ padding: '100px 40px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <h2 style={{ opacity: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 20, lineHeight: 1.05 }}>
          Ready to predict the next fire?
        </h2>
        <p style={{ opacity: 0, color: 'var(--text-secondary)', marginBottom: 36, fontSize: 16 }}>
          Enter incident parameters and get a severity classification in under a second.
        </p>
        <button style={{ opacity: 0 }} className="btn-primary" onClick={() => navigate('/dashboard')}>
          Open Prediction Dashboard
        </button>
      </section>
    </div>
  );
}
