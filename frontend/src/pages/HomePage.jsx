import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, useStore } from '../store'
import ProductCard from '../components/ProductCard'

const FEATURES = [
  { icon:'🔒', title:'Гарантия сделки', desc:'Деньги замораживаются до подтверждения получения товара' },
  { icon:'⚡', title:'Быстрая оплата', desc:'CryptoCloud, RuKassa (карта РФ, СБП) и CryptoBot' },
  { icon:'🤝', title:'Арбитраж споров', desc:'Команда администраторов решит любой спор за 24 часа' },
  { icon:'🟡', title:'Тысячи товаров', desc:'Аккаунты, скины, валюта, ключи и многое другое' },
]

const CATEGORIES = [
  { icon:'🎮', name:'Аккаунты', slug:'game-accounts', count:'1.2k+' },
  { icon:'💰', name:'Валюта', slug:'game-currency', count:'800+' },
  { icon:'⚔️', name:'Предметы', slug:'items', count:'500+' },
  { icon:'🎨', name:'Скины', slug:'skins', count:'2.1k+' },
  { icon:'🔑', name:'Ключи', slug:'keys', count:'300+' },
  { icon:'⭐', name:'Подписки', slug:'subscriptions', count:'150+' },
  { icon:'🚀', name:'Буст', slug:'boost', count:'200+' },
  { icon:'📦', name:'Прочее', slug:'other', count:'400+' },
]

export default function HomePage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useStore()

  useEffect(() => {
    api.get('/products?limit=8&sort=newest')
      .then(r => setProducts(r.data.products||[]))
      .catch(()=>{})
      .finally(()=>setLoading(false))
  }, [])

  return (
    <div>
      {/* Hero */}
      <section style={{
        padding:'80px 20px',
        background:'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245,200,66,0.12), transparent)',
        position:'relative', overflow:'hidden', textAlign:'center'
      }}>
        <div style={{ position:'absolute', top:'10%', left:'5%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,106,255,0.08), transparent)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:'-10%', right:'5%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(245,200,66,0.06), transparent)', pointerEvents:'none' }}/>

        <div style={{ position:'relative', maxWidth:760, margin:'0 auto' }}>
          <div className="badge badge-yellow" style={{ marginBottom:20, display:'inline-flex' }}>🟡 Маркетплейс цифровых товаров</div>
          <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:'clamp(36px, 6vw, 72px)', lineHeight:1.05, letterSpacing:'-0.03em', marginBottom:20 }}>
            Покупай и продавай<br/><span style={{ color:'var(--accent)' }}>безопасно</span>
          </h1>
          <p style={{ color:'var(--t2)', fontSize:18, lineHeight:1.6, maxWidth:520, margin:'0 auto 36px' }}>
            Тысячи цифровых товаров с защитой сделки. Деньги переводятся продавцу только после вашего подтверждения.
          </p>
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <Link to="/catalog" className="btn btn-primary" style={{ padding:'14px 32px', fontSize:16 }}>Смотреть каталог →</Link>
            {!user && <Link to="/auth?mode=register" className="btn btn-secondary" style={{ padding:'14px 32px', fontSize:16 }}>Зарегистрироваться</Link>}
          </div>
          <div style={{ display:'flex', gap:32, justifyContent:'center', marginTop:48, flexWrap:'wrap' }}>
            {[['5000+','Товаров'],['12k+','Пользователей'],['98%','Успешных сделок'],['24/7','Поддержка']].map(([n,l]) => (
              <div key={l} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, color:'var(--accent)' }}>{n}</div>
                <div style={{ color:'var(--t3)', fontSize:13 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section style={{ padding:'60px 20px', maxWidth:1200, margin:'0 auto' }}>
        <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, marginBottom:24 }}>Категории</h2>
        <div className="grid-4">
          {CATEGORIES.map(cat => (
            <Link key={cat.slug} to={`/catalog?category=${cat.slug}`} style={{ textDecoration:'none' }}>
              <div style={{
                background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'var(--r2)',
                padding:'20px', display:'flex', alignItems:'center', gap:14, transition:'all 0.2s', cursor:'pointer'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(245,200,66,0.3)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none' }}>
                <div style={{ fontSize:28, width:44, height:44, borderRadius:12, background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{cat.icon}</div>
                <div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14 }}>{cat.name}</div>
                  <div style={{ color:'var(--t3)', fontSize:12 }}>{cat.count} товаров</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* New products */}
      <section style={{ padding:'0 20px 60px', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28 }}>Новые товары</h2>
          <Link to="/catalog" className="btn btn-ghost btn-sm">Все товары →</Link>
        </div>
        {loading ? (
          <div className="grid-4">{Array(8).fill(0).map((_,i) => <div key={i} className="skel" style={{ height:280 }}/>)}</div>
        ) : products.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📦</div>
            <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Товаров пока нет</div>
            <p style={{ color:'var(--t4)', marginTop:8 }}>Будьте первым продавцом!</p>
            <Link to="/sell" className="btn btn-primary" style={{ marginTop:20, display:'inline-flex' }}>Разместить товар</Link>
          </div>
        ) : (
          <div className="grid-4">
            {products.map((p,i) => <ProductCard key={p._id||p.id} product={p} style={{ animationDelay:`${i*50}ms` }}/>)}
          </div>
        )}
      </section>

      {/* Features */}
      <section style={{ padding:'60px 20px', background:'var(--bg2)', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, textAlign:'center', marginBottom:40 }}>Почему выбирают нас</h2>
          <div className="grid-4">
            {FEATURES.map(f => (
              <div key={f.title} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--r2)', padding:'28px 24px', textAlign:'center' }}>
                <div style={{ fontSize:36, marginBottom:14 }}>{f.icon}</div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:16, marginBottom:8 }}>{f.title}</div>
                <div style={{ color:'var(--t3)', fontSize:13, lineHeight:1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      {!user && (
        <section style={{ padding:'80px 20px', textAlign:'center', maxWidth:600, margin:'0 auto' }}>
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:36, marginBottom:16 }}>Готов начать?</h2>
          <p style={{ color:'var(--t2)', marginBottom:28, lineHeight:1.7 }}>Зарегистрируйся за 30 секунд через Telegram бот и начни торговать прямо сейчас.</p>
          <Link to="/auth?mode=register" className="btn btn-primary" style={{ padding:'16px 40px', fontSize:16 }}>Создать аккаунт →</Link>
        </section>
      )}
    </div>
  )
                }
