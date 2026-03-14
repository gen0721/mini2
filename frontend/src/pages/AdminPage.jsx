import React, { useState, useEffect, Component } from 'react'
import { Users, Package, Handshake, DollarSign, ShieldCheck, MessageCircle, CreditCard, Zap, Ban, CheckCircle, XCircle, UserCheck, Trash2, Send, BarChart2, AlertTriangle, RotateCcw, LogOut, Star, Clock, TrendingUp, Settings, Eye } from '../components/Icon'
import toast from 'react-hot-toast'

const adminFetch = async (path, opts = {}) => {
  try {
    const r = await fetch('/api/admin' + path, {
      ...opts,
      headers: { 'Content-Type':'application/json', 'x-admin-token': localStorage.getItem('mn_admin_token')||'', ...(opts.headers||{}) }
    })
    const data = await r.json()
    if (!r.ok) return { ok: false, error: data?.error || `Ошибка ${r.status}` }
    return data
  } catch(e) { return { ok: false, error: e.message } }
}

const adminApi = {
  get:  (path)       => adminFetch(path),
  post: (path, body) => adminFetch(path, { method:'POST', body: JSON.stringify(body) }),
  del:  (path)       => adminFetch(path, { method:'DELETE' }),
}

const STATUS_COLOR = { active:'var(--green)', pending:'var(--accent)', completed:'var(--t3)', disputed:'var(--red)', refunded:'#22d3ee', frozen:'var(--purple)', sold:'var(--t3)' }
const STATUS_LABEL = { active:'Активна', pending:'Ожидание', completed:'Завершена', disputed:'Спор', refunded:'Возврат', frozen:'Заморожена', sold:'Продан' }

const safe = (v, fallback = 0) => { try { return parseFloat(v) || fallback } catch { return fallback } }

class TabBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding:24, background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.3)', borderRadius:12 }}>
        <div style={{ color:'var(--red)', fontWeight:700, marginBottom:8 }}>Ошибка рендера</div>
        <div style={{ fontSize:12, color:'var(--t3)' }}>{this.state.error?.message}</div>
        <button className="btn btn-sm btn-secondary" style={{ marginTop:12 }} onClick={() => this.setState({ error: null })}>Попробовать снова</button>
      </div>
    )
    return this.props.children
  }
}

// Мини-бар-чарт
function BarChart({ data, valueKey = 'vol', labelKey = 'day', color = 'var(--accent)' }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => safe(d[valueKey])), 1)
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:64 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
          <div title={`${d[labelKey]}: $${safe(d[valueKey]).toFixed(0)}`} style={{
            width:'100%', borderRadius:'3px 3px 0 0',
            height:`${Math.max(4, (safe(d[valueKey])/max)*56)}px`,
            background:`linear-gradient(to top, ${color}, ${color}66)`,
            cursor:'pointer', transition:'opacity 0.15s',
          }}/>
        </div>
      ))}
    </div>
  )
}

// Карточка метрики
function MetricCard({ icon, label, value, sub, color = 'var(--accent)', trend }) {
  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'18px 20px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ color, opacity:0.8 }}>{icon}</div>
        {trend !== undefined && (
          <span style={{ fontSize:11, fontWeight:700, color: trend >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:22, color, marginBottom:2 }}>{value}</div>
      <div style={{ fontSize:12, color:'var(--t3)', fontWeight:600 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t4)', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', fontFamily:'var(--font-h)', letterSpacing:'0.1em', marginBottom:6 }}>{children}</div>
}

export default function AdminPage() {
  const [authed, setAuthed]     = useState(!!localStorage.getItem('mn_admin_token'))
  const [login, setLogin]       = useState('')
  const [pass, setPass]         = useState('')
  const [twoFaStep, setTwoFaStep] = useState(false)
  const [twoFaCode, setTwoFaCode] = useState('')
  const [tab, setTab]           = useState('stats')
  const [stats, setStats]       = useState(null)
  const [detailed, setDetailed] = useState(null)
  const [users, setUsers]       = useState([])
  const [deals, setDeals]       = useState([])
  const [products, setProducts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [secLogs, setSecLogs]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userFilter, setUserFilter] = useState('all')
  const [productFilter, setProductFilter] = useState('all')
  const [msgUserId, setMsgUserId] = useState('')
  const [msgText, setMsgText]   = useState('')
  const [secFilter, setSecFilter] = useState('')
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcastFilter, setBroadcastFilter] = useState('all')
  const [broadcasting, setBroadcasting] = useState(false)
  const [settings, setSettings] = useState(null)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [chats, setChats]           = useState([])
  const [partners, setPartners]     = useState([])
  const [chatSearch, setChatSearch] = useState('')
  const [openChat, setOpenChat]     = useState(null) // { user1, user2, messages }
  const [chatLoading, setChatLoading] = useState(false)

  const loadTab = async (t) => {
    setLoading(true)
    try {
      if (t === 'stats') {
        const [base, det] = await Promise.all([adminApi.get('/stats'), adminApi.get('/stats/detailed')])
        if (base && !base.error) setStats(base)
        if (det && !det.error) setDetailed(det)
      } else if (t === 'users') {
        const res = await adminApi.get(`/users?search=${encodeURIComponent(userSearch)}`)
        setUsers(Array.isArray(res) ? res : [])
      } else if (t === 'deals') {
        const res = await adminApi.get('/deals')
        setDeals(Array.isArray(res) ? res : [])
      } else if (t === 'products') {
        const res = await adminApi.get('/products')
        setProducts(Array.isArray(res) ? res : [])
      } else if (t === 'transactions') {
        const res = await adminApi.get('/transactions')
        setTransactions(Array.isArray(res) ? res : [])
      } else if (t === 'security') {
        const res = await adminApi.get(`/security-logs${secFilter ? `?ip=${encodeURIComponent(secFilter)}` : ''}`)
        setSecLogs(Array.isArray(res) ? res : [])
      } else if (t === 'settings') {
        const res = await adminApi.get('/settings')
        if (res && !res.error) setSettings(res)
      } else if (t === 'partners') {
        const res = await adminApi.get('/partners')
        setPartners(Array.isArray(res) ? res : [])
      } else if (t === 'chats') {
        const res = await adminApi.get('/chats')
        setChats(Array.isArray(res) ? res : [])
      }
    } catch(e) { toast.error('Ошибка: ' + e.message) }
    setLoading(false)
  }

  useEffect(() => { if (authed) loadTab(tab) }, [authed, tab])

  // 2FA
  const handleRequestCode = async () => {
    setLoading(true)
    try {
      const res = await adminApi.post('/request-2fa', { login, password: pass })
      if (res.ok) { setTwoFaStep(true); toast.success('Код отправлен в Telegram!') }
      else toast.error(res.error || 'Неверные данные')
    } catch { toast.error('Ошибка') }
    setLoading(false)
  }

  const handleLogin = async () => {
    setLoading(true)
    try {
      const res = await adminApi.post('/login', { login, password: pass, twoFaCode })
      if (res.token) { localStorage.setItem('mn_admin_token', res.token); setAuthed(true); toast.success('Добро пожаловать!') }
      else if (res.need2fa) { setTwoFaStep(false); toast.error('Сначала запросите код') }
      else toast.error(res.error || 'Неверный код')
    } catch { toast.error('Ошибка') }
    setLoading(false)
  }

  // Пользователи
  const banUser = async (id) => {
    const hours  = window.prompt('Часов блокировки (пусто = навсегда):')
    const reason = window.prompt('Причина:') || ''
    const res = await adminApi.post(`/users/${id}/ban`, { hours: hours ? parseInt(hours) : null, reason })
    res.ok ? (toast.success('Заблокирован'), loadTab('users')) : toast.error(res.error || 'Ошибка')
  }
  const unbanUser   = async (id) => { const r = await adminApi.post(`/users/${id}/unban`, {}); r.ok ? (toast.success('Разблокирован'), loadTab('users')) : toast.error(r.error) }
  const verifyUser  = async (id) => { const r = await adminApi.post(`/users/${id}/verify`, {}); r.ok ? (toast.success('Верифицирован'), loadTab('users')) : toast.error(r.error) }
  const makeSubAdmin = async (id, isSub) => {
    const r = await adminApi.post(`/users/${id}/${isSub ? 'remove-subadmin' : 'make-subadmin'}`, {})
    r.ok ? (toast.success(isSub ? 'Права сняты' : 'Назначен субадмином'), loadTab('users')) : toast.error(r.error)
  }
  const adjustBalance = async (id) => {
    const amount = window.prompt('Сумма (+/-):')
    if (!amount) return
    const parsed = parseFloat(amount)
    if (isNaN(parsed)) return toast.error('Введите число')
    const reason = window.prompt('Причина:') || 'Admin adjustment'
    const r = await adminApi.post(`/users/${id}/balance`, { amount: parsed, reason })
    r.ok ? (toast.success(`Новый баланс: $${safe(r.newBalance).toFixed(2)}`), loadTab('users')) : toast.error(r.error)
  }

  // Уровни продавца
  const LEVELS = {
    newcomer:    { label:'🌱 Новичок',  color:'#6b7280' },
    experienced: { label:'⭐ Опытный',  color:'#3b82f6' },
    pro:         { label:'💎 Про',       color:'#8b5cf6' },
    legend:      { label:'👑 Легенда',   color:'#f5c842' },
  }

  const setUserLevel = async (id, level) => {
    const r = await adminApi.post(`/users/${id}/set-level`, { level, override: true })
    r.ok ? (toast.success('Уровень: ' + LEVELS[level]?.label), loadTab('users')) : toast.error(r.error)
  }

  const recalcLevels = async () => {
    const r = await adminApi.post('/users/recalc-levels', {})
    r.ok ? toast.success('Пересчитано: ' + r.updated + ' юзеров') : toast.error(r.error)
  }

  // Товары
  const deleteProduct  = async (id) => { if (!window.confirm('Удалить?')) return; const r = await adminApi.del(`/products/${id}`); r.ok ? (toast.success('Удалён'), loadTab('products')) : toast.error(r.error) }
  const promoteProduct = async (id) => { const r = await adminApi.post(`/products/${id}/promote`, { hours: 24 }); r.ok ? (toast.success('Продвинут на 24ч!'), loadTab('products')) : toast.error(r.error) }

  // Споры
  const resolveDispute = async (dealId, decision) => {
    const note = window.prompt('Примечание:') || ''
    const r = await adminApi.post(`/deals/${dealId}/resolve`, { decision, note })
    r.ok ? (toast.success(decision === 'complete' ? '✓ Продавцу' : '↩ Покупателю'), loadTab('deals')) : toast.error(r.error)
  }

  // Сообщение юзеру
  const sendMessage = async () => {
    if (!msgText.trim() || !msgUserId.trim()) return toast.error('Заполните поля')
    const r = await adminApi.post('/message', { username: msgUserId.trim(), text: msgText.trim() })
    r.ok ? (toast.success('Отправлено!'), setMsgText('')) : toast.error(r.error)
  }

  // Рассылка
  const sendBroadcast = async () => {
    if (!broadcastText.trim()) return toast.error('Введите текст')
    if (!window.confirm(`Отправить всем (${broadcastFilter})?`)) return
    setBroadcasting(true)
    const r = await adminApi.post('/broadcast', { text: broadcastText, filter: broadcastFilter })
    r.ok ? toast.success(`Отправлено: ${r.sent} из ${r.total}`) : toast.error(r.error)
    setBroadcasting(false)
  }

  const openChatDialog = async (user1Id, user2Id) => {
    setChatLoading(true)
    try {
      const res = await adminApi.get(`/chats/${user1Id}/${user2Id}`)
      if (res && !res.error) setOpenChat(res)
    } catch(e) { toast.error('Ошибка загрузки') }
    setChatLoading(false)
  }

  // Фильтрация
  const filteredUsers = users.filter(u => {
    if (userFilter === 'banned')   return u.isBanned
    if (userFilter === 'verified') return u.isVerified
    if (userFilter === 'sellers')  return (u.totalSales||0) > 0
    if (userFilter === 'buyers')   return (u.totalPurchases||0) > 0
    return true
  })

  const filteredProducts = products.filter(p => {
    if (productFilter === 'active')  return p.status === 'active'
    if (productFilter === 'frozen')  return p.status === 'frozen'
    if (productFilter === 'promoted') return p.is_promoted
    return true
  })

  if (!authed) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20, background:'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(245,200,66,0.06), var(--bg))' }}>
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:24, padding:36, width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ marginBottom:8 }}><Zap size={36} strokeWidth={1.5}/></div>
          <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:22 }}>Панель администратора</div>
        </div>
        {!twoFaStep ? (
          <>
            <input className="inp" placeholder="Логин" value={login} onChange={e => setLogin(e.target.value)} style={{ marginBottom:10 }}/>
            <input className="inp" type="password" placeholder="Пароль" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key==='Enter' && handleRequestCode()} style={{ marginBottom:16 }}/>
            <button className="btn btn-primary btn-full" onClick={handleRequestCode} disabled={loading}>{loading ? '...' : 'Получить код →'}</button>
          </>
        ) : (
          <>
            <div style={{ textAlign:'center', marginBottom:16, fontSize:13, color:'var(--t3)', lineHeight:1.6 }}>📱 Код в <b style={{color:'var(--t2)'}}>Telegram</b> — введите 6 цифр</div>
            <input className="inp" placeholder="000000" value={twoFaCode} onChange={e => setTwoFaCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e => e.key==='Enter' && handleLogin()} style={{ marginBottom:12, textAlign:'center', fontSize:24, fontFamily:'var(--font-h)', fontWeight:800, letterSpacing:8 }}/>
            <button className="btn btn-primary btn-full" onClick={handleLogin} disabled={loading || twoFaCode.length < 6}>{loading ? '...' : 'Войти →'}</button>
            <button className="btn btn-ghost btn-full" onClick={() => { setTwoFaStep(false); setTwoFaCode('') }} style={{ marginTop:8, fontSize:12 }}>← Назад</button>
          </>
        )}
      </div>
    </div>
  )

  const TABS = [
    ['stats',        <BarChart2 size={14}/>,     'Статистика'],
    ['users',        <Users size={14}/>,         'Пользователи'],
    ['deals',        <Handshake size={14}/>,     'Сделки'],
    ['products',     <Package size={14}/>,       'Товары'],
    ['transactions', <CreditCard size={14}/>,    'Транзакции'],
    ['security',     <ShieldCheck size={14}/>,   'Безопасность'],
    ['broadcast',    <Send size={14}/>,           'Рассылка'],
    ['messages',     <MessageCircle size={14}/>, 'Сообщения'],
    ['chats',        <MessageCircle size={14}/>, 'Чаты юзеров'],
    ['partners',     <DollarSign size={14}/>,    'Партнёры'],
    ['settings',     <Settings size={14}/>,      'Настройки'],
  ]

  return (
    <div style={{ maxWidth:1280, margin:'0 auto', padding:'24px 20px', minHeight:'100vh' }}>

      {/* Шапка */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <h1 style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:22, display:'flex', alignItems:'center', gap:8 }}>
          <Zap size={20} strokeWidth={1.75}/> Панель администратора
        </h1>
        <button className="btn btn-danger btn-sm" onClick={() => { localStorage.removeItem('mn_admin_token'); setAuthed(false) }} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <LogOut size={14} strokeWidth={2}/> Выйти
        </button>
      </div>

      {/* Вкладки */}
      <div style={{ display:'flex', gap:6, marginBottom:24, flexWrap:'wrap' }}>
        {TABS.map(([v, icon, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'8px 14px', borderRadius:10, border:'1px solid', cursor:'pointer',
            fontSize:13, fontWeight:700, fontFamily:'var(--font-h)', transition:'all 0.15s',
            background: tab===v ? 'rgba(245,200,66,0.12)' : 'transparent',
            borderColor: tab===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
            color: tab===v ? 'var(--accent)' : 'var(--t2)',
          }}>{icon}{l}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Загрузка...</div>}

      <TabBoundary key={tab}>

        {/* ── СТАТИСТИКА ── */}
        {tab === 'stats' && !loading && (
          <div>
            {/* Алерты */}
            {detailed?.activeDisputes > 0 && (
              <div style={{ background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.3)', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10, color:'var(--red)', fontWeight:700, fontSize:13 }}>
                <AlertTriangle size={16}/> {detailed.activeDisputes} спора требуют рассмотрения!
              </div>
            )}
            {detailed?.pendingWithdrawals?.count > 0 && (
              <div style={{ background:'rgba(245,200,66,0.08)', border:'1px solid rgba(245,200,66,0.3)', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10, color:'var(--accent)', fontWeight:700, fontSize:13 }}>
                <Clock size={16}/> {detailed.pendingWithdrawals.count} заявок на вывод на ${safe(detailed.pendingWithdrawals.vol).toFixed(2)}
              </div>
            )}

            {/* Основные метрики */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
              <MetricCard icon={<Users size={22}/>} label="Всего юзеров" value={stats?.users ?? '—'} sub={`+${detailed?.users?.today||0} сегодня`}/>
              <MetricCard icon={<Package size={22}/>} label="Активных товаров" value={stats?.products ?? '—'}/>
              <MetricCard icon={<Handshake size={22}/>} label="Всего сделок" value={stats?.deals ?? '—'} sub={`${detailed?.deals?.today||0} сегодня`}/>
              <MetricCard icon={<DollarSign size={22}/>} label="Доход платформы" value={`$${safe(stats?.revenue).toFixed(2)}`} sub={`$${safe(detailed?.revenue?.today).toFixed(2)} сегодня`}/>
            </div>

            {/* Периоды */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
              {[
                ['За сегодня', detailed?.revenue?.today, detailed?.deals?.today, detailed?.users?.today],
                ['За неделю',  detailed?.revenue?.week,  detailed?.deals?.week,  detailed?.users?.week],
                ['За месяц',   detailed?.revenue?.month, detailed?.deals?.month, detailed?.users?.month],
              ].map(([label, rev, deals, users]) => (
                <div key={label} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px 18px' }}>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:12, color:'var(--t3)', letterSpacing:'0.1em', marginBottom:12 }}>{label.toUpperCase()}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:13, color:'var(--t3)' }}>Доход</span>
                      <span style={{ fontSize:13, fontWeight:700, color:'var(--green)' }}>${safe(rev).toFixed(2)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:13, color:'var(--t3)' }}>Сделок</span>
                      <span style={{ fontSize:13, fontWeight:700 }}>{deals||0}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:13, color:'var(--t3)' }}>Новых юзеров</span>
                      <span style={{ fontSize:13, fontWeight:700 }}>{users||0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* График по дням */}
            {detailed?.dailyStats?.length > 0 && (
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px', marginBottom:24 }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14, marginBottom:14 }}>📈 Сделки за 30 дней</div>
                <BarChart data={detailed.dailyStats} valueKey="deals" labelKey="day" color="var(--purple)"/>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
              {/* Топ продавцы */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14, marginBottom:14 }}>🏆 Топ продавцы (неделя)</div>
                {detailed?.topSellers?.length > 0 ? detailed.topSellers.map((s, i) => (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i < detailed.topSellers.length-1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize:16 }}>{['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>@{s.username}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>{s.sales} сделок</div>
                    </div>
                    <div style={{ fontFamily:'var(--font-h)', fontWeight:700, color:'var(--green)', fontSize:13 }}>${safe(s.earned).toFixed(0)}</div>
                  </div>
                )) : <div style={{ color:'var(--t3)', fontSize:13 }}>Нет данных</div>}
              </div>

              {/* Топ товары */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14, marginBottom:14 }}>🔥 Топ товары</div>
                {detailed?.topProducts?.length > 0 ? detailed.topProducts.map((p, i) => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i < detailed.topProducts.length-1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize:16 }}>{['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.title}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>{p.sales} продаж · {p.views} просмотров</div>
                    </div>
                    <div style={{ fontFamily:'var(--font-h)', fontWeight:700, color:'var(--accent)', fontSize:13 }}>${safe(p.price).toFixed(0)}</div>
                  </div>
                )) : <div style={{ color:'var(--t3)', fontSize:13 }}>Нет данных</div>}
              </div>
            </div>

            {/* Новые пользователи */}
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14, marginBottom:14 }}>👥 Последние регистрации</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {detailed?.newUsers?.map(u => (
                  <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, flexShrink:0 }}>
                      {(u.username||'?')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>@{u.username}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>{new Date((u.created_at||0)*1000).toLocaleDateString('ru')}</div>
                    </div>
                    <div style={{ fontSize:12, color:'var(--t3)' }}>↑{u.total_sales||0} ↓{u.total_purchases||0}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── ПОЛЬЗОВАТЕЛИ ── */}
        {tab === 'users' && !loading && (
          <div>
            <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
              <input className="inp" placeholder="Поиск по логину или TG ID..." value={userSearch}
                onChange={e => setUserSearch(e.target.value)} style={{ flex:1, minWidth:200 }}
                onKeyDown={e => e.key==='Enter' && loadTab('users')}/>
              <button className="btn btn-secondary" onClick={() => loadTab('users')}>Найти</button>
              <button className="btn btn-ghost" onClick={recalcLevels} title="Пересчитать уровни автоматически">🔄 Уровни</button>
            </div>
            {/* Фильтры */}
            <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
              {[['all','Все'],['banned','Забаненные'],['verified','Верифицированные'],['sellers','Продавцы'],['buyers','Покупатели']].map(([v,l]) => (
                <button key={v} onClick={() => setUserFilter(v)} style={{
                  padding:'6px 12px', borderRadius:8, border:'1px solid', cursor:'pointer', fontSize:12, fontWeight:700,
                  background: userFilter===v ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
                  borderColor: userFilter===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                  color: userFilter===v ? 'var(--accent)' : 'var(--t3)',
                }}>{l}</button>
              ))}
              <span style={{ fontSize:12, color:'var(--t3)', padding:'6px 0' }}>{filteredUsers.length} юзеров</span>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {filteredUsers.length === 0
                ? <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Нет пользователей</div>
                : filteredUsers.map(u => {
                    const uid = u.id || u._id
                    return (
                      <div key={uid} style={{ background:'var(--bg2)', border:`1px solid ${u.isBanned ? 'rgba(231,76,60,0.3)' : 'var(--border)'}`, borderRadius:14, padding:'14px 16px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                          <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>
                            {(u.username||'?')[0].toUpperCase()}
                          </div>
                          <div style={{ flex:1, minWidth:120 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                              <span style={{ fontWeight:700, fontSize:14 }}>@{u.username||'—'}</span>
                              {u.isVerified  && <span className="badge badge-green" style={{fontSize:10}}>✓ Верифицирован</span>}
                              {u.isBanned    && <span className="badge badge-red" style={{fontSize:10}}>🚫 Забанен</span>}
                              {u.isSubAdmin  && <span className="badge badge-purple" style={{fontSize:10}}>⚡ Субадмин</span>}
                            </div>
                            <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                              Баланс: <b style={{color:'var(--accent)'}}>${safe(u.balance).toFixed(2)}</b>
                              {' · '}↑{u.totalSales||0} ↓{u.totalPurchases||0}
                              {' · '}★{safe(u.rating||5).toFixed(1)}
                              {u.telegram_id ? ' · TG ✓' : ' · TG ✗'}
                            </div>
                          </div>
                          {/* Кнопки действий */}
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => adjustBalance(uid)} title="Изменить баланс">💰</button>
                            {!u.isVerified && <button className="btn btn-sm btn-secondary" onClick={() => verifyUser(uid)} title="Верифицировать"><UserCheck size={13}/></button>}
                            <button className="btn btn-sm btn-secondary" onClick={() => makeSubAdmin(uid, u.isSubAdmin)} title={u.isSubAdmin ? 'Снять субадмина' : 'Сделать субадмином'}><Zap size={13}/></button>
                            {u.isBanned
                              ? <button className="btn btn-sm btn-secondary" onClick={() => unbanUser(uid)} style={{color:'var(--green)'}}><CheckCircle size={13}/></button>
                              : <button className="btn btn-sm btn-danger" onClick={() => banUser(uid)}><Ban size={13}/></button>
                            }
                          </div>
                          {/* Уровни продавца */}
                          <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
                            {Object.entries(LEVELS).map(([key, lvl]) => (
                              <button key={key} onClick={() => setUserLevel(uid, key)} style={{
                                padding:'3px 8px', borderRadius:6, border:'1px solid', cursor:'pointer',
                                fontSize:10, fontWeight:700,
                                background: (u.seller_level||'newcomer')===key ? lvl.color+'22' : 'var(--bg3)',
                                borderColor: (u.seller_level||'newcomer')===key ? lvl.color : 'var(--border)',
                                color: (u.seller_level||'newcomer')===key ? lvl.color : 'var(--t3)',
                              }}>{lvl.label}</button>
                            ))}
                          </div>
                        </div>
                        {u.isBanned && u.banReason && (
                          <div style={{ fontSize:12, color:'var(--red)', marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
                            Причина: {u.banReason}
                          </div>
                        )}
                      </div>
                    )
                  })
              }
            </div>
          </div>
        )}

        {/* ── СДЕЛКИ ── */}
        {tab === 'deals' && !loading && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {deals.filter(d => d.status==='disputed').length > 0 && (
              <div style={{ background:'rgba(231,76,60,0.06)', border:'1px solid rgba(231,76,60,0.3)', borderRadius:12, padding:'12px 16px', marginBottom:8, fontSize:13, color:'var(--red)', fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                <AlertTriangle size={16}/> {deals.filter(d=>d.status==='disputed').length} спора требуют рассмотрения!
              </div>
            )}
            {deals.length === 0
              ? <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Сделок нет</div>
              : deals.map(d => {
                  const did = d._id || d.id
                  return (
                    <div key={did} style={{ background:'var(--bg2)', border:`1px solid ${d.status==='disputed' ? 'rgba(231,76,60,0.3)' : 'var(--border)'}`, borderRadius:14, padding:'14px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                        <div style={{ flex:1, minWidth:150 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>{d.product?.title||'—'}</div>
                          <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                            @{d.buyer?.username||'?'} → @{d.seller?.username||'?'}
                          </div>
                          {d.disputeReason && <div style={{ fontSize:12, color:'var(--red)', marginTop:4 }}>💬 {d.disputeReason}</div>}
                        </div>
                        <div style={{ fontFamily:'var(--font-h)', fontWeight:700, color:'var(--accent)', fontSize:15 }}>${safe(d.amount).toFixed(2)}</div>
                        <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:6, background:`${STATUS_COLOR[d.status]||'var(--t3)'}22`, color: STATUS_COLOR[d.status]||'var(--t3)' }}>
                          {STATUS_LABEL[d.status]||d.status}
                        </span>
                      </div>
                      {d.status==='disputed' && (
                        <div style={{ display:'flex', gap:8, marginTop:12 }}>
                          <button className="btn btn-sm btn-primary" onClick={() => resolveDispute(did,'complete')} style={{display:'flex',alignItems:'center',gap:4}}>
                            <CheckCircle size={13}/> Продавцу
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => resolveDispute(did,'refund')} style={{display:'flex',alignItems:'center',gap:4}}>
                            <RotateCcw size={13}/> Покупателю
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
            }
          </div>
        )}

        {/* ── ТОВАРЫ ── */}
        {tab === 'products' && !loading && (
          <div>
            <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
              {[['all','Все'],['active','Активные'],['frozen','Замороженные'],['promoted','На продвижении']].map(([v,l]) => (
                <button key={v} onClick={() => setProductFilter(v)} style={{
                  padding:'6px 12px', borderRadius:8, border:'1px solid', cursor:'pointer', fontSize:12, fontWeight:700,
                  background: productFilter===v ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
                  borderColor: productFilter===v ? 'rgba(245,200,66,0.4)' : 'var(--border)',
                  color: productFilter===v ? 'var(--accent)' : 'var(--t3)',
                }}>{l}</button>
              ))}
              <span style={{ fontSize:12, color:'var(--t3)', padding:'6px 0' }}>{filteredProducts.length} товаров</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {filteredProducts.length === 0
                ? <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Товаров нет</div>
                : filteredProducts.map(p => {
                    const pid = p._id || p.id
                    return (
                      <div key={pid} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                        <div style={{ flex:1, minWidth:150 }}>
                          <div style={{ fontWeight:600, fontSize:14 }}>{p.title||'—'}</div>
                          <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                            @{p.seller?.username||'?'} · <b style={{color:'var(--accent)'}}>${safe(p.price).toFixed(2)}</b> · {p.category||'—'}
                            {p.views > 0 && <> · <Eye size={11} style={{display:'inline'}}/> {p.views}</>}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          {p.is_promoted && <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)', background:'rgba(245,200,66,0.12)', padding:'3px 8px', borderRadius:6 }}>🚀 Топ</span>}
                          <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[p.status]||'var(--t3)' }}>{p.status}</span>
                          <button className="btn btn-sm btn-secondary" onClick={() => promoteProduct(pid)} title="Продвинуть">🚀</button>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteProduct(pid)}><Trash2 size={13}/></button>
                        </div>
                      </div>
                    )
                  })
              }
            </div>
          </div>
        )}

        {/* ── ТРАНЗАКЦИИ ── */}
        {tab === 'transactions' && !loading && (
          <div>
            <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>{transactions.length} транзакций</div>
            {transactions.length === 0
              ? <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Нет</div>
              : <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {transactions.map(tx => {
                    const plus = ['deposit','sale','refund','adjustment'].includes(tx.type)
                    return (
                      <div key={tx._id||tx.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600 }}>@{tx.username||'—'} — {tx.description||tx.type}</div>
                          <div style={{ fontSize:11, color:'var(--t3)' }}>
                            {tx.created_at ? new Date(tx.created_at*1000).toLocaleString('ru') : '—'} · {tx.status}
                          </div>
                        </div>
                        <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:14, color: plus ? 'var(--green)' : 'var(--red)' }}>
                          {plus?'+':'-'}${Math.abs(safe(tx.amount)).toFixed(2)}
                        </div>
                      </div>
                    )
                  })}
                </div>
            }
          </div>
        )}

        {/* ── БЕЗОПАСНОСТЬ ── */}
        {tab === 'security' && !loading && (
          <div>
            <div style={{ display:'flex', gap:10, marginBottom:16 }}>
              <input className="inp" placeholder="Фильтр по IP..." value={secFilter} onChange={e => setSecFilter(e.target.value)} style={{ flex:1 }} onKeyDown={e => e.key==='Enter' && loadTab('security')}/>
              <button className="btn btn-secondary" onClick={() => loadTab('security')}>Поиск</button>
              <button className="btn btn-ghost" onClick={() => { setSecFilter(''); loadTab('security') }}>Сброс</button>
            </div>
            <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>{secLogs.length} событий</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {secLogs.length === 0
                ? <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Логов нет</div>
                : secLogs.map(l => {
                    const isAlert = ['login_fail','admin_login_fail','banned_access','token_invalid'].includes(l.event)
                    return (
                      <div key={l.id} style={{ background: isAlert ? 'rgba(231,76,60,0.06)' : 'var(--bg2)', border:`1px solid ${isAlert ? 'rgba(231,76,60,0.25)' : 'var(--border)'}`, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ fontSize:16 }}>{l.event==='login_ok'?'✓':l.event==='login_fail'?'✗':l.event==='admin_login_ok'?'⚡':l.event==='admin_login_fail'?'🚨':l.event==='register'?'👤':l.event==='banned_access'?'🚫':'📋'}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color: isAlert ? 'var(--red)' : 'var(--t1)' }}>{l.event}{l.username ? ` · @${l.username}` : ''}</div>
                          <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{new Date(l.created_at*1000).toLocaleString('ru')}</div>
                        </div>
                        <div style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color: isAlert ? 'var(--red)' : 'var(--accent)', background: isAlert ? 'rgba(231,76,60,0.1)' : 'rgba(245,200,66,0.1)', padding:'4px 10px', borderRadius:6 }}>{l.ip||'—'}</div>
                      </div>
                    )
                  })
              }
            </div>
          </div>
        )}

        {/* ── РАССЫЛКА ── */}
        {tab === 'broadcast' && !loading && (
          <div style={{ maxWidth:600 }}>
            <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18, marginBottom:20 }}>📢 Массовая рассылка</h2>

            {/* Кому */}
            <div style={{ marginBottom:16 }}>
              <Label>КОМУ ОТПРАВИТЬ</Label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                {[['all','Всем пользователям'],['buyers','Только покупателям'],['sellers','Только продавцам'],['verified','Верифицированным']].map(([v,l]) => (
                  <button key={v} onClick={() => setBroadcastFilter(v)} style={{
                    padding:'12px 16px', borderRadius:12, border:'1.5px solid', cursor:'pointer', fontSize:13, fontWeight:600, textAlign:'left',
                    background: broadcastFilter===v ? 'rgba(245,200,66,0.1)' : 'var(--bg3)',
                    borderColor: broadcastFilter===v ? 'rgba(245,200,66,0.5)' : 'var(--border)',
                    color: broadcastFilter===v ? 'var(--accent)' : 'var(--t2)',
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Текст */}
            <div style={{ marginBottom:16 }}>
              <Label>ТЕКСТ СООБЩЕНИЯ (поддерживается HTML)</Label>
              <textarea className="inp" rows={6} placeholder="Текст рассылки..." value={broadcastText} onChange={e => setBroadcastText(e.target.value)} style={{ resize:'vertical' }}/>
            </div>

            <div style={{ background:'rgba(245,200,66,0.06)', border:'1px solid rgba(245,200,66,0.2)', borderRadius:12, padding:'12px 16px', marginBottom:16, fontSize:13, color:'var(--t3)' }}>
              ⚠️ Сообщение будет отправлено только пользователям с привязанным Telegram.
            </div>

            <button className="btn btn-primary btn-full" onClick={sendBroadcast} disabled={broadcasting || !broadcastText.trim()} style={{ height:48 }}>
              {broadcasting ? '📤 Отправляем...' : '📢 Отправить рассылку'}
            </button>
          </div>
        )}

        {/* ── СООБЩЕНИЯ ЮЗЕРУ ── */}
        {tab === 'messages' && !loading && (
          <div style={{ maxWidth:520 }}>
            <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18, marginBottom:20 }}>💬 Написать пользователю</h2>
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:24 }}>
              <Label>ПОЛЬЗОВАТЕЛЬ</Label>
              <div style={{ position:'relative', marginBottom:12 }}>
                <input className="inp" placeholder="@логин или Telegram ID" value={msgUserId} onChange={e => setMsgUserId(e.target.value)} style={{ paddingRight: msgUserId ? 36 : 12 }}/>
                {msgUserId && <button onClick={() => setMsgUserId('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--t4)', cursor:'pointer', fontSize:16 }}>×</button>}
              </div>
              {users.length > 0 && msgUserId.length >= 1 && (
                <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, marginBottom:12, maxHeight:160, overflowY:'auto' }}>
                  {users.filter(u => { const q = msgUserId.replace(/^@/,'').toLowerCase(); return (u.username||'').toLowerCase().includes(q) || (u.telegram_id||'').includes(q) }).slice(0,6).map(u => (
                    <div key={u.id||u._id} onClick={() => setMsgUserId(u.username||u.telegram_id)} style={{ padding:'10px 14px', cursor:'pointer', fontSize:13, borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }} onMouseEnter={e => e.currentTarget.style.background='var(--bg4)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <span style={{ fontWeight:600 }}>@{u.username||'—'}</span>
                      <span style={{ fontSize:11, color:'var(--t3)' }}>{u.telegram_id ? `TG: ${u.telegram_id}` : 'TG не привязан'}</span>
                    </div>
                  ))}
                </div>
              )}
              <Label>СООБЩЕНИЕ</Label>
              <textarea className="inp" rows={4} placeholder="Текст сообщения..." value={msgText} onChange={e => setMsgText(e.target.value)} style={{ marginBottom:16, resize:'none' }}/>
              <button className="btn btn-primary btn-full" onClick={sendMessage} disabled={!msgText.trim() || !msgUserId.trim()} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                <Send size={14}/> Отправить
              </button>
            </div>
          </div>
        )}

        {/* ── ПАРТНЁРЫ ── */}
        {tab === 'partners' && !loading && (
          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
              <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18 }}>🤝 Партнёрская программа</h2>
              <div style={{ fontSize:13, color:'var(--t3)' }}>
                Дефолтный процент: <b style={{color:'var(--accent)'}}>{process.env.PARTNER_PERCENT || 10}%</b>
              </div>
            </div>

            {partners.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🤝</div>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700 }}>Партнёров пока нет</div>
                <div style={{ fontSize:13, marginTop:8 }}>Блогеры могут стать партнёрами через /partner в боте</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {partners.map(p => (
                  <div key={p.id} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'16px 18px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>
                        {(p.username||'?')[0].toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:100 }}>
                        <div style={{ fontWeight:700, fontSize:14 }}>@{p.username}</div>
                        <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                          👥 {p.referred_count} рефералов · 💰 ${parseFloat(p.total_rewards||0).toFixed(2)} заработано · Баланс: ${parseFloat(p.balance||0).toFixed(2)}
                        </div>
                        <div style={{ fontSize:11, color:'var(--t4)', marginTop:2 }}>
                          Код: <code style={{color:'var(--accent)'}}>{p.ref_code}</code>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:18, color:'var(--green)' }}>{p.partner_percent}%</span>
                        <button className="btn btn-sm btn-secondary" onClick={async () => {
                          const pct = window.prompt('Новый процент (1-50):', p.partner_percent)
                          if (!pct) return
                          const r = await adminApi.post(`/partners/${p.id}/set-percent`, { percent: parseInt(pct) })
                          r.ok ? (toast.success('Процент обновлён'), loadTab('partners')) : toast.error(r.error)
                        }}>✏️</button>
                        <button className="btn btn-sm btn-danger" onClick={async () => {
                          if (!window.confirm('Убрать партнёра?')) return
                          const r = await adminApi.post(`/partners/${p.id}/remove`, {})
                          r.ok ? (toast.success('Убран'), loadTab('partners')) : toast.error(r.error)
                        }}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ЧАТЫ ЮЗЕРОВ ── */}
        {tab === 'chats' && !loading && (
          <div>
            {openChat ? (
              // Просмотр переписки
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => setOpenChat(null)}>← Назад</button>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:16 }}>
                    @{openChat.user1?.username} ↔ @{openChat.user2?.username}
                  </div>
                  <span style={{ fontSize:12, color:'var(--t3)' }}>{openChat.messages?.length} сообщений</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'60vh', overflowY:'auto', padding:'4px 0' }}>
                  {openChat.messages?.length === 0
                    ? <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Сообщений нет</div>
                    : openChat.messages.map(m => {
                        const isFirst = m.sender_id === openChat.user1?.id
                        return (
                          <div key={m.id} style={{ display:'flex', justifyContent: isFirst ? 'flex-start' : 'flex-end' }}>
                            <div style={{
                              maxWidth:'70%', padding:'10px 14px',
                              borderRadius: isFirst ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
                              background: isFirst ? 'var(--bg3)' : 'rgba(124,106,255,0.2)',
                              border: `1px solid ${isFirst ? 'var(--border)' : 'rgba(124,106,255,0.3)'}`,
                            }}>
                              <div style={{ fontSize:11, fontWeight:700, color: isFirst ? 'var(--accent)' : 'var(--purple)', marginBottom:4 }}>
                                @{m.sender_username}
                              </div>
                              <div style={{ fontSize:14, lineHeight:1.5, color:'var(--t1)' }}>{m.text}</div>
                              <div style={{ fontSize:10, color:'var(--t4)', marginTop:4, textAlign:'right' }}>
                                {new Date((m.created_at||0)*1000).toLocaleString('ru')}
                              </div>
                            </div>
                          </div>
                        )
                      })
                  }
                </div>
              </div>
            ) : (
              // Список диалогов
              <div>
                <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                  <input className="inp" placeholder="Поиск по логину..." value={chatSearch}
                    onChange={e => setChatSearch(e.target.value)} style={{ flex:1 }}/>
                  <button className="btn btn-secondary" onClick={() => loadTab('chats')}>Обновить</button>
                </div>
                <div style={{ fontSize:12, color:'var(--t3)', marginBottom:12 }}>{chats.length} диалогов</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {chats
                    .filter(c => !chatSearch || (c.user1_username||'').includes(chatSearch) || (c.user2_username||'').includes(chatSearch))
                    .map((c, i) => (
                      <div key={i} style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                        onClick={() => openChatDialog(c.user1_id, c.user2_id)}
                        onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,var(--purple),var(--accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}>
                            {(c.user1_username||'?')[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize:13, color:'var(--t3)' }}>↔</span>
                          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,var(--accent),var(--green))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}>
                            {(c.user2_username||'?')[0].toUpperCase()}
                          </div>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700 }}>@{c.user1_username} ↔ @{c.user2_username}</div>
                          <div style={{ fontSize:12, color:'var(--t3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.last_text}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                          <span style={{ fontSize:11, color:'var(--t4)' }}>{new Date((c.last_time||0)*1000).toLocaleDateString('ru')}</span>
                          <span style={{ fontSize:11, color:'var(--purple)', fontWeight:700 }}>{c.msg_count} сообщ.</span>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── НАСТРОЙКИ ── */}
        {tab === 'settings' && !loading && (
          <div style={{ maxWidth:560 }}>
            <h2 style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:18, marginBottom:20 }}>⚙️ Настройки сайта</h2>

            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* AI Admin */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15, marginBottom:4 }}>🤖 AI Admin</div>
                    <div style={{ fontSize:13, color:'var(--t3)' }}>Автоматическое управление сайтом</div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-sm btn-primary" onClick={async () => {
                      const r = await fetch('/api/tg-webhook/' + localStorage.getItem('mn_admin_token'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message:{ chat:{id: prompt('Ваш chat_id:')}, text:'/ai_on' }}) })
                      toast.success('Команда отправлена')
                    }}>Вкл</button>
                    <button className="btn btn-sm btn-danger" onClick={() => toast.info('Напишите /ai_off в Telegram боте')}>Выкл</button>
                  </div>
                </div>
              </div>

              {/* Текущие настройки из env */}
              {settings && (
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
                  <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15, marginBottom:16 }}>📋 Текущие параметры</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {[
                      ['Комиссия платформы', settings.commission + '%'],
                      ['Минимальный депозит', '$' + settings.minDeposit],
                      ['Лимит вывода в день', '$' + settings.dailyWithdrawLimit],
                      ['Регистрация', settings.registrationOpen === 'true' ? '✅ Открыта' : '🔒 Закрыта'],
                      ['AI Admin', settings.aiEnabled === 'true' ? '✅ Активен' : '❌ Отключён'],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:13, color:'var(--t3)' }}>{label}</span>
                        <span style={{ fontSize:13, fontWeight:700 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:14, fontSize:12, color:'var(--t3)', lineHeight:1.6 }}>
                    💡 Для изменения параметров — обновите переменные окружения на Railway:<br/>
                    <code style={{ color:'var(--accent)' }}>COMMISSION_RATE, MIN_DEPOSIT, DAILY_WITHDRAW_LIMIT</code>
                  </div>
                </div>
              )}

              {/* Информация об AI командах */}
              <div style={{ background:'rgba(124,106,255,0.06)', border:'1px solid rgba(124,106,255,0.2)', borderRadius:14, padding:'18px 20px' }}>
                <div style={{ fontFamily:'var(--font-h)', fontWeight:700, fontSize:15, marginBottom:12 }}>🤖 Управление AI через Telegram</div>
                {[
                  ['/ai_on',     'Включить AI Admin'],
                  ['/ai_off',    'Выключить AI Admin'],
                  ['/ai_status', 'Статус и очередь задач'],
                  ['/report',    'Получить отчёт прямо сейчас'],
                ].map(([cmd, desc]) => (
                  <div key={cmd} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                    <code style={{ background:'var(--bg3)', padding:'3px 8px', borderRadius:6, fontSize:12, color:'var(--accent)', flexShrink:0 }}>{cmd}</code>
                    <span style={{ fontSize:13, color:'var(--t3)' }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </TabBoundary>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="grid-template-columns: repeat(3"] { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 480px) {
          div[style*="grid-template-columns: repeat(2"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
