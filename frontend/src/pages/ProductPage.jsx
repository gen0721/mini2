import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import ElectricBorder from './ElectricBorder/ElectricBorder'

const statusColors = { active:'var(--green)', sold:'var(--t3)', frozen:'var(--accent)', moderation:'var(--purple)' }
const statusLabels = { active:'В продаже', sold:'Продан', frozen:'В сделке', moderation:'Проверка' }

const LEVEL_BADGES = {
  newcomer:    null,
  experienced: { emoji:'⭐', color:'#3b82f6' },
  pro:         { emoji:'💎', color:'#8b5cf6' },
  legend:      { emoji:'👑', color:'#f5c842' },
}

// Проверяем новый ли товар (добавлен за последние 24 часа)
function isNew(createdAt) {
  if (!createdAt) return false
  return Date.now() / 1000 - createdAt < 86400
}

export default function ProductCard({ product, style={} }) {
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible]  = useState(false)
  const cardRef = useRef(null)

  // Анимация появления через IntersectionObserver
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!product) return null
  const seller = product.seller
  const img    = product.images?.[0]
  const electricColor = product.isPromoted ? '#f5c842' : '#7c6aff'
  const levelBadge = LEVEL_BADGES[seller?.seller_level]
  const productIsNew = isNew(product.created_at || product.createdAt)

  return (
    <div
      ref={cardRef}
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        ...style,
      }}
    >
      <Link
        to={`/product/${product._id || product.id}`}
        style={{ textDecoration:'none', display:'block' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={() => setHovered(true)}
        onTouchEnd={() => setTimeout(() => setHovered(false), 600)}
      >
        <ElectricBorder
          color={electricColor}
          speed={hovered || product.isPromoted ? (product.isPromoted ? 1.2 : 0.9) : 0}
          chaos={product.isPromoted ? 0.14 : 0.10}
          borderRadius={20}
          active={hovered || !!product.isPromoted}
        >
          <div className="card" style={{
            cursor: 'pointer',
            transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            boxShadow: hovered ? '0 12px 32px rgba(0,0,0,0.4)' : 'none',
          }}>
            {/* Картинка */}
            <div style={{
              height: 160, background: 'var(--bg3)', position: 'relative', overflow: 'hidden',
              backgroundImage: img ? `url(${img})` : 'none',
              backgroundSize: 'cover', backgroundPosition: 'center',
            }}>
              {/* Zoom эффект на картинке при hover */}
              {img && (
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundImage: `url(${img})`,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                  transform: hovered ? 'scale(1.06)' : 'scale(1)',
                  transition: 'transform 0.4s ease',
                }}/>
              )}
              {!img && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, opacity:0.3 }}>📦</div>}

              {/* Бейдж ТОП */}
              {product.isPromoted && (
                <div style={{ position:'absolute', top:10, left:10, zIndex:2 }}>
                  <span className="badge badge-yellow">🚀 ТОП</span>
                </div>
              )}

              {/* Бейдж НОВЫЙ */}
              {productIsNew && !product.isPromoted && (
                <div style={{ position:'absolute', top:10, left:10, zIndex:2 }}>
                  <span style={{
                    background:'rgba(46,204,113,0.9)', color:'#fff',
                    fontSize:10, fontWeight:800, padding:'3px 8px',
                    borderRadius:6, fontFamily:'var(--font-h)',
                  }}>✨ НОВЫЙ</span>
                </div>
              )}

              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:60, background:'linear-gradient(transparent, rgba(13,13,20,0.9))', zIndex:1 }}/>

              {/* Статус */}
              <div style={{ position:'absolute', top:10, right:10, zIndex:2 }}>
                <span className="badge" style={{ background:'rgba(13,13,20,0.8)', color: statusColors[product.status]||'var(--t3)', border:'none', fontSize:10 }}>
                  {statusLabels[product.status]||product.status}
                </span>
              </div>
            </div>

            {/* Инфо */}
            <div style={{ padding:'14px 16px' }}>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {product.title}
              </div>
              <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {product.category}{product.game ? ` • ${product.game}` : ''}
              </div>

              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                {/* Цена */}
                <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20, color:'var(--accent)' }}>
                  ${parseFloat(product.price).toFixed(2)}
                </div>

                {/* Продавец */}
                {seller && (
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    {levelBadge && (
                      <span title={seller.seller_level} style={{ fontSize:13 }}>{levelBadge.emoji}</span>
                    )}
                    <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, fontFamily:'var(--font-h)' }}>
                      {(seller.username||seller.firstName||'?')[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize:12, color:'var(--t3)' }}>{seller.username||seller.firstName}</span>
                  </div>
                )}
              </div>

              {/* Рейтинг и просмотры */}
              {seller?.rating && (
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                  {/* Анимированные звёзды */}
                  <span style={{ color:'var(--accent)', fontSize:12, letterSpacing:1 }}>
                    {Array.from({length:5}).map((_, i) => (
                      <span key={i} style={{
                        opacity: i < Math.round(parseFloat(seller.rating)) ? 1 : 0.2,
                        display: 'inline-block',
                        transform: hovered && i < Math.round(parseFloat(seller.rating)) ? 'scale(1.2)' : 'scale(1)',
                        transition: `transform ${0.1 + i * 0.05}s ease`,
                      }}>★</span>
                    ))}
                  </span>
                  <span style={{ color:'var(--t4)', fontSize:11 }}>{parseFloat(seller.rating).toFixed(1)}</span>
                  <span style={{ marginLeft:'auto', color:'var(--t4)', fontSize:11 }}>👁 {product.views||0}</span>
                </div>
              )}
            </div>
          </div>
        </ElectricBorder>
      </Link>
    </div>
  )
}
