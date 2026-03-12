import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import './ProfileCard.css';

const ANIM = { INIT_MS: 1200, INIT_X: 70, INIT_Y: 60, BETA_OFFSET: 20, ENTER_MS: 180 };
const clamp  = (v, mn = 0, mx = 100) => Math.min(Math.max(v, mn), mx);
const rnd    = (v, p = 3) => parseFloat(v.toFixed(p));
const adjust = (v, fMn, fMx, tMn, tMx) => rnd(tMn + ((tMx - tMn) * (v - fMn)) / (fMx - fMn));

export default function ProfileCard({
  avatarUrl = '', iconUrl = '', grainUrl = '',
  innerGradient, behindGlowEnabled = true, behindGlowColor, behindGlowSize,
  className = '', enableTilt = true, enableMobileTilt = false, mobileTiltSensitivity = 5,
  miniAvatarUrl, name = '', title = '', handle = '', status = 'Online',
  contactText = 'Contact', showUserInfo = true, onContactClick
}) {
  const wrapRef      = useRef(null);
  const shellRef     = useRef(null);
  const enterTimer   = useRef(null);
  const leaveRaf     = useRef(null);

  const engine = useMemo(() => {
    if (!enableTilt) return null;
    let raf = null, running = false, lastTs = 0;
    let cx = 0, cy = 0, tx = 0, ty = 0, initUntil = 0;

    const setVars = (x, y) => {
      const sh = shellRef.current, wr = wrapRef.current;
      if (!sh || !wr) return;
      const w = sh.clientWidth || 1, h = sh.clientHeight || 1;
      const px = clamp((100 / w) * x), py = clamp((100 / h) * y);
      const vars = {
        '--pc-pointer-x':        `${px}%`,
        '--pc-pointer-y':        `${py}%`,
        '--pc-background-x':     `${adjust(px, 0, 100, 35, 65)}%`,
        '--pc-background-y':     `${adjust(py, 0, 100, 35, 65)}%`,
        '--pc-pointer-from-center': `${clamp(Math.hypot(py-50, px-50)/50, 0, 1)}`,
        '--pc-pointer-from-top': `${py/100}`,
        '--pc-pointer-from-left':`${px/100}`,
        '--pc-rotate-x':         `${rnd(-((px-50)/5))}deg`,
        '--pc-rotate-y':         `${rnd((py-50)/4)}deg`,
      };
      for (const [k, v] of Object.entries(vars)) wr.style.setProperty(k, v);
    };

    const step = ts => {
      if (!running) return;
      if (!lastTs) lastTs = ts;
      const dt = (ts - lastTs) / 1000; lastTs = ts;
      const tau = ts < initUntil ? 0.6 : 0.14;
      const k = 1 - Math.exp(-dt / tau);
      cx += (tx - cx) * k; cy += (ty - cy) * k;
      setVars(cx, cy);
      if (Math.abs(tx-cx) > 0.05 || Math.abs(ty-cy) > 0.05 || document.hasFocus()) {
        raf = requestAnimationFrame(step);
      } else { running = false; lastTs = 0; cancelAnimationFrame(raf); raf = null; }
    };
    const start = () => { if (running) return; running = true; lastTs = 0; raf = requestAnimationFrame(step); };

    return {
      snap(x, y)       { cx = x; cy = y; setVars(cx, cy); },
      aim(x, y)        { tx = x; ty = y; start(); },
      center()         { const s = shellRef.current; if (s) this.aim(s.clientWidth/2, s.clientHeight/2); },
      initAnim(ms)     { initUntil = performance.now() + ms; start(); },
      pos()            { return { cx, cy, tx, ty }; },
      stop()           { if (raf) cancelAnimationFrame(raf); raf = null; running = false; lastTs = 0; },
    };
  }, [enableTilt]);

  const offs  = (e, el) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const onMove  = useCallback(e => { const s = shellRef.current; if (!s || !engine) return; const o = offs(e, s); engine.aim(o.x, o.y); }, [engine]);
  const onEnter = useCallback(e => {
    const s = shellRef.current; if (!s || !engine) return;
    s.classList.add('active', 'entering');
    clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => s.classList.remove('entering'), ANIM.ENTER_MS);
    const o = offs(e, s); engine.aim(o.x, o.y);
  }, [engine]);
  const onLeave = useCallback(() => {
    const s = shellRef.current; if (!s || !engine) return;
    engine.center();
    const check = () => {
      const { cx, cy, tx, ty } = engine.pos();
      if (Math.hypot(tx-cx, ty-cy) < 0.6) { s.classList.remove('active'); leaveRaf.current = null; }
      else leaveRaf.current = requestAnimationFrame(check);
    };
    cancelAnimationFrame(leaveRaf.current);
    leaveRaf.current = requestAnimationFrame(check);
  }, [engine]);
  const onOrient = useCallback(e => {
    const s = shellRef.current; if (!s || !engine) return;
    const { beta, gamma } = e; if (beta == null) return;
    engine.aim(
      clamp(s.clientWidth/2  + gamma * mobileTiltSensitivity, 0, s.clientWidth),
      clamp(s.clientHeight/2 + (beta - ANIM.BETA_OFFSET) * mobileTiltSensitivity, 0, s.clientHeight)
    );
  }, [engine, mobileTiltSensitivity]);

  useEffect(() => {
    if (!enableTilt || !engine) return;
    const s = shellRef.current; if (!s) return;
    s.addEventListener('pointerenter', onEnter);
    s.addEventListener('pointermove',  onMove);
    s.addEventListener('pointerleave', onLeave);
    const onClick = () => {
      if (!enableMobileTilt) return;
      if (window.DeviceMotionEvent?.requestPermission) {
        window.DeviceMotionEvent.requestPermission().then(st => { if (st === 'granted') window.addEventListener('deviceorientation', onOrient); });
      } else window.addEventListener('deviceorientation', onOrient);
    };
    s.addEventListener('click', onClick);
    engine.snap((s.clientWidth || 0) - ANIM.INIT_X, ANIM.INIT_Y);
    engine.center();
    engine.initAnim(ANIM.INIT_MS);
    return () => {
      s.removeEventListener('pointerenter', onEnter);
      s.removeEventListener('pointermove',  onMove);
      s.removeEventListener('pointerleave', onLeave);
      s.removeEventListener('click', onClick);
      window.removeEventListener('deviceorientation', onOrient);
      clearTimeout(enterTimer.current);
      cancelAnimationFrame(leaveRaf.current);
      engine.stop();
    };
  }, [enableTilt, enableMobileTilt, engine, onMove, onEnter, onLeave, onOrient]);

  const wrapStyle = {
    '--pc-icon':             iconUrl  ? `url(${iconUrl})`  : 'none',
    '--pc-grain':            grainUrl ? `url(${grainUrl})` : 'none',
    '--pc-inner-gradient':   innerGradient ?? 'linear-gradient(145deg,#60496e8c 0%,#71C4FF44 100%)',
    '--pc-behind-glow-color':behindGlowColor ?? 'rgba(125,190,255,0.67)',
    '--pc-behind-glow-size': behindGlowSize  ?? '50%',
  };

  const initial = (name || handle || '?')[0].toUpperCase();

  return (
    <div ref={wrapRef} className={`pc-card-wrapper ${className}`.trim()} style={wrapStyle}>
      {behindGlowEnabled && <div className="pc-behind" />}
      <div ref={shellRef} className="pc-card-shell">
        <section className="pc-card">
          <div className="pc-inside">
            <div className="pc-shine" />
            <div className="pc-glare" />

            {/* Аватар / заглушка */}
            <div className="pc-content pc-avatar-content">
              {avatarUrl
                ? <img className="avatar" src={avatarUrl} alt={name} loading="lazy" onError={e => e.target.style.display='none'} />
                : <div className="pc-avatar-placeholder">{initial}</div>
              }

              {showUserInfo && (
                <div className="pc-user-info">
                  <div className="pc-user-details">
                    <div className="pc-mini-avatar">
                      {(miniAvatarUrl || avatarUrl)
                        ? <img src={miniAvatarUrl || avatarUrl} alt="" loading="lazy" />
                        : <div className="pc-mini-avatar-placeholder">{initial}</div>
                      }
                    </div>
                    <div className="pc-user-text">
                      <div className="pc-handle">@{handle}</div>
                      <div className="pc-status">{status}</div>
                    </div>
                  </div>
                  <button className="pc-contact-btn" onClick={onContactClick} type="button" style={{ pointerEvents:'auto' }}>
                    {contactText}
                  </button>
                </div>
              )}
            </div>

            {/* Имя / подпись */}
            <div className="pc-content">
              <div className="pc-details">
                <h3>{name}</h3>
                <p>{title}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
