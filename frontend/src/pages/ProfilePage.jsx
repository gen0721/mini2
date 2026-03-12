import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'
import ProductCard from '../components/ProductCard'
import ProfileCard from '../components/ProfileCard/ProfileCard'

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
    // Ждём пока store загрузится из localStorage
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
  }, [id, me])

  if (!id && !hydrated) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
    </div>
  )

  if (loading) return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'40px 20px', display:'grid', gridTemplateColumns:'300px 1fr', gap:24 }}>
      <div className="skel" style={{ height:420, borderRadius:30 }}/>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {[0,1,2].map(i => <div key={i} className="skel" style={{ height:80 }}/>)}
      </div>
    </div>
  )

  if (!profile) return (
    <div style={{ textAlign:'center', padding:'80px 20px' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>👤</div>
      <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:24, marginBottom:8 }}>Пользователь не найден</div>
      <Link to="/" className="btn btn-secondary">На главную</Link>
    </div>
  )

  const isMe = !id || id === me?._id || id === me?.id
  const joinDate = new Date((profile.created_at || 0) * 1000)
  const displayName = profile.username || profile.firstName || 'Пользователь'

  // Цвет свечения зависит от рейтинга
  const glowColor = profile.rating >= 4.5
    ? 'rgba(245, 200, 66, 0.5)'
    : profile.rating >= 3.5
    ? 'rgba(124, 106, 255, 0.5)'
    : 'rgba(125, 190, 255, 0.5)'

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 20px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:32, alignItems:'start' }}>

        {/* Левая колонка — ProfileCard */}
        <div style={{ display:'flex', flexDirection:'column', gap:16, alignItems:'center' }}>
          <ProfileCard
            name={displayName}
            title={profile.isVerified ? '✓ Верифицирован' : `На сайте с ${joinDate.toLocaleDateString('ru', { month:'long', year:'numeric' })}`}
            handle={profile.username || profile.firstName || ''}
            status={`★ ${(profile.rating || 5).toFixed(1)} · ${profile.reviewCount || 0} отзывов`}
            contactText={isMe ? 'Кошелёк' : 'Написать'}
            avatarUrl={profile.photoUrl || ''}
            showUserInfo={true}
            enableTilt={true}
            enableMobileTilt={false}
            behindGlowEnabled={true}
            behindGlowColor={glowColor}
            innerGradient="linear-gradient(145deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)"
            onContactClick={() => isMe ? navigate('/wallet') : toast('Скоро!')}
          />

          {/* Статистика под карточкой */}
          <div style={{
            width:'100%', background:'var(--bg2)', border:'1px solid var(--border)',
            borderRadius:16, padding:'16px 20px',
          }}>
            <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:11, color:'var(--t3)', letterSpacing:'0.12em', marginBottom:12 }}>СТАТИСТИКА</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                ['📦', 'Продаж', profile.totalSales || 0],
                ['🛒', 'Покупок', profile.totalPurchases || 0],
              ].map(([icon, label, val]) => (
                <div key={label} style={{ background:'var(--bg3)', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:22, color:'var(--t1)' }}>{val}</div>
                  <div style={{ fontSize:11, color:'var(--t3)' }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, padding:'10px 0', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', fontSize:12 }}>
              <span style={{ color:'var(--t3)' }}>📅 На сайте с</span>
              <span style={{ fontWeight:600 }}>{joinDate.toLocaleDateString('ru', { month:'long', year:'numeric' })}</span>
            </div>
          </div>

          {isMe && (
            <Link to="/wallet" className="btn btn-primary btn-full">💰 Кошелёк</Link>
          )}
        </div>

        {/* Правая колонка — табы + контент */}
        <div>
          {/* Заголовок */}
          <div style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
              <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, margin:0 }}>
                @{displayName}
              </h1>
              {profile.isVerified && (
                <span className="badge badge-green">✓ Верифицирован</span>
              )}
              {profile.isAdmin && (
                <span className="badge badge-purple">⚡ Админ</span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <StarRating value={Math.round(profile.rating || 5)} />
              <span style={{ color:'var(--t3)', fontSize:13 }}>
                {(profile.rating || 5).toFixed(1)} · {profile.reviewCount || 0} отзывов
              </span>
            </div>
            {profile.bio && (
              <p style={{ color:'var(--t2)', fontSize:14, lineHeight:1.7, marginTop:12,
                background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px'
              }}>{profile.bio}</p>
            )}
          </div>

          {/* Табы */}
          <div style={{ display:'flex', gap:6, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
            {[['products', `📦 Товары (${products.length})`], ['reviews', `★ Отзывы (${reviews.length})`]].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} style={{
                padding:'10px 20px', borderRadius:'10px 10px 0 0', border:'1px solid',
                borderBottom: tab === v ? '1px solid var(--bg)' : '1px solid transparent',
                cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'var(--font-h)',
                background: tab === v ? 'var(--bg)' : 'transparent',
                borderColor: tab === v ? 'var(--border)' : 'transparent',
                color: tab === v ? 'var(--accent)' : 'var(--t3)',
                marginBottom: tab === v ? '-1px' : '0',
                transition:'all 0.15s',
              }}>{l}</button>
            ))}
          </div>

          {/* Товары */}
          {tab === 'products' && (
            products.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18 }}>Товаров нет</div>
                  {isMe && <Link to="/sell" className="btn btn-primary" style={{ marginTop:16, display:'inline-flex' }}>+ Выставить товар</Link>}
                </div>
              : <div className="grid-3" style={{ gap:16 }}>
                  {products.map(p => <ProductCard key={p.id||p._id} product={p}/>)}
                </div>
          )}

          {/* Отзывы */}
          {tab === 'reviews' && (
            reviews.length === 0
              ? <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>★</div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18 }}>Отзывов пока нет</div>
                </div>
              : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {reviews.map(r => (
                    <div key={r.id||r._id} style={{
                      background:'var(--bg2)', border:'1px solid var(--border)',
                      borderRadius:16, padding:20, transition:'all 0.2s'
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                        <div style={{
                          width:36, height:36, borderRadius:10, flexShrink:0,
                          background:'linear-gradient(135deg,var(--purple),var(--accent))',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:14, fontWeight:700
                        }}>
                          {(r.reviewer_username||'?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>@{r.reviewer_username}</div>
                          <div style={{ fontSize:11, color:'var(--t4)' }}>
                            {r.product_title && <span>{r.product_title} · </span>}
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

      {/* Мобильный стиль */}
      <style>{`
        @media (max-width: 768px) {
          .profile-grid { grid-template-columns: 1fr !important; }
          .pc-card { width: 260px !important; height: 360px !important; }
        }
      `}</style>
    </div>
  )
}
