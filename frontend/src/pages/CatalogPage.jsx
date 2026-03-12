import React, { useState, useEffect, useCallback } from 'react'
import { Gamepad2, Coins, Sword, Palette, KeyRound, Star, Rocket, Package, Search } from '../components/Icon'
import DarkVeil from '../components/DarkVeil/DarkVeil'
import { useSearchParams } from 'react-router-dom'
import { api } from '../store'
import ProductCard from '../components/ProductCard'

const CATEGORIES = [
  { slug:'', name:'Все' },
  { slug:'game-accounts', name:'Аккаунты', icon: <Gamepad2 size={18} strokeWidth={1.5}/> },
  { slug:'game-currency', name:'Валюта', icon: <Coins size={18} strokeWidth={1.5}/> },
  { slug:'items', name:'Предметы', icon: <Sword size={18} strokeWidth={1.5}/> },
  { slug:'skins', name:'Скины', icon: <Palette size={18} strokeWidth={1.5}/> },
  { slug:'keys', name:'Ключи', icon: <KeyRound size={18} strokeWidth={1.5}/> },
  { slug:'subscriptions', name:'Подписки', icon: <Star size={18} strokeWidth={1.5}/> },
  { slug:'boost', name:'Буст', icon: <Rocket size={18} strokeWidth={1.5}/> },
  { slug:'other', name:'Прочее', icon: <Package size={18} strokeWidth={1.5}/> },
]
const SORTS = [{ v:'newest',label:'Новые' },{ v:'price_asc',label:'Дешевле' },{ v:'price_desc',label:'Дороже' },{ v:'popular',label:'Популярные' }]

export default function CatalogPage() {
  const [sp, setSp] = useSearchParams()
  const [products, setProducts] = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)

  const category = sp.get('category') || ''
  const search   = sp.get('search') || ''
  const sort     = sp.get('sort') || 'newest'
  const minPrice = sp.get('minPrice') || ''
  const maxPrice = sp.get('maxPrice') || ''

  const [searchInput, setSearchInput] = useState(search)
  const [minP, setMinP] = useState(minPrice)
  const [maxP, setMaxP] = useState(maxPrice)

  const load = useCallback(async (p=1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit:20, page:p, sort })
      if (category) params.set('category', category)
      if (search)   params.set('search', search)
      if (minPrice) params.set('minPrice', minPrice)
      if (maxPrice) params.set('maxPrice', maxPrice)
      const { data } = await api.get('/products?' + params)
      if (p===1) setProducts(data.products||[])
      else setProducts(prev => [...prev, ...(data.products||[])])
      setTotal(data.total||0)
    } catch {}
    setLoading(false)
  }, [category, search, sort, minPrice, maxPrice])

  useEffect(() => { setPage(1); load(1) }, [load])

  const applySearch = () => {
    const ns = new URLSearchParams(sp)
    if (searchInput) ns.set('search', searchInput); else ns.delete('search')
    if (minP) ns.set('minPrice', minP); else ns.delete('minPrice')
    if (maxP) ns.set('maxPrice', maxP); else ns.delete('maxPrice')
    setSp(ns)
  }

  return (
    <div style={{ position:'relative', minHeight:'100vh', overflow:'hidden' }}>
      {/* DarkVeil фон */}
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none' }}>
        <DarkVeil
          hueShift={0}
          noiseIntensity={0}
          scanlineIntensity={0}
          speed={2}
          scanlineFrequency={0}
          warpAmount={0}
        />
      </div>

      {/* Контент поверх */}
      <div style={{ position:'relative', zIndex:1, maxWidth:1200, margin:'0 auto', padding:'32px 20px' }}>
      <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:32, marginBottom:24 }}>Каталог</h1>

      <div style={{ display:'flex', gap:10, marginBottom:24 }}>
        <input className="inp" placeholder="Поиск товаров..." value={searchInput}
          onChange={e => setSearchInput(e.target.value)} onKeyDown={e => e.key==='Enter' && applySearch()} style={{ flex:1 }}/>
        <input className="inp" placeholder="$ от" value={minP} onChange={e => setMinP(e.target.value)} style={{ width:90 }}/>
        <input className="inp" placeholder="$ до" value={maxP} onChange={e => setMaxP(e.target.value)} style={{ width:90 }}/>
        <button className="btn btn-primary" onClick={applySearch}>Найти</button>
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {CATEGORIES.map(c => (
          <button key={c.slug} onClick={() => { const ns=new URLSearchParams(sp); if(c.slug) ns.set('category',c.slug); else ns.delete('category'); setSp(ns) }} style={{
            padding:'8px 16px', borderRadius:100, border:'1px solid', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all 0.15s',
            background: category===c.slug ? 'rgba(245,200,66,0.15)' : 'var(--bg2)',
            borderColor: category===c.slug ? 'rgba(245,200,66,0.5)' : 'var(--border)',
            color: category===c.slug ? 'var(--accent)' : 'var(--t2)',
          }}>{c.icon} {c.name}</button>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <span style={{ color:'var(--t3)', fontSize:13 }}>{loading ? '...' : `${total} товаров`}</span>
        <div style={{ display:'flex', gap:6 }}>
          {SORTS.map(s => (
            <button key={s.v} onClick={() => { const ns=new URLSearchParams(sp); ns.set('sort',s.v); setSp(ns) }} style={{
              padding:'6px 14px', borderRadius:8, border:'1px solid', cursor:'pointer', fontSize:12, fontWeight:600, transition:'all 0.15s',
              background: sort===s.v ? 'rgba(245,200,66,0.12)' : 'transparent',
              borderColor: sort===s.v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
              color: sort===s.v ? 'var(--accent)' : 'var(--t3)',
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      {loading && page===1 ? (
        <div className="grid-4">{Array(8).fill(0).map((_,i) => <div key={i} className="skel" style={{ height:280 }}/>)}</div>
      ) : products.length===0 ? (
        <div style={{ textAlign:'center', padding:'80px 20px', color:'var(--t3)' }}>
          <Search size={48} strokeWidth={1} style={{marginBottom:16, opacity:0.35}}/>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:20 }}>Товары не найдены</div>
          <p style={{ color:'var(--t4)', marginTop:8 }}>Попробуйте изменить фильтры</p>
        </div>
      ) : (
        <>
          <div className="grid-4">
            {products.map((p,i) => <ProductCard key={p._id||p.id} product={p} style={{ animationDelay:`${i*30}ms` }}/>)}
          </div>
          {products.length < total && (
            <div style={{ textAlign:'center', marginTop:32 }}>
              <button className="btn btn-secondary" onClick={() => { const np=page+1; setPage(np); load(np) }} disabled={loading}>
                {loading ? 'Загрузка...' : 'Загрузить ещё'}
              </button>
            </div>
          )}
        </>
      )}</div>
    </div>
  )
}
