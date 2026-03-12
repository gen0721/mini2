import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useStore, api } from '../store'

// ── Иконки для нижней навигации ────────────────────────────────────────────────
const IconHome    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconGrid    = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
const IconPlus    = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconDeals   = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
const IconProfile = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>

export default function Layout({ children }) {
  const { user, setUser, logout, refreshUser } = useStore()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [scrolled,   setScrolled]   = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('mn_token')
    if (token && !user) {
      api.get('/auth/me').then(r => setUser(r.data.user || r.data)).catch(() => localStorage.removeItem('mn_token'))
    } else if (token && user) {
      // Обновляем баланс сразу при загрузке
      refreshUser()
    }
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)

    // Обновляем баланс каждые 30 секунд
    const interval = setInterval(() => { refreshUser() }, 30000)

    return () => {
      window.removeEventListener('scroll', onScroll)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    setMenuOpen(false)
    setMobileMenu(false)
  }, [location.pathname])

  // Закрывать мобильное меню по ESC
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setMobileMenu(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Блокировать скролл когда открыто мобильное меню
  useEffect(() => {
    document.body.style.overflow = mobileMenu ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenu])

  const isActive = useCallback(path =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  , [location.pathname])

  const avatar = (user?.username || user?.firstName || '?')[0].toUpperCase()

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: scrolled ? 'rgba(13,13,20,0.97)' : 'rgba(13,13,20,0.7)',
        backdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${scrolled ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
        transition: 'all 0.3s', padding: '0 20px',
      }}>
        <div style={{ maxWidth:1200, margin:'0 auto', height:64, display:'flex', alignItems:'center', gap:12 }}>

          {/* Logo */}
          <Link to="/" style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{
              width:36, height:36, borderRadius:10,
              background:'linear-gradient(135deg, #f5c842, #e8500a)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:20, boxShadow:'0 4px 16px rgba(245,200,66,0.4)'
            }}>🟡</div>
            <span style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:18, letterSpacing:'-0.02em' }}>
              Minions<span style={{ color:'var(--accent)' }}>.</span>Market
            </span>
          </Link>

          {/* Desktop nav */}
          <nav style={{ display:'flex', alignItems:'center', gap:4, flex:1, marginLeft:8 }} className="desktop-nav">
            {[{ to:'/', label:'Главная' }, { to:'/catalog', label:'Каталог' }].map(n => (
              <Link key={n.to} to={n.to} style={{
                padding:'6px 14px', borderRadius:8, fontSize:14, fontWeight:500,
                color: isActive(n.to) ? 'var(--accent)' : 'var(--t2)',
                background: isActive(n.to) ? 'rgba(245,200,66,0.08)' : 'transparent',
                transition:'all 0.15s'
              }}>{n.label}</Link>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }} className="desktop-actions">
            {user ? (
              <>
                <Link to="/sell" className="btn btn-sm btn-secondary">+ Продать</Link>
                <div style={{ position:'relative' }}>
                  <button onClick={() => setMenuOpen(!menuOpen)} style={{
                    display:'flex', alignItems:'center', gap:8, padding:'6px 12px',
                    background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10,
                    cursor:'pointer', color:'var(--t1)',
                  }}>
                    <div style={{
                      width:28, height:28, borderRadius:8,
                      background:'linear-gradient(135deg,var(--purple),var(--accent))',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:12, fontWeight:700, fontFamily:'var(--font-h)', flexShrink:0
                    }}>{avatar}</div>
                    <span style={{ fontSize:13, fontWeight:600 }}>{user.username || user.firstName}</span>
                    <span style={{ color:'var(--accent)', fontSize:12, fontWeight:700 }}>${parseFloat(user.balance||0).toFixed(2)}</span>
                  </button>

                  {menuOpen && (
                    <div onClick={() => setMenuOpen(false)} style={{ position:'fixed', inset:0, zIndex:50 }}>
                      <div onClick={e => e.stopPropagation()} style={{
                        position:'absolute', top:'calc(100% + 8px)', right:0,
                        background:'var(--bg2)', border:'1px solid var(--border)',
                        borderRadius:20, padding:8, minWidth:190,
                        boxShadow:'0 16px 48px rgba(0,0,0,0.6)', zIndex:51,
                        animation:'fadeUp 0.2s ease'
                      }}>
                        {[
                          { to:'/profile', icon:'👤', label:'Профиль' },
                          { to:'/wallet',  icon:'💰', label:'Кошелёк' },
                          { to:'/deals',   icon:'🤝', label:'Сделки' },
                        ].map(item => (
                          <Link key={item.to} to={item.to} style={{
                            display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                            borderRadius:10, color:'var(--t2)', fontSize:14,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background='var(--bg3)'; e.currentTarget.style.color='var(--t1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='var(--t2)' }}>
                            <span>{item.icon}</span> {item.label}
                          </Link>
                        ))}
                        {(user.isAdmin || user.isSubAdmin) && (
                          <Link to="/admin" style={{
                            display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                            borderRadius:10, color:'var(--accent)', fontSize:14
                          }}>
                            <span>⚡</span> Админка
                          </Link>
                        )}
                        <div style={{ height:1, background:'var(--border)', margin:'4px 0' }}/>
                        <button onClick={() => { logout(); navigate('/') }} style={{
                          display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                          borderRadius:10, color:'var(--red)', fontSize:14, background:'transparent',
                          border:'none', cursor:'pointer', width:'100%', textAlign:'left'
                        }}>
                          <span>→</span> Выйти
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/auth" className="btn btn-sm btn-ghost">Войти</Link>
                <Link to="/auth?mode=register" className="btn btn-sm btn-primary">Регистрация</Link>
              </>
            )}
          </div>

          {/* Mobile: balance + burger */}
          <div style={{ display:'none', alignItems:'center', gap:10, marginLeft:'auto' }} className="mobile-header-right">
            {user && (
              <div style={{
                display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
                background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10,
                fontSize:13, fontWeight:700, color:'var(--accent)', fontFamily:'var(--font-h)'
              }}>
                💰 ${parseFloat(user.balance||0).toFixed(2)}
              </div>
            )}
            <button
              onClick={() => setMobileMenu(true)}
              style={{
                width:40, height:40, borderRadius:10, background:'var(--bg3)',
                border:'1px solid var(--border)', display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', gap:5, cursor:'pointer',
              }}
              aria-label="Меню"
            >
              <span style={{ width:18, height:2, background:'var(--t1)', borderRadius:2, display:'block', transition:'all 0.2s' }}/>
              <span style={{ width:18, height:2, background:'var(--t1)', borderRadius:2, display:'block', transition:'all 0.2s' }}/>
              <span style={{ width:12, height:2, background:'var(--t1)', borderRadius:2, display:'block', transition:'all 0.2s', marginLeft:-6 }}/>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Sidebar Menu ───────────────────────────────────────────────── */}
      {mobileMenu && (
        <>
          {/* Backdrop */}
          <div onClick={() => setMobileMenu(false)} style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
            backdropFilter:'blur(8px)', zIndex:200, animation:'fadeIn 0.2s ease'
          }}/>
          {/* Drawer */}
          <div style={{
            position:'fixed', top:0, right:0, bottom:0, width:'min(320px, 85vw)',
            background:'var(--bg2)', borderLeft:'1px solid var(--border)',
            zIndex:201, display:'flex', flexDirection:'column',
            animation:'slideIn 0.25s ease', overflowY:'auto',
          }}>
            {/* Drawer header */}
            <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:16 }}>
                🟡 Minions<span style={{ color:'var(--accent)' }}>.</span>Market
              </span>
              <button onClick={() => setMobileMenu(false)} style={{
                width:36, height:36, borderRadius:8, background:'var(--bg3)',
                border:'1px solid var(--border)', cursor:'pointer', color:'var(--t2)',
                fontSize:18, display:'flex', alignItems:'center', justifyContent:'center'
              }}>✕</button>
            </div>

            {/* User info */}
            {user && (
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg3)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{
                    width:44, height:44, borderRadius:12,
                    background:'linear-gradient(135deg,var(--purple),var(--accent))',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:18, fontWeight:700, fontFamily:'var(--font-h)'
                  }}>{avatar}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>@{user.username || user.firstName}</div>
                    <div style={{ color:'var(--accent)', fontSize:13, fontWeight:700 }}>
                      ${parseFloat(user.balance||0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Nav links */}
            <div style={{ padding:'12px 12px', flex:1 }}>
              {[
                { to:'/',        icon:'🏠', label:'Главная' },
                { to:'/catalog', icon:'🛍', label:'Каталог' },
                ...(user ? [
                  { to:'/sell',    icon:'➕', label:'Продать' },
                  { to:'/deals',   icon:'🤝', label:'Мои сделки' },
                  { to:'/wallet',  icon:'💰', label:'Кошелёк' },
                  { to:'/profile', icon:'👤', label:'Профиль' },
                ] : []),
                { to:'/legal/rules',    icon:'📋', label:'Правила' },
                { to:'/legal/refund',   icon:'↩',  label:'Возврат' },
                { to:'/legal/contacts', icon:'📬', label:'Контакты' },
              ].map(item => (
                <Link key={item.to} to={item.to} style={{
                  display:'flex', alignItems:'center', gap:14, padding:'13px 12px',
                  borderRadius:12, color: isActive(item.to) ? 'var(--t1)' : 'var(--t2)',
                  background: isActive(item.to) ? 'rgba(245,200,66,0.08)' : 'transparent',
                  fontSize:15, fontWeight: isActive(item.to) ? 600 : 400,
                  marginBottom:2, transition:'all 0.15s',
                }}>
                  <span style={{ fontSize:20, width:24, textAlign:'center' }}>{item.icon}</span>
                  {item.label}
                  {isActive(item.to) && <span style={{ marginLeft:'auto', color:'var(--accent)', fontSize:12 }}>●</span>}
                </Link>
              ))}

              {(user?.isAdmin || user?.isSubAdmin) && (
                <Link to="/admin" style={{
                  display:'flex', alignItems:'center', gap:14, padding:'13px 12px',
                  borderRadius:12, color:'var(--accent)', fontSize:15, fontWeight:600,
                  background:'rgba(245,200,66,0.06)', marginTop:8,
                }}>
                  <span style={{ fontSize:20, width:24, textAlign:'center' }}>⚡</span>
                  Админ панель
                </Link>
              )}
            </div>

            {/* Bottom actions */}
            <div style={{ padding:'12px 20px 24px', borderTop:'1px solid var(--border)' }}>
              {user ? (
                <button onClick={() => { logout(); navigate('/'); setMobileMenu(false) }} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'13px 16px',
                  borderRadius:12, color:'var(--red)', fontSize:15, background:'rgba(231,76,60,0.08)',
                  border:'1px solid rgba(231,76,60,0.2)', cursor:'pointer', width:'100%',
                }}>
                  <span>→</span> Выйти
                </button>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <Link to="/auth" className="btn btn-ghost btn-full">Войти</Link>
                  <Link to="/auth?mode=register" className="btn btn-primary btn-full">Регистрация</Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main style={{ flex:1 }}>{children}</main>

      {/* ── Footer (desktop) ─────────────────────────────────────────────────── */}
      <footer style={{ borderTop:'1px solid var(--border)', padding:'32px 20px', background:'var(--bg)' }} className="desktop-footer">
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:40, marginBottom:32 }}>
            <div>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:18, marginBottom:12 }}>
                🟡 Minions<span style={{ color:'var(--accent)' }}>.</span>Market
              </div>
              <p style={{ color:'var(--t3)', fontSize:13, lineHeight:1.7, maxWidth:280 }}>
                Безопасный маркетплейс цифровых товаров. Все сделки через систему гаранта.
              </p>
            </div>
            {[
              { title:'Маркетплейс', links:[{to:'/catalog',label:'Каталог'},{to:'/sell',label:'Продать'},{to:'/deals',label:'Сделки'}] },
              { title:'Поддержка',   links:[{to:'/legal/rules',label:'Правила'},{to:'/legal/refund',label:'Возврат'},{to:'/legal/privacy',label:'Конфиденциальность'},{to:'/legal/contacts',label:'Контакты'}] },
              { title:'Аккаунт',     links:[{to:'/auth',label:'Войти'},{to:'/wallet',label:'Кошелёк'},{to:'/profile',label:'Профиль'}] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:12, color:'var(--t3)', letterSpacing:'0.12em', marginBottom:14 }}>{col.title.toUpperCase()}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {col.links.map(l => (
                    <Link key={l.to} to={l.to} style={{ color:'var(--t2)', fontSize:13 }}
                      onMouseEnter={e => e.target.style.color='var(--t1)'}
                      onMouseLeave={e => e.target.style.color='var(--t2)'}>{l.label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid var(--border)', paddingTop:20, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <span style={{ color:'var(--t4)', fontSize:12 }}>© 2025 Minions Market.</span>
            <span style={{ color:'var(--t4)', fontSize:12 }}>Комиссия платформы 5%</span>
          </div>
        </div>
      </footer>

      {/* ── Mobile footer (simple) ────────────────────────────────────────────── */}
      <footer style={{ borderTop:'1px solid var(--border)', padding:'20px 16px', background:'var(--bg)', textAlign:'center' }} className="mobile-footer">
        <div style={{ color:'var(--t4)', fontSize:12, marginBottom:10 }}>© 2025 Minions Market · Комиссия 5%</div>
        <div style={{ display:'flex', justifyContent:'center', gap:16, flexWrap:'wrap' }}>
          {[{to:'/legal/rules',l:'Правила'},{to:'/legal/privacy',l:'Конфид.'},{to:'/legal/contacts',l:'Контакты'}].map(x => (
            <Link key={x.to} to={x.to} style={{ color:'var(--t3)', fontSize:12 }}>{x.l}</Link>
          ))}
        </div>
      </footer>

      {/* ── Mobile bottom navigation ──────────────────────────────────────────── */}
      <nav className="mobile-bottom-nav" style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:90,
        background:'rgba(13,13,20,0.97)', backdropFilter:'blur(20px)',
        borderTop:'1px solid var(--border)',
        display:'none', alignItems:'center',
        paddingBottom:'env(safe-area-inset-bottom)',
        height:'calc(var(--bot-nav) + env(safe-area-inset-bottom))',
      }}>
        {[
          { to:'/',        icon:<IconHome/>,    label:'Главная' },
          { to:'/catalog', icon:<IconGrid/>,    label:'Каталог' },
          { to:'/sell',    icon:<IconPlus/>,    label:'Продать', center:true },
          { to:'/deals',   icon:<IconDeals/>,   label:'Сделки' },
          { to: user ? '/profile' : '/auth', icon:<IconProfile/>, label: user ? 'Профиль' : 'Войти' },
        ].map(item => (
          <Link key={item.to} to={item.to} style={{
            flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:3, padding:'8px 0', textDecoration:'none',
            color: isActive(item.to) ? 'var(--accent)' : 'var(--t3)',
            transition:'color 0.15s', position:'relative',
          }}>
            {item.center ? (
              <div style={{
                width:48, height:48, borderRadius:16,
                background:'linear-gradient(135deg, var(--accent), var(--accent2))',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'#0d0d14', marginTop:-16,
                boxShadow:'0 4px 20px rgba(245,200,66,0.5)',
              }}>
                {item.icon}
              </div>
            ) : (
              <>
                {item.icon}
                <span style={{ fontSize:10, fontWeight:600, fontFamily:'var(--font-h)' }}>{item.label}</span>
                {isActive(item.to) && (
                  <span style={{
                    position:'absolute', bottom:4, width:4, height:4,
                    borderRadius:'50%', background:'var(--accent)',
                  }}/>
                )}
              </>
            )}
          </Link>
        ))}
      </nav>

      {/* ── Responsive CSS ────────────────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav    { display: none !important; }
          .desktop-actions { display: none !important; }
          .mobile-header-right { display: flex !important; }
          .mobile-bottom-nav { display: flex !important; }
          .desktop-footer { display: none !important; }
          .mobile-footer  { display: block !important; }
        }
        @media (min-width: 769px) {
          .mobile-footer  { display: none !important; }
          .desktop-footer { display: block !important; }
        }
      `}</style>
    </div>
  )
}
