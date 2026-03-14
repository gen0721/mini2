import React, { useState, useEffect } from 'react'
import { Wallet, ArrowDownCircle, ArrowUpCircle, ShoppingCart, Handshake, RotateCcw, Zap, CreditCard, X, DollarSign } from '../components/Icon'
import { useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'

const TX_ICONS  = { deposit:<ArrowDownCircle size={16} strokeWidth={1.75}/>, withdrawal:<ArrowUpCircle size={16} strokeWidth={1.75}/>, commission:<Zap size={16} strokeWidth={1.75}/>, purchase:<ShoppingCart size={16} strokeWidth={1.75}/>, sale:<DollarSign size={16} strokeWidth={1.75}/>, refund:<RotateCcw size={16} strokeWidth={1.75}/>, adjustment:<Zap size={16} strokeWidth={1.75}/> }
const TX_COLORS = { deposit:'var(--green)', withdrawal:'var(--red)', sale:'var(--green)', refund:'#22d3ee', adjustment:'var(--purple)', purchase:'var(--red)' }
const TX_PLUS   = new Set(['deposit','sale','refund','adjustment'])

// Мобильная шторка снизу
function BottomSheet({ children, onClose, title }) {
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)',
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--bg2)',
        borderRadius:'24px 24px 0 0',
        padding:'0 0 env(safe-area-inset-bottom)',
        maxHeight:'92vh',
        overflowY:'auto',
        animation:'slideUp 0.3s ease',
      }}>
        {/* Ручка */}
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 4px' }}>
          <div style={{ width:40, height:4, borderRadius:2, background:'var(--border2)' }}/>
        </div>
        {/* Заголовок */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'8px 20px 16px',
        }}>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20 }}>{title}</div>
          <button onClick={onClose} style={{
            width:36, height:36, borderRadius:10, border:'1px solid var(--border)',
            background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', color:'var(--t2)', flexShrink:0,
          }}>✕</button>
        </div>
        {/* Контент */}
        <div style={{ padding:'0 20px 32px' }}>
          {children}
        </div>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

const Spinner = () => <span style={{ width:16, height:16, border:'2px solid transparent', borderTopColor:'currentColor', borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block' }}/>

export default function WalletPage() {
  const navigate = useNavigate()
  const { user, setUser, refreshUser } = useStore()
  const [txs, setTxs]         = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)
  const [amount, setAmount]   = useState('')
  const [address, setAddress] = useState('')
  const [working, setWorking] = useState(false)
  const [payMethod, setPayMethod] = useState('rukassa')

  useEffect(() => {
    if (!user) { navigate('/auth'); return }
    refreshUser()
    api.get('/wallet/transactions')
      .then(r => setTxs(r.data.transactions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const deposit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt < 2) return toast.error('Минимум $2')
    setWorking(true)
    try {
      const endpoint = payMethod === 'cryptopay' ? '/wallet/deposit/cryptopay' : '/wallet/deposit/rukassa'
      const { data } = await api.post(endpoint, { amount: amt })
      if (data.payUrl) {
        window.open(data.payUrl, '_blank')
        toast.success('Откроется страница оплаты')
        setModal(null); setAmount('')
        setTimeout(refreshUser, 5000)
        setTimeout(refreshUser, 15000)
      }
    } catch(e) { toast.error(e.response?.data?.error || 'Ошибка оплаты') }
    setWorking(false)
  }

  const withdraw = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt < 5) return toast.error('Минимальный вывод $5')
    if (!address.trim()) return toast.error('Введите адрес CryptoBot')
    setWorking(true)
    try {
      const { data } = await api.post('/wallet/withdraw', { amount: amt, address: address.trim(), currency: 'USDT' })
      toast.success(data.message || 'Запрос отправлен')
      setModal(null); setAmount(''); setAddress('')
      refreshUser()
      api.get('/wallet/transactions').then(r => setTxs(r.data.transactions || [])).catch(() => {})
    } catch(e) { toast.error(e.response?.data?.error || 'Ошибка') }
    setWorking(false)
  }

  if (!user) return null
  const bal = parseFloat(user.balance || 0)
  const frz = parseFloat(user.frozenBalance || 0)

  return (
    <div style={{ maxWidth:600, margin:'0 auto', padding:'24px 12px 100px' }}>
      <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:26, marginBottom:20 }}>💳 Кошелёк</h1>

      {/* Карточка баланса */}
      <div style={{
        background:'linear-gradient(135deg, rgba(245,200,66,0.15), var(--bg2) 60%, rgba(124,106,255,0.08))',
        border:'1px solid rgba(245,200,66,0.25)', borderRadius:24, padding:'24px 20px', marginBottom:16,
      }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', fontFamily:'var(--font-h)', letterSpacing:'0.14em', marginBottom:6 }}>ДОСТУПНЫЙ БАЛАНС</div>
        <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:44, color:'var(--accent)', marginBottom:4 }}>${bal.toFixed(2)}</div>
        {frz > 0 && <div style={{ color:'var(--t3)', fontSize:13, marginBottom:12 }}>🔒 В сделках: ${frz.toFixed(2)}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:16 }}>
          <button className="btn btn-primary" style={{ height:48, fontSize:15, borderRadius:14 }}
            onClick={() => { setModal('deposit'); setAmount('') }}>
            ↓ Пополнить
          </button>
          <button className="btn btn-secondary" style={{ height:48, fontSize:15, borderRadius:14 }}
            onClick={() => { setModal('withdraw'); setAmount(''); setAddress('') }}>
            ↑ Вывести
          </button>
        </div>
      </div>

      {/* Статистика */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:24 }}>
        {[
          ['Пополнено', '$' + parseFloat(user.totalDeposited||0).toFixed(2)],
          ['Выведено',  '$' + parseFloat(user.totalWithdrawn||0).toFixed(2)],
          ['Сделок',   (user.totalPurchases||0)+(user.totalSales||0)],
        ].map(([l,v]) => (
          <div key={l} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 10px', textAlign:'center' }}>
            <div style={{ color:'var(--t3)', fontSize:10, fontFamily:'var(--font-h)', fontWeight:700, letterSpacing:'0.1em', marginBottom:4 }}>{l.toUpperCase()}</div>
            <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:16 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* История транзакций */}
      <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:17, marginBottom:14 }}>История транзакций</h2>
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {[0,1,2,3].map(i => <div key={i} className="skel" style={{ height:64 }}/>)}
        </div>
      ) : txs.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>💸</div>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Транзакций нет</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {txs.map((tx, i) => {
            const plus  = TX_PLUS.has(tx.type)
            const color = TX_COLORS[tx.type] || 'var(--t2)'
            const amt   = Math.abs(parseFloat(tx.amount))
            const date  = new Date(tx.created_at ? tx.created_at * 1000 : tx.createdAt)
            return (
              <div key={tx.id||tx._id||i} style={{
                background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14,
                padding:'12px 14px', display:'flex', alignItems:'center', gap:12,
                borderLeft:`3px solid ${tx.status==='pending' ? 'var(--accent)' : color}40`
              }}>
                <div style={{ width:40, height:40, borderRadius:12, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                  {TX_ICONS[tx.type]||'•'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.description||tx.type}</div>
                  <div style={{ fontSize:11, color:'var(--t3)', marginTop:2, display:'flex', gap:8 }}>
                    <span>{date.toLocaleString('ru',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                    {tx.status==='pending' && <span style={{ color:'var(--accent)', fontWeight:700 }}>ОЖИДАНИЕ</span>}
                  </div>
                </div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:15, color: plus ? 'var(--green)' : 'var(--red)', flexShrink:0 }}>
                  {plus?'+':'-'}${amt.toFixed(2)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Шторка пополнения ── */}
      {modal === 'deposit' && (
        <BottomSheet onClose={() => setModal(null)} title="↓ Пополнить баланс">

          {/* Выбор метода */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
            {[
              { v:'rukassa',   icon:'🏦', label:'RuKassa',   desc:'Карта РФ, СБП' },
              { v:'cryptopay', icon:'✈️', label:'CryptoPay', desc:'USDT, TON, BTC' },
            ].map(m => (
              <button key={m.v} onClick={() => setPayMethod(m.v)} style={{
                padding:'14px 8px', borderRadius:14, cursor:'pointer', textAlign:'center', border:'1.5px solid',
                background: payMethod===m.v ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
                borderColor: payMethod===m.v ? 'rgba(245,200,66,0.5)' : 'var(--border)',
                color: payMethod===m.v ? 'var(--accent)' : 'var(--t3)', transition:'all 0.15s',
              }}>
                <div style={{ fontSize:26, marginBottom:6 }}>{m.icon}</div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:13 }}>{m.label}</div>
                <div style={{ fontSize:11, color:'var(--t4)', marginTop:2 }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* Быстрые суммы */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
            {[5,10,25,50].map(v => (
              <button key={v} onClick={() => setAmount(String(v))} style={{
                padding:'12px 4px', borderRadius:10, border:'1.5px solid', cursor:'pointer',
                fontSize:14, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
                background: amount===String(v) ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
                borderColor: amount===String(v) ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                color: amount===String(v) ? 'var(--accent)' : 'var(--t2)',
              }}>${v}</button>
            ))}
          </div>

          {/* Ввод суммы */}
          <input className="inp" type="number" inputMode="decimal" placeholder="Минимум $2" min="2" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ marginBottom:12, fontSize:22, fontFamily:'var(--font-h)', fontWeight:800, textAlign:'center', height:56 }}/>

          {/* Расчёт комиссии */}
          {parseFloat(amount) >= 2 && (() => {
            const amt     = parseFloat(amount) || 0
            const fee     = payMethod === 'rukassa' ? amt * 0.04 : amt * 0.01
            const receive = Math.max(0, amt - fee)
            return (
              <div style={{ background:'rgba(245,200,66,0.06)', border:'1px solid rgba(245,200,66,0.15)', borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:14, color:'var(--t3)' }}>Сумма оплаты</span>
                  <span style={{ fontSize:14, fontWeight:700 }}>${amt.toFixed(2)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:14, color:'var(--t3)' }}>Комиссия {payMethod === 'rukassa' ? 'RuKassa (~4%)' : 'CryptoPay (~1%)'}</span>
                  <span style={{ fontSize:14, color:'var(--red)' }}>−${fee.toFixed(2)}</span>
                </div>
                <div style={{ height:1, background:'var(--border)', margin:'10px 0' }}/>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:15, fontWeight:700 }}>Получите на баланс</span>
                  <span style={{ fontSize:16, fontWeight:800, color:'var(--green)' }}>${receive.toFixed(2)}</span>
                </div>
              </div>
            )
          })()}

          <button className="btn btn-primary btn-full" style={{ height:52, fontSize:16, borderRadius:14 }}
            onClick={deposit} disabled={working || parseFloat(amount) < 2}>
            {working ? <Spinner/> : `↓ Пополнить${parseFloat(amount) >= 2 ? ' $' + parseFloat(amount).toFixed(2) : ''}`}
          </button>
        </BottomSheet>
      )}

      {/* ── Шторка вывода ── */}
      {modal === 'withdraw' && (
        <BottomSheet onClose={() => setModal(null)} title="↑ Вывести средства">

          <div style={{ background:'var(--bg3)', borderRadius:12, padding:'10px 14px', marginBottom:18, fontSize:13, color:'var(--t3)', lineHeight:1.6 }}>
            Вывод через <b style={{ color:'var(--t2)' }}>CryptoBot</b> в USDT · Минимум $5 · До 24ч
          </div>

          {/* Быстрые суммы */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6, marginBottom:14 }}>
            {[5,10,25,50,100].map(v => (
              <button key={v} onClick={() => setAmount(String(v))} style={{
                padding:'10px 4px', borderRadius:10, border:'1.5px solid', cursor:'pointer',
                fontSize:13, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
                background: amount===String(v) ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
                borderColor: amount===String(v) ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                color: amount===String(v) ? 'var(--accent)' : 'var(--t2)',
              }}>${v}</button>
            ))}
          </div>

          {/* Ввод суммы */}
          <input className="inp" type="number" inputMode="decimal"
            placeholder={`Сумма (доступно $${bal.toFixed(2)})`}
            value={amount} onChange={e => setAmount(e.target.value)}
            style={{ marginBottom:12, fontFamily:'var(--font-h)', fontWeight:800, textAlign:'center', fontSize:20, height:54 }}/>

          {/* Расчёт комиссии при выводе */}
          {parseFloat(amount) >= 5 && (() => {
            const amt     = parseFloat(amount) || 0
            const fee     = Math.round(amt * 0.05 * 100) / 100
            const receive = Math.round((amt - fee) * 100) / 100
            return (
              <div style={{ background:'rgba(245,200,66,0.06)', border:'1px solid rgba(245,200,66,0.15)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:14, color:'var(--t3)' }}>Сумма вывода</span>
                  <span style={{ fontSize:14, fontWeight:700 }}>${amt.toFixed(2)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:14, color:'var(--t3)' }}>Комиссия платформы (5%)</span>
                  <span style={{ fontSize:14, color:'var(--red)' }}>−${fee.toFixed(2)}</span>
                </div>
                <div style={{ height:1, background:'var(--border)', margin:'10px 0' }}/>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:15, fontWeight:700 }}>Получите</span>
                  <span style={{ fontSize:16, fontWeight:800, color:'var(--green)' }}>${receive.toFixed(2)}</span>
                </div>
              </div>
            )
          })()}

          {/* Адрес */}
          <input className="inp" placeholder="@username или адрес CryptoBot"
            value={address} onChange={e => setAddress(e.target.value)}
            style={{ marginBottom:12, fontSize:14, height:50 }}/>

          <div style={{ background:'rgba(245,200,66,0.06)', border:'1px solid rgba(245,200,66,0.15)', borderRadius:12, padding:'10px 14px', marginBottom:16, fontSize:12, color:'var(--t3)', lineHeight:1.6 }}>
            Откройте <a href="https://t.me/CryptoBot" target="_blank" rel="noopener" style={{ color:'var(--accent)' }}>@CryptoBot</a> в Telegram → Получить → скопируйте адрес USDT.
          </div>

          <button className="btn btn-primary btn-full" style={{ height:52, fontSize:16, borderRadius:14 }}
            onClick={withdraw} disabled={working}>
            {working ? <Spinner/> : `↑ Вывести${parseFloat(amount) >= 5 ? ' $' + parseFloat(amount).toFixed(2) : ''}`}
          </button>
        </BottomSheet>
      )}
    </div>
  )
}
