import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'

const CATEGORIES = ['game-accounts','game-currency','items','skins','keys','subscriptions','boost','other']
const CAT_NAMES  = { 'game-accounts':'Аккаунты','game-currency':'Валюта','items':'Предметы','skins':'Скины','keys':'Ключи','subscriptions':'Подписки','boost':'Буст','other':'Прочее' }

// Вынесен НАРУЖУ из компонента — иначе ре-рендер пересоздаёт компонент и инпут теряет фокус
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ fontSize:11, fontWeight:700, color:'var(--t3)', fontFamily:'var(--font-h)', letterSpacing:'0.1em', display:'block', marginBottom:7 }}>{label}</label>
      {children}
    </div>
  )
}

export default function SellPage() {
  const { user } = useStore()
  const navigate  = useNavigate()
  const [form, setForm] = useState({ title:'', description:'', price:'', category:'', game:'', deliveryData:'', deliveryType:'manual', tags:'' })
  const [loading, setLoading] = useState(false)

  if (!user) { navigate('/auth'); return null }

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.title||!form.description||!form.price||!form.category) return toast.error('Заполните обязательные поля')
    setLoading(true)
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const { data } = await api.post('/products', { ...form, price: parseFloat(form.price), tags })
      toast.success('Товар создан!')
      navigate(`/product/${data._id||data.id}`)
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'24px 12px' }}>
      <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, marginBottom:8 }}>Разместить товар</h1>
      <p style={{ color:'var(--t3)', marginBottom:28, fontSize:14 }}>Комиссия платформы 5% — списывается только при успешной продаже.</p>

      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:20, padding:28 }}>
        <Field label="НАЗВАНИЕ *">
          <input className="inp" placeholder="Аккаунт CS2 с рангом Global Elite..." value={form.title} onChange={e => upd('title', e.target.value)} maxLength={120}/>
          <div style={{ fontSize:11, color:'var(--t4)', marginTop:4 }}>{form.title.length}/120</div>
        </Field>

        <Field label="КАТЕГОРИЯ *">
          <select className="inp" value={form.category} onChange={e => upd('category', e.target.value)} style={{ cursor:'pointer' }}>
            <option value="">— Выберите категорию —</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_NAMES[c]}</option>)}
          </select>
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <Field label="ЦЕНА (USD) *">
            <input className="inp" type="number" placeholder="0.00" min="0.1" step="0.01" value={form.price} onChange={e => upd('price', e.target.value)}/>
          </Field>
          <Field label="ИГРА (если есть)">
            <input className="inp" placeholder="CS2, Minecraft..." value={form.game} onChange={e => upd('game', e.target.value)}/>
          </Field>
        </div>

        <Field label="ОПИСАНИЕ *">
          <textarea className="inp" rows={5} placeholder="Подробно опишите товар: характеристики, что входит, особенности..." value={form.description}
            onChange={e => upd('description', e.target.value)} maxLength={3000} style={{ resize:'vertical' }}/>
          <div style={{ fontSize:11, color:'var(--t4)', marginTop:4 }}>{form.description.length}/3000</div>
        </Field>

        <Field label="ТЕГИ (через запятую)">
          <input className="inp" placeholder="cs2, global, faceit, prime..." value={form.tags} onChange={e => upd('tags', e.target.value)}/>
        </Field>

        <Field label="ТИП ПЕРЕДАЧИ">
          <div style={{ display:'flex', gap:8 }}>
            {[['manual','Вручную'],['auto','Авто']].map(([v,l]) => (
              <button key={v} onClick={() => upd('deliveryType', v)} style={{
                flex:1, padding:'10px', borderRadius:10, border:'1px solid', cursor:'pointer', fontSize:13, fontWeight:600, transition:'all 0.15s',
                background: form.deliveryType===v ? 'rgba(245,200,66,0.1)' : 'transparent',
                borderColor: form.deliveryType===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                color: form.deliveryType===v ? 'var(--accent)' : 'var(--t3)'
              }}>{l}</button>
            ))}
          </div>
        </Field>

        <Field label="ДАННЫЕ ТОВАРА (скрыты до сделки)">
          <textarea className="inp" rows={3} placeholder={`Логин: example\nПароль: password123\nКлюч: XXXXX-XXXXX`} value={form.deliveryData}
            onChange={e => upd('deliveryData', e.target.value)} style={{ resize:'vertical' }}/>
          <div style={{ fontSize:11, color:'var(--t4)', marginTop:4 }}>Покупатель увидит только после завершения сделки</div>
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Создание...' : '+ Разместить товар'}
          </button>
        </div>
      </div>
    </div>
  )
}
