import React, { Suspense, lazy, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'

const Home    = lazy(() => import('./pages/HomePage'))
const Auth    = lazy(() => import('./pages/AuthPage'))
const Catalog = lazy(() => import('./pages/CatalogPage'))
const Product = lazy(() => import('./pages/ProductPage'))
const Wallet  = lazy(() => import('./pages/WalletPage'))
const Deals   = lazy(() => import('./pages/DealsPage'))
const Sell    = lazy(() => import('./pages/SellPage'))
const Legal   = lazy(() => import('./pages/LegalPage'))
const Admin   = lazy(() => import('./pages/AdminPage'))
const Profile = lazy(() => import('./pages/ProfilePage'))
const NotFound = lazy(() => import('./pages/NotFoundPage'))
import OfflineBanner from './components/OfflineBanner'

// Глобальный ErrorBoundary — показывает ошибку вместо чёрного экрана
class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e, info) { console.error('[ErrorBoundary]', e, info) }
  render() {
    if (this.state.error) return (
      <div style={{ maxWidth:600, margin:'80px auto', padding:'0 20px', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>💥</div>
        <div style={{ fontFamily:'var(--font-h)', fontWeight:800, fontSize:22, marginBottom:12 }}>
          Что-то пошло не так
        </div>
        <div style={{
          background:'rgba(231,76,60,0.1)', border:'1px solid rgba(231,76,60,0.3)',
          borderRadius:12, padding:16, marginBottom:24,
          fontSize:13, color:'var(--red)', textAlign:'left', wordBreak:'break-all'
        }}>
          {this.state.error?.message || String(this.state.error)}
        </div>
        <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); window.location.href = '/' }}>
          На главную
        </button>
      </div>
    )
    return this.props.children
  }
}

function Loader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'40vh' }}>
      <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
    </div>
  )
}

const InnerRoutes = () => (
  <Suspense fallback={<Loader/>}>
    <Routes>
      <Route path="/"            element={<Home/>}/>
      <Route path="/catalog"     element={<Catalog/>}/>
      <Route path="/product/:id" element={<Product/>}/>
      <Route path="/wallet"      element={<Wallet/>}/>
      <Route path="/deals"       element={<Deals/>}/>
      <Route path="/sell"        element={<Sell/>}/>
      <Route path="/profile"     element={<Profile/>}/>
      <Route path="/user/:id"    element={<Profile/>}/>
      <Route path="/legal/:page" element={<Legal/>}/>
      <Route path="/contacts"    element={<Navigate to="/legal/contacts"/>}/>
      <Route path="*" element={<NotFound/>}/>
    </Routes>
  </Suspense>
)

export default function App() {
  return (
    <BrowserRouter>
      <OfflineBanner/>
      <Toaster position="top-right" toastOptions={{
        style: { background:'var(--bg2)', color:'var(--t1)', border:'1px solid var(--border)' },
        success: { iconTheme:{ primary:'var(--accent)', secondary:'var(--bg)' } },
        duration: 4000,
      }}/>
      <ErrorBoundary>
        <Suspense fallback={<Loader/>}>
          <Routes>
            <Route path="/admin" element={<Admin/>}/>
            <Route path="/auth"  element={<Auth/>}/>
            <Route path="/*"     element={<Layout><InnerRoutes/></Layout>}/>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
