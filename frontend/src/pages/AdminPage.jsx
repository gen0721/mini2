import React, { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

const adminApi = {
  get:  (path) => fetch('/api/admin' + path, { headers:{ 'x-admin-token': localStorage.getItem('mn_admin_token')||'' } }).then(r => r.json()),
  post: (path, body) => fetch('/api/admin' + path, { method:'POST', headers:{ 'Content-Type':'application/json', 'x-admin-token': localStorage.getItem('mn_admin_token')||'' }, body: JSON.stringify(body) }).then(r => r.json()),
  del:  (path) => fetch('/api/admin' + path, { method:'DELETE', headers:{ 'x-admin-token': localStorage.getItem('mn_admin_token')||'' } }).then(r => r.json()),
}

const STATUS_COLOR = { active:'var(--green)', pending:'var(--accent)', completed:'var(--t3)', disputed:'var(--red)', refunded:'#22d3ee' }
const STATUS_LABEL = { active:'Активна', pending:'Ожидание', completed:'Завершена', disputed:'Спор', refunded:'Возврат' }

export default function AdminPage() {
  const [authed, setAuthed] = useState(
    !!localStorage.getItem('mn_admin_token') || !!localStorage.getItem('mn_token')
  )
  const [login, setLogin]   = useState('')
  const [pass, setPass]     = useState('')
  const [tab, setTab]       = useState('stats')
  const [stats, setStats]   = useState(null)
  const [users, setUsers]   = useState([])
  const [deals, setDeals]   = useState([])
  const [products, setProducts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading]   = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [msgUserId, setMsgUserId]   = useState('')
  const [msgText, setMsgText]       = useState('')

  const handleLogin = async () => {
    setLoading(true)
    const res = await adminApi.post('/login', { login, password: pass })
    setLoading(false)
    if (res.token) {
      localStorage.setItem('mn_admin_token', res.token)
      setAuthed(true)
      toast.success('Добро пожаловать!')
    } else {
      toast.error(res.error || 'Неверные данные')
    }
  }

  const loadTab = async (t) => {
    setLoading(true)
    try {
      if (t === 'stats') {
        const res = await adminApi.get('/stats')
        setStats(res)
      } else if (t === 'users') {
        const res = await adminApi.get(`/users?search=${encodeURIComponent(userSearch)}`)
        setUsers(res.users || [])
      } else if (t === 'deals') {
        const res = await adminApi.get('/deals')
        setDeals(res.deals || [])
      } else if (t === 'products') {
        const res = await adminApi.get('/products')
        setProducts(res.products || [])
      } else if (t === 'transactions') {
        const res = await adminApi.get('/transactions')
        setTransactions(res.transactions || [])
      }
    } catch { toast.error('Ошибка загрузки') }
    setLoading(false)
  }

  useEffect(() => { if (authed) loadTab(tab) }, [authed, tab])

  const banUser = async (id) => {
    const hours  = window.prompt('Часов блокировки (пусто = навсегда):')
    const reason = window.prompt('Причина:') || ''
    const res = await adminApi.post(`/users/${id}/ban`, { hours: hours ? parseInt(hours) : null, reason })
    res.ok ? (toast.success('Заблокирован'), loadTab('users')) : toast.error(res.error)
  }

  const unbanUser = async (id) => {
    const res = await adminApi.post(`/users/${id}/unban`, {})
    res.ok ? (toast.success('Разблокирован'), loadTab('users')) : toast.error(res.error)
  }

  const makeSubAdmin = async (id, isSubAdmin) => {
    const endpoint = isSubAdmin ? 'remove-subadmin' : 'make-subadmin'
    const res = await adminApi.post(`/users/${id}/${endpoint}`, {})
    res.ok
      ? (toast.success(isSubAdmin ? 'Права сняты' : 'Назначен помощником'), loadTab('users'))
      : toast.error(res.error)
  }

  const adjustBalance = async (id) => {
    const amount = window.prompt('Сумма (+/-):', '0')
    const reason = window.prompt('Причина:') || 'Admin'
    if (!amount) return
    const res = await adminApi.post(`/users/${id}/balance`, { amount: parseFloat(amount), reason })
    res.ok ? (toast.success(`Баланс: $${res.newBalance?.toFixed(2)}`), loadTab('users')) : toast.error(res.error)
  }

  const verifyUser = async (id) => {
    const res = await adminApi.post(`/users/${id}/verify`, {})
    res.ok ? (toast.success('Верифицирован'), loadTab('users')) : toast.error(res.error)
  }

  const deleteProduct = async (id) => {
    if (!window.confirm('Удалить товар?')) return
    const res = await adminApi.del(`/products/${id}`)
    res.ok ? (toast.success('Удалён'), loadTab('products')) : toast.error(res.error)
  }

  const resolveDispute = async (dealId, decision) => {
    const note = window.prompt('Примечание:')
    const res  = await adminApi.post(`/deals/${dealId}/resolve`, { decision, note })
    res.ok
      ? (toast.success(decision === 'complete' ? 'Решено в пользу продавца' : 'Возврат покупателю'), loadTab('deals'))
      : toast.error(res.error)
  }

  const MiniChart = ({ data }) => {
    if (!data?.length) return null
    const max = Math.max(...data.map(d => d.revenue || 0), 1)
    return (
      <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:60, padding:'0 4px' }}>
        {data.slice(-12).map((d, i) => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div title={`${d.month}: $${parseFloat(d.revenue||0).toFixed(2)}`} style={{
              width:'100%', borderRadius:'4px 4px 0 0',
              height: `${Math.max(4, ((d.revenue||0)/max)*52)}px`,
              background:'linear-gradient(to top, rgba(245,200,66,0.8), rgba(245,200,66,0.3))',
              transition:'height 0.3s', cursor:'pointer'
            }}/>
          </div>
        ))}
      </div>
    )
  }

  if (!authed) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20,
      background:'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(245,200,66,0.06), var(--bg))' }}>
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:24, padding:36, width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>⚡</div>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:22 }}>Панель администратора</div>
        </div>
        <input className="inp" placeholder="Логин" value={login} onChange={e => setLogin(e.target.value)} style={{ marginBottom:10 }}/>
        <input className="inp" type="password" placeholder="Пароль" value={pass} onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key==='Enter' && handleLogin()} style={{ marginBottom:16 }}/>
        <button className="btn btn-primary btn-full" onClick={handleLogin} disabled={loading}>
          {loading ? '...' : 'Войти →'}
        </button>
      </div>
    </div>
  )

  const TABS = [
    ['stats','📊 Статистика'],['users','👥 Пользователи'],['deals','🤝 Сделки'],
    ['products','📦 Товары'],['transactions','💳 Транзакции'],['messages','💬 Сообщения']
  ]

  return (
    <div style={{ maxWidth:1280, margin:'0 auto', padding:'24px 20px', minHeight:'100vh' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:24 }}>⚡ Панель администратора</h1>
        <button className="btn btn-danger btn-sm" onClick={() => { localStorage.removeItem('mn_admin_token'); setAuthed(false) }}>Выйти</button>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:24, flexWrap:'wrap' }}>
        {TABS.map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{
            padding:'8px 16px', borderRadius:8, border:'1px solid', cursor:'pointer',
            fontSize:13, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
            background: tab===v ? 'rgba(245,200,66,0.12)' : 'transparent',
            borderColor: tab===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
            color: tab===v ? 'var(--accent)' : 'var(--t2)'
          }}>{l}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Загрузка...</div>}

      {/* STATS */}
      {tab==='stats' && stats && !loading && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:28 }}>
            {[
              ['Пользователей', stats.users, '👥'],
              ['Активных товаров', stats.products, '📦'],
              ['Всего сделок', stats.deals, '🤝'],
              ['Доход', '$'+parseFloat(stats.revenue||0).toFixed(2), '💰'],
            ].map(([l,v,i]) => (
              <div key={l} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:20, textAlign:'center' }}>
                <div style={{ fontSize:28, marginBottom:8 }}>{i}</div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:24, color:'var(--accent)' }}>{v}</div>
                <div style={{ color:'var(--t3)', fontSize:12, marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
          {stats.monthlyRevenue?.length > 0 && (
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:20, marginBottom:28 }}>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15, marginBottom:12 }}>📈 Доход по месяцам</div>
              <MiniChart data={stats.monthlyRevenue}/>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                <span style={{ fontSize:11, color:'var(--t4)' }}>{stats.monthlyRevenue[0]?.month}</span>
                <span style={{ fontSize:11, color:'var(--t4)' }}>{stats.monthlyRevenue[stats.monthlyRevenue.length-1]?.month}</span>
              </div>
            </div>
          )}
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18, marginBottom:14 }}>Последние сделки</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {stats.recentDeals?.map(d => (
              <div key={d._id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', gap:16, alignItems:'center' }}>
                <div style={{ flex:1, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.product?.title}</div>
                <div style={{ fontSize:12, color:'var(--t3)' }}>@{d.buyer?.username} → @{d.seller?.username}</div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, color:'var(--accent)' }}>${d.amount}</div>
                <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[d.status] }}>{STATUS_LABEL[d.status]||d.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* USERS */}
      {tab==='users' && !loading && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <input className="inp" placeholder="Поиск по логину или TG ID..." value={userSearch}
              onChange={e => setUserSearch(e.target.value)} style={{ flex:1 }}
              onKeyDown={e => e.key==='Enter' && loadTab('users')}/>
            <button className="btn btn-secondary" onClick={() => loadTab('users')}>Найти</button>
          </div>
          <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>{users.length} пользователей</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {users.map(u => (
              <div key={u._id||u.id} style={{
                background:'var(--bg2)',
                border:`1px solid ${u.isBanned ? 'rgba(231,76,60,0.3)' : 'var(--border)'}`,
                borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:12
              }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>
                    @{u.username||'—'}
                    {u.isAdmin && <span style={{ color:'var(--accent)', marginLeft:6 }}>⚡</span>}
                    {u.isVerified && <span style={{ color:'var(--green)', marginLeft:6 }}>✓</span>}
                    {u.isBanned && <span style={{ color:'var(--red)', marginLeft:6 }}>🚫</span>}
                  </div>
                  <div style={{ fontSize:12, color:'var(--t3)' }}>
                    Баланс: ${parseFloat(u.balance||0).toFixed(2)} · Рейт: {(u.rating||5).toFixed(1)} · TG: {u.telegram_id||'—'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => adjustBalance(u._id||u.id)}>💰</button>
                  {!u.isVerified && <button className="btn btn-sm btn-secondary" onClick={() => verifyUser(u._id||u.id)}>✓</button>}
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => makeSubAdmin(u._id||u.id, u.isSubAdmin)}
                    title={u.isSubAdmin ? 'Снять права помощника' : 'Назначить помощником'}
                    style={{ color: u.isSubAdmin ? 'var(--accent)' : 'var(--t3)' }}
                  >⚡</button>
                  {u.isBanned
                    ? <button className="btn btn-sm btn-secondary" onClick={() => unbanUser(u._id||u.id)}>✅</button>
                    : <button className="btn btn-sm btn-danger" onClick={() => banUser(u._id||u.id)}>🚫</button>
                  }
                  <button className="btn btn-sm btn-ghost" onClick={() => { setMsgUserId(u._id||u.id); setTab('messages') }}>💬</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DEALS */}
      {tab==='deals' && !loading && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {deals.filter(d => d.status==='disputed').length > 0 && (
            <div style={{ background:'rgba(231,76,60,0.06)', border:'1px solid rgba(231,76,60,0.3)', borderRadius:12, padding:'10px 16px', marginBottom:8, fontSize:13, color:'var(--red)', fontWeight:700 }}>
              ⚠️ {deals.filter(d => d.status==='disputed').length} спора требуют рассмотрения
            </div>
          )}
          {deals.map(d => (
            <div key={d._id||d.id} style={{
              background:'var(--bg2)',
              border:`1px solid ${d.status==='disputed' ? 'rgba(231,76,60,0.3)' : 'var(--border)'}`,
              borderRadius:12, padding:'14px 16px'
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{d.product?.title}</div>
                  <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>@{d.buyer?.username} → @{d.seller?.username}</div>
                  {d.disputeReason && <div style={{ fontSize:12, color:'var(--red)', marginTop:4 }}>Спор: {d.disputeReason}</div>}
                </div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, color:'var(--accent)' }}>${parseFloat(d.amount).toFixed(2)}</div>
                <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[d.status] }}>{STATUS_LABEL[d.status]||d.status}</span>
              </div>
              {d.status==='disputed' && (
                <div style={{ display:'flex', gap:8, marginTop:10 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => resolveDispute(d._id||d.id,'complete')}>✅ Продавцу</button>
                  <button className="btn btn-sm btn-danger" onClick={() => resolveDispute(d._id||d.id,'refund')}>↩ Покупателю</button>
                </div>
              )}
            </div>
          ))}
          {deals.length===0 && <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Сделок нет</div>}
        </div>
      )}

      {/* PRODUCTS */}
      {tab==='products' && !loading && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {products.map(p => (
            <div key={p._id||p.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{p.title}</div>
                <div style={{ fontSize:12, color:'var(--t3)' }}>@{p.seller?.username} · ${parseFloat(p.price).toFixed(2)} · {p.category}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color: p.status==='active' ? 'var(--green)' : 'var(--t3)' }}>{p.status}</span>
              <button className="btn btn-sm btn-danger" onClick={() => deleteProduct(p._id||p.id)}>🗑</button>
            </div>
          ))}
          {products.length===0 && <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Товаров нет</div>}
        </div>
      )}

      {/* TRANSACTIONS */}
      {tab==='transactions' && !loading && (
        <div>
          <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>{transactions.length} транзакций</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {transactions.map(tx => (
              <div key={tx._id||tx.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>@{tx.username} — {tx.description||tx.type}</div>
                  <div style={{ fontSize:11, color:'var(--t3)' }}>
                    {new Date(tx.created_at ? tx.created_at*1000 : tx.createdAt).toLocaleString('ru')} · {tx.status}
                  </div>
                </div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14,
                  color: ['deposit','sale','refund','adjustment'].includes(tx.type) ? 'var(--green)' : 'var(--red)' }}>
                  {['deposit','sale','refund','adjustment'].includes(tx.type)?'+':'-'}${Math.abs(parseFloat(tx.amount)).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MESSAGES */}
      {tab==='messages' && (
        <div style={{ maxWidth:500 }}>
          <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18, marginBottom:16 }}>Отправить TG сообщение</h2>
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:24 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--t3)', fontFamily:'var(--font-h)', letterSpacing:'0.1em', display:'block', marginBottom:6 }}>ID ПОЛЬЗОВАТЕЛЯ</label>
            <input className="inp" placeholder="UUID пользователя" value={msgUserId} onChange={e => setMsgUserId(e.target.value)} style={{ marginBottom:12 }}/>
            <label style={{ fontSize:11, fontWeight:700, color:'var(--t3)', fontFamily:'var(--font-h)', letterSpacing:'0.1em', display:'block', marginBottom:6 }}>ТЕКСТ</label>
            <textarea className="inp" rows={4} placeholder="Сообщение..." value={msgText} onChange={e => setMsgText(e.target.value)} style={{ resize:'vertical', marginBottom:16 }}/>
            <button className="btn btn-primary btn-full" onClick={async () => {
              if (!msgUserId || !msgText) return toast.error('Заполните поля')
              const res = await adminApi.post('/message', { userId: msgUserId, text: msgText })
              res.ok ? (toast.success('Отправлено!'), setMsgText(''), setMsgUserId('')) : toast.error(res.error)
            }}>📤 Отправить в Telegram</button>
          </div>
        </div>
      )}
    </div>
  )
    }
