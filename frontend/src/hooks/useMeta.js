// Хук для установки мета-тегов на каждой странице
import { useEffect } from 'react'

export default function useMeta({ title, description, keywords, ogTitle, ogDescription } = {}) {
  useEffect(() => {
    const site = 'Minions Market'

    if (title) {
      document.title = title.includes(site) ? title : `${title} — ${site}`
    }

    const setMeta = (name, content, prop = false) => {
      if (!content) return
      const attr = prop ? 'property' : 'name'
      let el = document.querySelector(`meta[${attr}="${name}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el) }
      el.setAttribute('content', content)
    }

    setMeta('description',    description)
    setMeta('keywords',       keywords)
    setMeta('og:title',       ogTitle || title, true)
    setMeta('og:description', ogDescription || description, true)

    return () => {
      document.title = 'Minions Market — Безопасный маркетплейс цифровых товаров'
    }
  }, [title, description, keywords])
}
