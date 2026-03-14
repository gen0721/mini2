import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle, AlertTriangle, RotateCcw, Package, Send, ArrowLeft } from '../components/Icon'
import Particles from '../components/Particles/Particles'
import { useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'

const STATUS_LABELS = { pending:'Ожидание', active:'Активна', completed:'Завершена', disputed:'Спор', cancelled:'Отменена', refunded:'Возврат' }
const STATUS_COLORS = { pending:'var(--accent)', active:'var(--green)', completed:'var(--t3)', disputed:'var(--red)', cancelled:'var(--t4)', refunded:'#22d3ee' }

function DealListItem({ d, isSelected, isBuyer, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: isSelected ? 'var(--bg3)' : 'var(--bg2)',
      border: `1px solid ${isSelected ? 'rgba(245,200,66,0.35)' : d.status==='disputed' ? 'rgba(231,76,60,0.3)' : 'var(--border)'}`,
      borderRadius:14, padding:'14px 16px', cursor:'pointer', transition:'all 0.15s'
    }}>
      <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>
        {d.product?.title||'Товар'}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, color:'var(--t3)' }}>
          {isBuyer ? 'Покупка' : 'Продажа'} · @{(isBuyer ? d.seller : d.buyer)?.username||'—'}
        </span>
        <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLORS[d.status]||'var(--t3)' }}>{STATUS_LABELS[d.status]||d.status}</span>
      </div>
      <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14, color:'var(--accent)', marginTop:4 }}>${parseFloat(d.amount||0).toFixed(2)}</div>
    </div>
  )
}

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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => { if (!user) navigate('/auth') }, [user])

  useEffect(() => {
    setLoading(true)
    api.get(`/deals?role=${role}`)
      .then(r => setDeals(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [role])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [selected?.messages?.length])

  const loadDeal = async (id) => {
    try {
      const { data } = await api.get(`/deals/${id}`)
      setSelected(data)
    } catch { toast.error('Ошибка загрузки сделки') }
  }

  const reloadAll = (id) => {
    loadDeal(id)
    api.get(`/deals?role=${role}`).then(r => setDeals(Array.isArray(r.data) ? r.data : []))
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
      toast.success('Товар передан покупателю!')
      setDelivery('')
      reloadAll(selected._id||selected.id)
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const confirm = async () => {
    if (!window.confirm('Подтвердить получение товара? Деньги будут переведены продавцу.')) return
    setWorking(true)
    try {
      await api.post(`/deals/${selected._id||selected.id}/confirm`)
      toast.success('Сделка завершена! Деньги переведены продавцу.')
      reloadAll(selected._id||selected.id)
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const requestRefund = async () => {
    if (!window.confirm('Вернуть деньги покупателю? Сделка будет отменена.')) return
    setWorking(true)
    try {
      await api.post(`/deals/${selected._id||selected.id}/refund`, { reason: 'Отмена покупателем' })
      toast.success('Деньги возвращены покупателю.')
      reloadAll(selected._id||selected.id)
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const dispute = async () => {
    const reason = window.prompt('Опишите проблему с товаром:')
    if (!reason?.trim()) return
    setWorking(true)
    try {
      await api.post(`/deals/${selected._id||selected.id}/dispute`, { reason })
      toast.success('Спор открыт. Администратор рассмотрит в течение 24ч.')
      reloadAll(selected._id||selected.id)
    } catch(e) { toast.error(e.response?.data?.error||'Ошибка') }
    setWorking(false)
  }

  const uid      = user?._id || user?.id
  const isBuyer  = d => String(d?.buyer?._id || d?.buyer?.id || d?.buyer_id)  === String(uid)
  const isSeller = d => String(d?.seller?._id || d?.seller?.id || d?.seller_id) === String(uid)

  // На мобильном показываем либо список, либо детали
  const showList   = !isMobile || !selected
  const showDetail = !isMobile || !!selected

  if (!user) return null

  // ── Панель деталей ─────────────────────────────────────────────────────────
  const DetailPanel = () => (
    <div style={{
      background:'var(--bg2)', border: isMobile ? 'none' : '1px solid var(--border)',
      borderRadius: isMobile ? 0 : 20,
      display:'flex', flexDirection:'column',
      height: isMobile ? 'calc(100dvh - 60px)' : 'calc(100vh - 180px)',
      minHeight: isMobile ? 'unset' : 500,
      overflow:'hidden'
    }}>
      {!selected ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t3)', flexDirection:'column', gap:12 }}>
          <Package size={48} strokeWidth={0.75} style={{ opacity:0.25 }}/>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:16 }}>Выберите сделку</div>
          <div style={{ fontSize:13 }}>Нажмите на сделку слева</div>
        </div>
      ) : (
        <>
          {/* Шапка */}
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            {/* Кнопка назад на мобильном */}
            {isMobile && (
              <button onClick={() => setSelected(null)} style={{
                display:'flex', alignItems:'center', gap:6,
                background:'none', border:'none', color:'var(--t3)',
                fontSize:13, cursor:'pointer', padding:0, marginBottom:10
              }}>
                <ArrowLeft size={16} strokeWidth={2}/> Назад к сделкам
              </button>
            )}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {selected.product?.title||'—'}
                </div>
                <div style={{ fontSize:12, color:'var(--t3)' }}>
                  {isBuyer(selected) ? `Продавец: @${selected.seller?.username||'—'}` : `Покупатель: @${selected.buyer?.username||'—'}`}
                  {' · '}
                  <span style={{ color: STATUS_COLORS[selected.status]||'var(--t3)', fontWeight:700 }}>
                    {STATUS_LABELS[selected.status]||selected.status}
                  </span>
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20, color:'var(--accent)' }}>${parseFloat(selected.amount||0).toFixed(2)}</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>в эскроу</div>
              </div>
            </div>

            {/* Эскроу статус-бар */}
            {selected.status === 'active' && (
              <div style={{ marginTop:12, display:'flex', alignItems:'center' }}>
                {[
                  ['✓', 'Оплачено', true],
                  ['↓', 'Передан', !!selected.deliveredAt],
                  ['✓', 'Подтверждено', false],
                ].map(([icon, label, done], i, arr) => (
                  <React.Fragment key={label}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <div style={{
                        width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, fontWeight:700,
                        background: done ? 'rgba(46,204,113,0.2)' : 'var(--bg3)',
                        border: `2px solid ${done ? 'var(--green)' : 'var(--border)'}`,
                        color: done ? 'var(--green)' : 'var(--t4)',
                      }}>{icon}</div>
                      <div style={{ fontSize:10, color: done ? 'var(--green)' : 'var(--t4)', fontWeight:600, whiteSpace:'nowrap' }}>{label}</div>
                    </div>
                    {i < arr.length-1 && (
                      <div style={{ flex:1, height:2, background: done ? 'var(--green)' : 'var(--border)', margin:'0 4px', marginBottom:14 }}/>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Чат */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
            {(!selected.messages || selected.messages.length === 0) && (
              <div style={{ textAlign:'center', color:'var(--t4)', fontSize:13, margin:'auto' }}>Сообщений пока нет</div>
            )}
            {selected.messages?.map((m, i) => (
              <div key={i} style={{
                padding:'10px 14px', borderRadius:12,
                background: m.isSystem ? 'rgba(245,200,66,0.07)' : String(m.sender)===uid ? 'rgba(124,106,255,0.18)' : 'var(--bg3)',
                alignSelf: m.isSystem ? 'stretch' : String(m.sender)===uid ? 'flex-end' : 'flex-start',
                maxWidth: m.isSystem ? '100%' : '80%',
                fontSize:13, lineHeight:1.5,
                color: m.isSystem ? 'var(--accent)' : 'var(--t1)',
                border: m.isSystem ? '1px solid rgba(245,200,66,0.18)' : 'none',
                textAlign: m.isSystem ? 'center' : 'left',
                wordBreak:'break-word',
              }}>{m.text}</div>
            ))}
            <div ref={messagesEndRef}/>
          </div>

          {/* Данные товара */}
          {selected.deliveryData && (
            <div style={{ margin:'0 12px 8px', padding:'12px 14px', background:'rgba(46,204,113,0.07)', border:'1px solid rgba(46,204,113,0.25)', borderRadius:12, flexShrink:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--green)', fontFamily:'var(--font-h)', letterSpacing:'0.1em', marginBottom:6 }}>ДАННЫЕ ТОВАРА</div>
              <pre style={{ fontSize:13, color:'var(--t1)', whiteSpace:'pre-wrap', wordBreak:'break-all', margin:0 }}>{selected.deliveryData}</pre>
            </div>
          )}

          {/* Действия */}
          <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>

            {/* Продавец — передать товар */}
            {selected.status==='active' && isSeller(selected) && !selected.deliveredAt && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', fontFamily:'var(--font-h)', letterSpacing:'0.1em', marginBottom:6 }}>ДАННЫЕ ДЛЯ ПОКУПАТЕЛЯ</div>
                <textarea className="inp" rows={3} placeholder="Логин/пароль, ключ активации, ссылка..." value={delivery}
                  onChange={e => setDelivery(e.target.value)} style={{ resize:'none', marginBottom:8, fontSize:13 }}/>
                <button className="btn btn-primary btn-full" onClick={deliver} disabled={working}>
                  {working ? '...' : <><Package size={15} style={{marginRight:6}}/> Передать товар покупателю</>}
                </button>
              </div>
            )}

            {/* Покупатель — кнопки после получения */}
            {selected.status==='active' && isBuyer(selected) && selected.deliveredAt && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <button className="btn btn-primary" onClick={confirm} disabled={working} style={{ fontSize:12, padding:'10px 8px' }}>
                  <CheckCircle size={14} style={{marginRight:4}}/> Подтвердить
                </button>
                <button className="btn btn-danger" onClick={dispute} disabled={working} style={{ fontSize:12, padding:'10px 8px' }}>
                  <AlertTriangle size={14} style={{marginRight:4}}/> Спор
                </button>
              </div>
            )}

            {/* Продавец — кнопка возврата денег покупателю */}
            {selected.status==='active' && isSeller(selected) && (
              <button onClick={requestRefund} disabled={working} style={{
                padding:'10px', borderRadius:10, border:'1px solid rgba(34,211,238,0.3)', cursor:'pointer',
                background:'rgba(34,211,238,0.06)', color:'#22d3ee', fontSize:13, fontWeight:600, width:'100%',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6
              }}>
                <RotateCcw size={15} strokeWidth={1.75}/> Вернуть деньги покупателю
              </button>
            )}

            {/* Спор — инфо */}
            {selected.status==='disputed' && (
              <div style={{ padding:'10px 14px', background:'rgba(231,76,60,0.07)', border:'1px solid rgba(231,76,60,0.25)', borderRadius:10, fontSize:13, color:'var(--red)' }}>
                Спор на рассмотрении. Администратор решит в течение 24ч.
              </div>
            )}

            {/* Возврат — инфо */}
            {selected.status==='refunded' && (
              <div style={{ padding:'10px 14px', background:'rgba(34,211,238,0.07)', border:'1px solid rgba(34,211,238,0.25)', borderRadius:10, fontSize:13, color:'#22d3ee' }}>
                Деньги возвращены на баланс.
              </div>
            )}

            {/* Инпут сообщения */}
            {['active','disputed'].includes(selected.status) && (
              <div style={{ display:'flex', gap:8 }}>
                <input className="inp" placeholder="Напишите сообщение..." value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => e.key==='Enter' && !e.shiftKey && sendMessage()}
                  style={{ flex:1, fontSize:13 }}/>
                <button className="btn btn-secondary" onClick={sendMessage} disabled={working||!msgText.trim()}
                  style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:6 }}>
                  <Send size={16} strokeWidth={1.75}/>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

  return (
    <div style={{ position:'relative', minHeight:'100vh', overflow:'hidden' }}>
      {/* Particles фон */}
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none' }}>
        <Particles
          particleColors={['#ffffff']}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover={false}
          alphaParticles={false}
          disableRotation={false}
          pixelRatio={1}
        />
      </div>

      {/* Контент поверх */}
      <div style={{ position:'relative', zIndex:1, maxWidth:1100, margin:'0 auto', padding: isMobile ? '16px 12px' : '32px 20px' }}>

      {/* Заголовок — скрываем на мобильном когда открыта сделка */}
      {!(isMobile && selected) && (
        <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize: isMobile ? 22 : 28, marginBottom: isMobile ? 16 : 24 }}>
          Мои сделки
        </h1>
      )}

      {isMobile ? (
        // ── МОБИЛЬНЫЙ: список или детали ─────────────────────────────────────
        showList ? (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', gap:6 }}>
              {[['all','Все'],['buyer','Покупки'],['seller','Продажи']].map(([v,l]) => (
                <button key={v} onClick={() => setRole(v)} style={{
                  flex:1, padding:'9px', borderRadius:8, border:'1px solid', cursor:'pointer',
                  fontSize:13, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
                  background: role===v ? 'rgba(245,200,66,0.1)' : 'transparent',
                  borderColor: role===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                  color: role===v ? 'var(--accent)' : 'var(--t3)'
                }}>{l}</button>
              ))}
            </div>
            {loading ? (
              [0,1,2,3].map(i => <div key={i} className="skel" style={{ height:80, borderRadius:14 }}/>)
            ) : deals.length===0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t3)' }}>
                <Package size={40} strokeWidth={0.75} style={{ opacity:0.25, marginBottom:12 }}/>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Сделок нет</div>
              </div>
            ) : deals.map(d => (
              <DealListItem key={d._id||d.id} d={d}
                isSelected={false} isBuyer={isBuyer(d)}
                onClick={() => loadDeal(d._id||d.id)}
              />
            ))}
          </div>
        ) : (
          <DetailPanel/>
        )
      ) : (
        // ── ДЕСКТОП: список + детали рядом ───────────────────────────────────
        <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:16, alignItems:'start' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', gap:6 }}>
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
              [0,1,2,3].map(i => <div key={i} className="skel" style={{ height:80, borderRadius:14 }}/>)
            ) : deals.length===0 ? (
              <div style={{ textAlign:'center', padding:'24px 12px', color:'var(--t3)' }}>
                <Package size={36} strokeWidth={0.75} style={{ opacity:0.25, marginBottom:10 }}/>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Сделок нет</div>
              </div>
            ) : deals.map(d => (
              <DealListItem key={d._id||d.id} d={d}
                isSelected={(selected?._id||selected?.id) === (d._id||d.id)}
                isBuyer={isBuyer(d)}
                onClick={() => loadDeal(d._id||d.id)}
              />
            ))}
          </div>
          <DetailPanel/>
        </div>
      )}
      </div>
    </div>
  )
}
