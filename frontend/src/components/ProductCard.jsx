import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import ElectricBorder from './ElectricBorder/ElectricBorder'

const statusColors = { active:'var(--green)', sold:'var(--t3)', frozen:'var(--accent)', moderation:'var(--purple)' }
const statusLabels = { active:'В продаже', sold:'Продан', frozen:'В сделке', moderation:'Проверка' }

export default function ProductCard({ product, style={} }) {
  const [hovered, setHovered] = useState(false)
  if (!product) return null
  const seller = product.seller
  const img = product.images?.[0]
  const electricColor = product.isPromoted ? '#f5c842' : '#7c6aff'

  return (
    <Link
      to={`/product/${product._id || product.id}`}
      style={{ textDecoration:'none', display:'block', ...style }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setTimeout(() => setHovered(false), 600)}
    >
      {/* ElectricBorder рендерится всегда — анимация через speed=0 когда не hover */}
      <ElectricBorder
        color={electricColor}
        speed={hovered || product.isPromoted ? (product.isPromoted ? 1.2 : 0.9) : 0}
        chaos={product.isPromoted ? 0.14 : 0.10}
        borderRadius={20}
        active={hovered || !!product.isPromoted}
      >
        <div className="card" style={{ cursor:'pointer' }}>
          <div style={{
            height:160, background:'var(--bg3)', position:'relative', overflow:'hidden',
            backgroundImage: img ? `url(${img})` : 'none',
            backgroundSize:'cover', backgroundPosition:'center',
          }}>
            {!img && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:40, opacity:0.3 }}>📦</div>}
            {product.isPromoted && <div style={{ position:'absolute', top:10, left:10 }}><span className="badge badge-yellow">🚀 ТОП</span></div>}
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:60, background:'linear-gradient(transparent, rgba(13,13,20,0.9))' }}/>
            <div style={{ position:'absolute', top:10, right:10 }}>
              <span className="badge" style={{ background:'rgba(13,13,20,0.8)', color: statusColors[product.status]||'var(--t3)', border:'none', fontSize:10 }}>
                {statusLabels[product.status]||product.status}
              </span>
            </div>
          </div>
          <div style={{ padding:'14px 16px' }}>
            <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15, marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {product.title}
            </div>
            <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {product.category} {product.game ? `• ${product.game}` : ''}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20, color:'var(--accent)' }}>
                ${parseFloat(product.price).toFixed(2)}
              </div>
              {seller && (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:22, height:22, borderRadius:6, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, fontFamily:'var(--font-h)' }}>
                    {(seller.username||seller.firstName||'?')[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize:12, color:'var(--t3)' }}>{seller.username||seller.firstName}</span>
                </div>
              )}
            </div>
            {seller?.rating && (
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
                <span style={{ color:'var(--accent)', fontSize:12 }}>★ {parseFloat(seller.rating).toFixed(1)}</span>
                <span style={{ color:'var(--t4)', fontSize:11 }}>({seller.reviewCount||0} отзывов)</span>
                <span style={{ marginLeft:'auto', color:'var(--t4)', fontSize:11 }}>👁 {product.views||0}</span>
              </div>
            )}
          </div>
        </div>
      </ElectricBorder>
    </Link>
  )
}
