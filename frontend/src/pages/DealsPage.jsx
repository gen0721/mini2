import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'

const STATUS_LABELS = { pending:'Ожидание', active:'Активна', completed:'Завершена', disputed:'Спор', cancelled:'Отменена', refunded:'Возврат' }
const STATUS_COLORS = { pending:'var(--accent)', active:'var(--green)', completed:'var(--t3)', disputed:'var(--red)', cancelled:'var(--t4)', refunded:'#22d3ee' }

export default function DealsPage() {
  const { user } = useStore()
  const navigate  = useNavigate()
  const [deals, setDeals]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [role, setRole]         = useState('all')
  const [selected, setSelected] = useState(null)
  const [msgText, setMsgText]   = useState('')
  const [delivery, setDelivery] = useState('')
  const [working, setWorking]   = useState(false)

  useEffect(() => { if (!user) navigate('/auth') }, [user])
  useEffect(() => {
    setLoading(true)
    api.get(`/deals?role=${role}`).then(r => setDeals(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [role])

  const loadDeal = async (id) => {
    try { const { data } = await api.get(`/deals/${id}`); setSelected(data) }
    catch { toast.error('Ошибка загрузки') }
  }

  const sendMessage = async () => {
    if (!msgText.trim()) return
    setWorking(true)
    try {
      await api.post(`/deals/${selected._id||selected.id}/message`, { text: msgText })
      setMsgText('')
      loadDeal(selected._id||selected.id)
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const deliver = async () => {
    if (!delivery.trim()) return toast.error('Введите данные товара')
    setWorking(true)
    try {
      await api.post(`/deals/${selected._id||selected.id}/deliver`, { deliveryData: delivery })
      toast.success('Товар передан покупателю')
      setDelivery('')
      loadDeal(selected._id||selected.id)
      api.get(`/deals?role=${role}`).then(r => setDeals(r.data))
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const confirm = async () => {
    if (!window.confirm('Подтвердить получение товара? Деньги будут переведены продавцу.')) return
    setWorking(true)
    try {
      await api.post(`/deals/${selected._id||selected.id}/confirm`)
      toast.success('✅ Сделка завершена!')
      loadDeal(selected._id||selected.id)
      api.get(`/deals?role=${role}`).then(r => setDeals(r.data))
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const dispute = async () => {
    const reason = window.prompt('Укажите причину спора:')
    if (!reason) return
    setWorking(true)
    try {
      await api.post(`/deals/${selected._id||selected.id}/dispute`, { reason })
      toast.success('Спор открыт. Администратор рассмотрит в течение 24ч.')
      loadDeal(selected._id||selected.id)
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const isBuyer  = d => String(d?.buyer?._id || d?.buyer?.id || d?.buyer_id) === String(user?._id || user?.id)
  const isSeller = d => String(d?.seller?._id || d?.seller?.id || d?.seller_id) === String(user?._id || user?.id)

  if (!user) return null

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 20px' }}>
      <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, marginBottom:24 }}>Сделки</h1>

      <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:20, minHeight:500 }}>
        {/* Left list */}
        <div>
          <div style={{ display:'flex', gap:6, marginBottom:16 }}>
            {[['all','Все'],['buyer','Покупки'],['seller','Продажи']].map(([v,l]) => (
              <button key={v} onClick={() => setRole(v)} style={{
                flex:1, padding:'8px', borderRadius:8, border:'1px solid', cursor:'pointer',
                fontSize:12, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
                background: role===v ? 'rgba(245,200,66,0.1)' : 'transparent',
                borderColor: role===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                color: role===v ? 'var(--accent)' : 'var(--t3)'
              }}>{l}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[0,1,2,3].map(i => <div key={i} className="skel" style={{ height:80 }}/>)}
            </div>
          ) : deals.length===0 ? (
            <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--t3)' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🤝</div>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Сделок нет</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {deals.map(d => (
                <div key={d._id||d.id} onClick={() => loadDeal(d._id||d.id)} style={{
                  background: (selected?._id||selected?.id)===(d._id||d.id) ? 'var(--bg3)' : 'var(--bg2)',
                  border:`1px solid ${(selected?._id||selected?.id)===(d._id||d.id) ? 'rgba(245,200,66,0.3)' : 'var(--border)'}`,
                  borderRadius:14, padding:'14px 16px', cursor:'pointer', transition:'all 0.15s'
                }}>
                  <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>
                    {d.product?.title||'Товар'}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:11, color:'var(--t3)' }}>
                      {isBuyer(d)?'Покупка':'Продажа'} · @{(isBuyer(d)?d.seller:d.buyer)?.username||'—'}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLORS[d.status] }}>{STATUS_LABELS[d.status]}</span>
                  </div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14, color:'var(--accent)', marginTop:4 }}>${parseFloat(d.amount).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right detail */}
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:20, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {!selected ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t3)', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize:40 }}>👈</div>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Выберите сделку</div>
            </div>
          ) : (
            <>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15 }}>{selected.product?.title}</div>
                  <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                    {isBuyer(selected) ? `Продавец: @${selected.seller?.username}` : `Покупатель: @${selected.buyer?.username}`}
                    {' · '}
                    <span style={{ color: STATUS_COLORS[selected.status], fontWeight:700 }}>{STATUS_LABELS[selected.status]}</span>
                  </div>
                </div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:18, color:'var(--accent)' }}>${parseFloat(selected.amount).toFixed(2)}</div>
              </div>

              <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:10, minHeight:200, maxHeight:300 }}>
                {selected.messages?.map((m,i) => (
                  <div key={i} style={{
                    padding:'10px 14px', borderRadius:12,
                    background: m.isSystem ? 'rgba(245,200,66,0.08)' : String(m.sender)===(user._id||user.id) ? 'rgba(124,106,255,0.15)' : 'var(--bg3)',
                    alignSelf: m.isSystem ? 'center' : String(m.sender)===(user._id||user.id) ? 'flex-end' : 'flex-start',
                    maxWidth:'80%', fontSize:13,
                    color: m.isSystem ? 'var(--accent)' : 'var(--t1)',
                    border: m.isSystem ? '1px solid rgba(245,200,66,0.2)' : 'none',
                    textAlign: m.isSystem ? 'center' : 'left'
                  }}>{m.text}</div>
                ))}
              </div>

              {selected.deliveryData && (
                <div style={{ margin:'0 20px 12px', padding:'12px 16px', background:'rgba(46,204,113,0.08)', border:'1px solid rgba(46,204,113,0.3)', borderRadius:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--green)', fontFamily:'var(--font-h)', letterSpacing:'0.1em', marginBottom:6 }}>📦 ДАННЫЕ ТОВАРА</div>
                  <pre style={{ fontSize:13, color:'var(--t1)', whiteSpace:'pre-wrap', wordBreak:'break-all', margin:0 }}>{selected.deliveryData}</pre>
                </div>
              )}

              {selected.status==='active' && (
                <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)' }}>
                  {isSeller(selected) && !selected.deliveredAt && (
                    <div style={{ marginBottom:10 }}>
                      <textarea className="inp" rows={2} placeholder="Введите данные товара (логин/пароль, ключ и т.д.)" value={delivery}
                        onChange={e => setDelivery(e.target.value)} style={{ resize:'none', marginBottom:8 }}/>
                      <button className="btn btn-primary btn-full" onClick={deliver} disabled={working}>📦 Передать товар</button>
                    </div>
                  )}
                  {isBuyer(selected) && selected.deliveredAt && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                      <button className="btn btn-primary" onClick={confirm} disabled={working}>✅ Подтвердить</button>
                      <button className="btn btn-danger" onClick={dispute} disabled={working}>⚠️ Спор</button>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="inp" placeholder="Сообщение..." value={msgText}
                      onChange={e => setMsgText(e.target.value)} onKeyDown={e => e.key==='Enter' && sendMessage()} style={{ flex:1 }}/>
                    <button className="btn btn-secondary" onClick={sendMessage} disabled={working||!msgText.trim()}>→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
                      }
