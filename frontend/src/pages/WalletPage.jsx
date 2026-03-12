import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useStore } from '../store'
import toast from 'react-hot-toast'

const TX_ICONS  = { deposit:'↓', withdrawal:'↑', commission:'%', purchase:'🛒', sale:'💸', refund:'↩', adjustment:'⚡' }
const TX_COLORS = { deposit:'var(--green)', withdrawal:'var(--red)', sale:'var(--green)', refund:'#22d3ee', adjustment:'var(--purple)', purchase:'var(--red)' }
const TX_PLUS   = new Set(['deposit','sale','refund','adjustment'])

function Modal({ children, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(12px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:24, padding:28, width:'100%', maxWidth:420, animation:'fadeUp 0.25s ease' }}>
        {children}
      </div>
    </div>
  )
}

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
    refreshUser() // Обновляем баланс при открытии кошелька
    api.get('/wallet/transactions')
      .then(r => setTxs(r.data.transactions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const deposit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt < 1) return toast.error('Минимум $1')
    setWorking(true)
    try {
      const endpoint = payMethod === 'cryptocloud' ? '/wallet/deposit/cryptocloud' : '/wallet/deposit/rukassa'
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
  const Spinner = () => <span style={{ width:16, height:16, border:'2px solid transparent', borderTopColor:'currentColor', borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block' }}/>

  return (
    <div style={{ maxWidth:700, margin:'0 auto', padding:'32px 20px' }}>
      <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:28, marginBottom:24 }}>Кошелёк</h1>

      <div style={{
        background:'linear-gradient(135deg, rgba(245,200,66,0.1), var(--bg2) 60%, rgba(124,106,255,0.05))',
        border:'1px solid rgba(245,200,66,0.2)', borderRadius:24, padding:28, marginBottom:24
      }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', fontFamily:'var(--font-h)', letterSpacing:'0.14em', marginBottom:8 }}>ДОСТУПНЫЙ БАЛАНС</div>
        <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:48, color:'var(--accent)', marginBottom:4 }}>${bal.toFixed(2)}</div>
        {frz > 0 && <div style={{ color:'var(--t3)', fontSize:13, marginBottom:8 }}>🔒 В сделках: ${frz.toFixed(2)}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:20 }}>
          <button className="btn btn-primary" onClick={() => { setModal('deposit'); setAmount('') }}>↓ Пополнить</button>
          <button className="btn btn-secondary" onClick={() => { setModal('withdraw'); setAmount(''); setAddress('') }}>↑ Вывести</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:28 }}>
        {[
          ['Пополнено', '$' + parseFloat(user.totalDeposited||0).toFixed(2)],
          ['Выведено',  '$' + parseFloat(user.totalWithdrawn||0).toFixed(2)],
          ['Сделок',   (user.totalPurchases||0)+(user.totalSales||0)],
        ].map(([l,v]) => (
          <div key={l} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:16, textAlign:'center' }}>
            <div style={{ color:'var(--t3)', fontSize:11, fontFamily:'var(--font-h)', fontWeight:700, letterSpacing:'0.1em', marginBottom:4 }}>{l.toUpperCase()}</div>
            <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:18 }}>{v}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18, marginBottom:16 }}>История транзакций</h2>
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
                padding:'14px 16px', display:'flex', alignItems:'center', gap:12,
                borderLeft:`3px solid ${tx.status==='pending' ? 'var(--accent)' : color}40`
              }}>
                <div style={{ width:38, height:38, borderRadius:10, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
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

      {modal === 'deposit' && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20, marginBottom:20 }}>↓ Пополнить баланс</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
            {[
              { v:'rukassa', icon:'💳', label:'RuKassa', desc:'Карта РФ, СБП' },
              { v:'cryptocloud', icon:'☁️', label:'CryptoCloud', desc:'USDT, BTC, ETH' },
            ].map(m => (
              <button key={m.v} onClick={() => setPayMethod(m.v)} style={{
                padding:'12px 8px', borderRadius:12, cursor:'pointer', textAlign:'center', border:'1.5px solid',
                background: payMethod===m.v ? 'rgba(245,200,66,0.1)' : 'var(--bg3)',
                borderColor: payMethod===m.v ? 'rgba(245,200,66,0.5)' : 'var(--border)',
                color: payMethod===m.v ? 'var(--accent)' : 'var(--t3)', transition:'all 0.15s'
              }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{m.icon}</div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:12 }}>{m.label}</div>
                <div style={{ fontSize:11, color:'var(--t4)', marginTop:2 }}>{m.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:12 }}>
            {[5,10,25,50].map(v => (
              <button key={v} onClick={() => setAmount(String(v))} style={{
                flex:1, padding:'8px', borderRadius:8, border:'1px solid', cursor:'pointer',
                fontSize:13, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
                background: amount===String(v) ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
                borderColor: amount===String(v) ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                color: amount===String(v) ? 'var(--accent)' : 'var(--t3)'
              }}>${v}</button>
            ))}
          </div>
          <input className="inp" type="number" placeholder="Сумма в USD" value={amount} onChange={e => setAmount(e.target.value)}
            style={{ marginBottom:16, fontSize:20, fontFamily:'var(--font-h)', fontWeight:700, textAlign:'center' }}/>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Отмена</button>
            <button className="btn btn-primary" onClick={deposit} disabled={working}>{working ? <Spinner/> : '↓ Пополнить'}</button>
          </div>
        </Modal>
      )}

      {modal === 'withdraw' && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:20, marginBottom:8 }}>↑ Вывести средства</div>
          <div style={{ fontSize:13, color:'var(--t3)', marginBottom:20, lineHeight:1.6 }}>
            Вывод через <b style={{ color:'var(--t2)' }}>CryptoBot</b> в USDT. Минимум $5. Обработка до 24ч.
          </div>
          <div style={{ display:'flex', gap:6, marginBottom:12 }}>
            {[5,10,25,50,100].map(v => (
              <button key={v} onClick={() => setAmount(String(v))} style={{
                flex:1, padding:'8px', borderRadius:8, border:'1px solid', cursor:'pointer',
                fontSize:12, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
                background: amount===String(v) ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
                borderColor: amount===String(v) ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                color: amount===String(v) ? 'var(--accent)' : 'var(--t3)'
              }}>${v}</button>
            ))}
          </div>
          <input className="inp" type="number" placeholder={`Сумма (доступно $${bal.toFixed(2)})`}
            value={amount} onChange={e => setAmount(e.target.value)}
            style={{ marginBottom:12, fontFamily:'var(--font-h)', fontWeight:700, textAlign:'center', fontSize:18 }}/>
          <input className="inp" placeholder="@username или адрес CryptoBot"
            value={address} onChange={e => setAddress(e.target.value)} style={{ marginBottom:16 }}/>
          <div style={{ background:'rgba(245,200,66,0.06)', border:'1px solid rgba(245,200,66,0.2)', borderRadius:12, padding:12, marginBottom:16, fontSize:12, color:'var(--t3)', lineHeight:1.6 }}>
            💡 Откройте <a href="https://t.me/CryptoBot" target="_blank" rel="noopener" style={{ color:'var(--accent)' }}>@CryptoBot</a> в Telegram и вставьте адрес USDT.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Отмена</button>
            <button className="btn btn-primary" onClick={withdraw} disabled={working}>{working ? <Spinner/> : '↑ Вывести'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
