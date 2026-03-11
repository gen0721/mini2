import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useStore, api } from '../store'

export default function Layout({ children }) {
  const { user, setUser, logout } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('mn_token')
    if (token && !user) {
      api.get('/auth/me').then(r => setUser(r.data.user)).catch(() => localStorage.removeItem('mn_token'))
    }
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setMenuOpen(false), [location.pathname])

  const isActive = path => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <header style={{
        position:'sticky', top:0, zIndex:100,
        background: scrolled ? 'rgba(13,13,20,0.97)' : 'rgba(13,13,20,0.7)',
        backdropFilter:'blur(24px)',
        borderBottom:`1px solid ${scrolled ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
        transition:'all 0.3s', padding:'0 20px',
      }}>
        <div style={{ maxWidth:1200, margin:'0 auto', height:64, display:'flex', alignItems:'center', gap:16 }}>
          <Link to="/" style={{ display:'flex', alignItems:'center', gap:10, marginRight:8, flexShrink:0 }}>
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

          <nav style={{ display:'flex', alignItems:'center', gap:4, flex:1 }}>
            {[{ to:'/', label:'Главная' }, { to:'/catalog', label:'Каталог' }].map(n => (
              <Link key={n.to} to={n.to} style={{
                padding:'6px 14px', borderRadius:8, fontSize:14, fontWeight:500,
                color: isActive(n.to) ? 'var(--accent)' : 'var(--t2)',
                background: isActive(n.to) ? 'rgba(245,200,66,0.08)' : 'transparent',
                transition:'all 0.15s'
              }}>{n.label}</Link>
            ))}
          </nav>

          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
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
                    }}>
                      {(user.username || user.firstName || '?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize:13, fontWeight:600 }}>{user.username || user.firstName}</span>
                    <span style={{ color:'var(--accent)', fontSize:12, fontWeight:700 }}>${parseFloat(user.balance || 0).toFixed(2)}</span>
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
        </div>
      </header>

      <main style={{ flex:1 }}>{children}</main>

      <footer style={{ borderTop:'1px solid var(--border)', padding:'32px 20px', background:'var(--bg)' }}>
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
              { title:'Поддержка',   links:[{to:'/legal/rules',label:'Правила'},{to:'/legal/privacy',label:'Конф-ность'},{to:'/contacts',label:'Контакты'}] },
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
    </div>
  )
                                       }
