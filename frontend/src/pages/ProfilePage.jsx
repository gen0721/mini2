import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'
import ProductCard from '../components/ProductCard'

export default function ProfilePage() {
  const { id } = useParams()
  const { user: me, hydrated } = useStore()
  const navigate = useNavigate()
  const [profile, setProfile]   = useState(null)
  const [products, setProducts] = useState([])
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [tab, setTab]           = useState('products')

  useEffect(() => {
    if (!hydrated) return
    const targetId = id || me?._id || me?.id
    if (!targetId) { navigate('/auth'); return }
    setLoading(true)
    setError(null)
    api.get(`/users/${targetId}`)
      .then(r => {
        console.log('[Profile] data:', r.data)
        setProfile(r.data.user)
        setProducts(r.data.products || [])
        setReviews(r.data.reviews || [])
      })
      .catch(e => {
        console.error('[Profile] error:', e)
        setError('Пользователь не найден')
        toast.error('Пользователь не найден')
      })
      .finally(() => setLoading(false))
  }, [id, me, hydrated])

  if (!hydrated || loading) return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'40px 20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:32 }}>
        <div className="skel" style={{ width:96, height:96, borderRadius:20, flexShrink:0 }}/>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
          <div className="skel" style={{ height:24, width:200 }}/>
          <div className="skel" style={{ height:16, width:140 }}/>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {[0,1,2].map(i => <div key={i} className="skel" style={{ height:200 }}/>)}
      </div>
    </div>
  )

  if (error || !profile) return (
    <div style={{ textAlign:'center', padding:'80px 20px' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>👤</div>
      <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:24, marginBottom:16 }}>
        {error || 'Пользователь не найден'}
      </div>
      <Link to="/" className="btn btn-secondary">На главную</Link>
    </div>
  )

  // Безопасно извлекаем все поля
  const isMe       = !id || id === me?._id || id === me?.id
  const joinDate   = profile.created_at ? new Date(Number(profile.created_at) * 1000) : new Date()
  const name       = profile.username || profile.firstName || 'Пользователь'
  const rating     = Math.min(5, Math.max(0, parseFloat(profile.rating) || 5))
  const stars      = Math.round(rating)
  const reviewCount = parseInt(profile.reviewCount) || parseInt(profile.review_count) || 0
  const totalSales  = parseInt(profile.totalSales)  || parseInt(profile.total_sales)  || 0
  const totalPurch  = parseInt(profile.totalPurchases) || parseInt(profile.total_purchases) || 0

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'32px 20px' }}>

      {/* Шапка */}
      <div style={{
        background:'linear-gradient(135deg, rgba(124,106,255,0.08), var(--bg2) 60%)',
        border:'1px solid var(--border)', borderRadius:24, padding:28, marginBottom:24,
        display:'flex', alignItems:'center', gap:24, flexWrap:'wrap'
      }}>
        <div style={{
          width:96, height:96, borderRadius:20, flexShrink:0,
          background:'linear-gradient(135deg, var(--purple), var(--accent))',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'var(--font-h)', fontWeight:800, fontSize:40, color:'#0d0d14',
          boxShadow:'0 8px 32px rgba(124,106,255,0.3)'
        }}>
          {name[0].toUpperCase()}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:6 }}>
            <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:24, margin:0 }}>
              @{name}
            </h1>
            {!!profile.isVerified && <span className="badge badge-green">✓ Верифицирован</span>}
            {!!profile.isAdmin    && <span className="badge badge-purple">⚡ Админ</span>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <span style={{ color:'var(--accent)', fontSize:14, letterSpacing:2 }}>
              {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}
            </span>
            <span style={{ color:'var(--t3)', fontSize:13 }}>
              {rating.toFixed(1)} · {reviewCount} отзывов
            </span>
          </div>
          {profile.bio && (
            <p style={{ color:'var(--t2)', fontSize:13, lineHeight:1.6, margin:0 }}>{String(profile.bio)}</p>
          )}
        </div>

        <div style={{ display:'flex', gap:12, flexShrink:0 }}>
          {[['📦', totalSales, 'продаж'], ['🛒', totalPurch, 'покупок']].map(([icon, val, label]) => (
            <div key={label} style={{
              background:'var(--bg3)', border:'1px solid var(--border)',
              borderRadius:14, padding:'12px 16px', textAlign:'center', minWidth:70
            }}>
              <div style={{ fontSize:20, marginBottom:2 }}>{icon}</div>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20 }}>{val}</div>
              <div style={{ fontSize:11, color:'var(--t3)' }}>{label}</div>
            </div>
          ))}
        </div>

        {isMe && (
          <Link to="/wallet" className="btn btn-primary" style={{ flexShrink:0 }}>
            💰 Кошелёк
          </Link>
        )}
      </div>

      {/* Дата регистрации */}
      <div style={{ color:'var(--t4)', fontSize:12, marginBottom:20 }}>
        📅 На сайте с {joinDate.toLocaleDateString('ru', { month:'long', year:'numeric' })}
      </div>

      {/* Табы */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
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

      {/* Товары */}
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

      {/* Отзывы */}
      {tab === 'reviews' && (
        reviews.length === 0
          ? <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>★</div>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18 }}>Отзывов пока нет</div>
            </div>
          : <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {reviews.map(r => (
                <div key={r.id||r._id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:20 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                    <div style={{ width:36, height:36, borderRadius:10, flexShrink:0, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700 }}>
                      {(r.reviewer_username||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:14 }}>@{r.reviewer_username}</div>
                      <div style={{ fontSize:11, color:'var(--t4)' }}>
                        {r.product_title ? `${r.product_title} · ` : ''}
                        {new Date((r.created_at||0)*1000).toLocaleDateString('ru')}
                      </div>
                    </div>
                    <span style={{ color:'var(--accent)', fontSize:14 }}>{'★'.repeat(Math.min(5,Math.max(0,parseInt(r.rating)||0)))}</span>
                  </div>
                  {r.text && <p style={{ color:'var(--t2)', fontSize:13, lineHeight:1.7, margin:0 }}>{r.text}</p>}
                </div>
              ))}
            </div>
      )}
    </div>
  )
}
