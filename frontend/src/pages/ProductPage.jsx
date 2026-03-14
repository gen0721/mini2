import React, { useState, useEffect } from 'react'
import { Package, Star, ShoppingCart, ShieldCheck, Eye, Heart } from '../components/Icon'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'

export default function ProductPage() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { user } = useStore()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying]   = useState(false)
  const [imgIdx, setImgIdx]   = useState(0)

  useEffect(() => {
    api.get(`/products/${id}`).then(r => setProduct(r.data)).catch(() => navigate('/catalog')).finally(() => setLoading(false))
  }, [id])

  const buy = async () => {
    if (!user) return navigate('/auth')
    if (!window.confirm(`Купить "${product.title}" за $${product.price}? Средства будут заморожены до подтверждения получения.`)) return
    setBuying(true)
    try {
      await api.post('/deals', { productId: product._id || product.id })
      toast.success('Сделка создана!')
      navigate('/deals')
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setBuying(false)
  }

  if (loading) return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'24px 12px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
        <div className="skel" style={{ height:380 }}/>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="skel" style={{ height:40 }}/>
          <div className="skel" style={{ height:24 }}/>
          <div className="skel" style={{ height:80 }}/>
        </div>
      </div>
    </div>
  )

  if (!product) return null
  const seller = product.seller
  const isMine = user && String(seller?._id || seller?.id) === (user._id || user.id)

  return (
    <div style={{ maxWidth:940, margin:'0 auto', padding:'24px 12px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, fontSize:13, color:'var(--t3)' }}>
        <Link to="/">Главная</Link> <span>/</span>
        <Link to="/catalog">Каталог</Link> <span>/</span>
        <span style={{ color:'var(--t2)' }}>{product.title}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:28 }}>
        {/* Images */}
        <div>
          <div style={{
            height:360, borderRadius:20, overflow:'hidden', background:'var(--bg3)',
            backgroundImage: product.images?.[imgIdx] ? `url(${product.images[imgIdx]})` : 'none',
            backgroundSize:'cover', backgroundPosition:'center', marginBottom:10,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:60, color:'var(--t4)'
          }}>
            {!product.images?.length && <Package size={64} strokeWidth={0.75} style={{opacity:0.25}}/>}
          </div>
          {product.images?.length > 1 && (
            <div style={{ display:'flex', gap:8 }}>
              {product.images.map((img,i) => (
                <div key={i} onClick={() => setImgIdx(i)} style={{
                  width:60, height:60, borderRadius:10, overflow:'hidden', cursor:'pointer',
                  backgroundImage:`url(${img})`, backgroundSize:'cover', backgroundPosition:'center',
                  border:`2px solid ${imgIdx===i ? 'var(--accent)' : 'transparent'}`, flexShrink:0
                }}/>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <span className="badge badge-yellow">{product.category}</span>
            {product.game && <span className="badge badge-purple">{product.game}</span>}
          </div>
          <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:26, lineHeight:1.2, marginBottom:12 }}>{product.title}</h1>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:40, color:'var(--accent)', marginBottom:20 }}>
            ${parseFloat(product.price).toFixed(2)}
          </div>

          {seller && (
            <Link to={`/user/${seller._id||seller.id}`} style={{
              display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
              background:'var(--bg3)', borderRadius:12, marginBottom:20, color:'var(--t1)'
            }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-h)', fontWeight:800, fontSize:14 }}>
                {(seller.username||seller.firstName||'?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>@{seller.username||seller.firstName}</div>
                <div style={{ fontSize:12, color:'var(--t3)' }}><Star size={12} strokeWidth={2} style={{marginRight:3}}/>{parseFloat(seller.rating||5).toFixed(1)} · {seller.totalSales||0} продаж</div>
              </div>
            </Link>
          )}

          {!isMine && product.status==='active' && (
            <div style={{ marginBottom:16 }}>
              <button className="btn btn-primary btn-full" onClick={buy} disabled={buying} style={{ padding:'16px', fontSize:16, marginBottom:10 }}>
                {buying ? 'Создание сделки...' : `Купить за $${product.price}`}
              </button>
              <div style={{ fontSize:12, color:'var(--t3)', textAlign:'center', lineHeight:1.6 }}>
                Средства заморожены до подтверждения. Если товар не соответствует — откройте спор.
              </div>
            </div>
          )}
          {isMine && <div className="badge badge-yellow" style={{ marginBottom:16 }}>Ваш товар</div>}
          {product.status!=='active' && !isMine && <div className="badge badge-red" style={{ marginBottom:16 }}>Товар недоступен</div>}

          <div style={{ display:'flex', gap:16, color:'var(--t4)', fontSize:12 }}>
            <span><Eye size={13} strokeWidth={1.75} style={{marginRight:4}}/>{product.views||0} просмотров</span>
            <span><Heart size={13} strokeWidth={1.75} style={{marginRight:4}}/>{product.favorites||0} в избранном</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop:32 }}>
        <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:20, marginBottom:16 }}>Описание</h2>
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:24 }}>
          <pre style={{ fontSize:14, lineHeight:1.8, color:'var(--t2)', whiteSpace:'pre-wrap', fontFamily:'var(--font-b)' }}>{product.description}</pre>
        </div>
      </div>

      {product.tags?.length > 0 && (
        <div style={{ marginTop:20, display:'flex', gap:8, flexWrap:'wrap' }}>
          {product.tags.map(t => <span key={t} className="badge" style={{ background:'var(--bg3)', color:'var(--t3)' }}>#{t}</span>)}
        </div>
      )}
    </div>
  )
      }
