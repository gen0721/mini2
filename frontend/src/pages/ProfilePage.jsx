import React, { useState, useEffect, Component } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'
import ProductCard from '../components/ProductCard'
import ProfileCard from '../components/ProfileCard/ProfileCard'

class ErrorBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

const StarRating = ({ value }) => (
  <div style={{ display:'flex', gap:4 }}>
    {[1,2,3,4,5].map(s => (
      <span key={s} style={{ fontSize:16, color: s <= value ? 'var(--accent)' : 'var(--bg4)' }}>★</span>
    ))}
  </div>
)

export default function ProfilePage() {
  const { id } = useParams()
  const { user: me, hydrated } = useStore()
  const navigate = useNavigate()
  const [profile, setProfile]   = useState(null)
  const [products, setProducts] = useState([])
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('products')

  useEffect(() => {
    if (!hydrated) return
    const targetId = id || me?._id || me?.id
    if (!targetId) { navigate('/auth'); return }
    setLoading(true)
    api.get(`/users/${targetId}`)
      .then(r => {
        setProfile(r.data.user)
        setProducts(r.data.products || [])
        setReviews(r.data.reviews || [])
      })
      .catch(() => toast.error('Пользователь не найден'))
      .finally(() => setLoading(false))
  }, [id, me, hydrated])

  if (!hydrated || loading) return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'40px 20px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:24 }}>
        <div className="skel" style={{ height:420, borderRadius:30 }}/>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[0,1,2].map(i => <div key={i} className="skel" style={{ height:100, borderRadius:16 }}/>)}
        </div>
      </div>
    </div>
  )

  if (!profile) return (
    <div style={{ textAlign:'center', padding:'80px 20px' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>👤</div>
      <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:24, marginBottom:16 }}>Пользователь не найден</div>
      <Link to="/" className="btn btn-secondary">На главную</Link>
    </div>
  )

  const isMe = !id || id === me?._id || id === me?.id
  const joinDate = new Date((profile.created_at || 0) * 1000)
  const displayName = profile.username || profile.firstName || 'Пользователь'
  const glowColor = (profile.rating >= 4.5) ? 'rgba(245,200,66,0.5)' : 'rgba(124,106,255,0.5)'

  // Простая карточка — заглушка если ProfileCard упадёт
  const ProfileFallback = (
    <div style={{
      width:300, background:'linear-gradient(145deg,#1a1a2e,#0f3460)',
      border:'1px solid var(--border)', borderRadius:24, padding:32, textAlign:'center'
    }}>
      <div style={{
        width:80, height:80, borderRadius:20, margin:'0 auto 16px',
        background:'linear-gradient(135deg,var(--purple),var(--accent))',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:32, fontWeight:800, fontFamily:'var(--font-h)'
      }}>
        {displayName[0].toUpperCase()}
      </div>
      <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20, marginBottom:4 }}>@{displayName}</div>
      <div style={{ color:'var(--t3)', fontSize:13 }}>★ {(profile.rating||5).toFixed(1)} · {profile.reviewCount||0} отзывов</div>
    </div>
  )

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 20px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:32, alignItems:'start' }}>

        {/* Левая колонка */}
        <div style={{ display:'flex', flexDirection:'column', gap:16, alignItems:'center' }}>

          <ErrorBoundary fallback={ProfileFallback}>
            <ProfileCard
              name={displayName}
              title={profile.isVerified ? '✓ Верифицирован' : `На сайте с ${joinDate.toLocaleDateString('ru', { month:'long', year:'numeric' })}`}
              handle={profile.username || profile.firstName || ''}
              status={`★ ${(profile.rating || 5).toFixed(1)} · ${profile.reviewCount || 0} отзывов`}
              contactText={isMe ? 'Кошелёк' : 'Профиль'}
              avatarUrl={profile.photoUrl || ''}
              showUserInfo={true}
              enableTilt={true}
              enableMobileTilt={false}
              behindGlowEnabled={true}
              behindGlowColor={glowColor}
              innerGradient="linear-gradient(145deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)"
              onContactClick={() => isMe ? navigate('/wallet') : null}
            />
          </ErrorBoundary>

          <div style={{ width:'100%', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'16px 20px' }}>
            <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:11, color:'var(--t3)', letterSpacing:'0.12em', marginBottom:12 }}>СТАТИСТИКА</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              {[['📦','Продаж',profile.totalSales||0],['🛒','Покупок',profile.totalPurchases||0]].map(([icon,label,val]) => (
                <div key={label} style={{ background:'var(--bg3)', borderRadius:12, padding:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:18 }}>{icon}</div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20 }}>{val}</div>
                  <div style={{ fontSize:11, color:'var(--t3)' }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, display:'flex', justifyContent:'space-between', paddingTop:10, borderTop:'1px solid var(--border)' }}>
              <span style={{ color:'var(--t3)' }}>📅 На сайте с</span>
              <span style={{ fontWeight:600 }}>{joinDate.toLocaleDateString('ru', { month:'long', year:'numeric' })}</span>
            </div>
          </div>

          {isMe && <Link to="/wallet" className="btn btn-primary btn-full">💰 Кошелёк</Link>}
        </div>

        {/* Правая колонка */}
        <div>
          <div style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, flexWrap:'wrap' }}>
              <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:26, margin:0 }}>@{displayName}</h1>
              {profile.isVerified && <span className="badge badge-green">✓ Верифицирован</span>}
              {profile.isAdmin && <span className="badge badge-purple">⚡ Админ</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <StarRating value={Math.round(profile.rating || 5)} />
              <span style={{ color:'var(--t3)', fontSize:13 }}>{(profile.rating||5).toFixed(1)} · {profile.reviewCount||0} отзывов</span>
            </div>
            {profile.bio && (
              <p style={{ color:'var(--t2)', fontSize:14, lineHeight:1.7, marginTop:12, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', margin:'12px 0 0' }}>
                {profile.bio}
              </p>
            )}
          </div>

          <div style={{ display:'flex', gap:6, marginBottom:20 }}>
            {[['products',`📦 Товары (${products.length})`],['reviews',`★ Отзывы (${reviews.length})`]].map(([v,l]) => (
              <button key={v} onClick={() => setTab(v)} style={{
                padding:'10px 20px', borderRadius:10, border:'1px solid', cursor:'pointer',
                fontSize:13, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
                background: tab===v ? 'rgba(245,200,66,0.1)' : 'transparent',
                borderColor: tab===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                color: tab===v ? 'var(--accent)' : 'var(--t3)',
              }}>{l}</button>
            ))}
          </div>

          {tab === 'products' && (
            products.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18, marginBottom:16 }}>Товаров нет</div>
                  {isMe && <Link to="/sell" className="btn btn-primary">+ Выставить товар</Link>}
                </div>
              : <div className="grid-3" style={{ gap:16 }}>
                  {products.map(p => <ProductCard key={p.id||p._id} product={p}/>)}
                </div>
          )}

          {tab === 'reviews' && (
            reviews.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>★</div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18 }}>Отзывов пока нет</div>
                </div>
              : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {reviews.map(r => (
                    <div key={r.id||r._id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:20 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                        <div style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700 }}>
                          {(r.reviewer_username||'?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>@{r.reviewer_username}</div>
                          <div style={{ fontSize:11, color:'var(--t4)' }}>
                            {r.product_title && `${r.product_title} · `}
                            {new Date((r.created_at||0)*1000).toLocaleDateString('ru')}
                          </div>
                        </div>
                        <StarRating value={r.rating}/>
                      </div>
                      {r.text && <p style={{ color:'var(--t2)', fontSize:13, lineHeight:1.7, margin:0 }}>{r.text}</p>}
                    </div>
                  ))}
                </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .profile-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
