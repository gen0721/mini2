import React from 'react'
import { FileText, Lock, RotateCcw, Mail } from '../components/Icon'
import { useParams, Link, Navigate } from 'react-router-dom'

const PAGES = {
  rules: {
    title: 'Правила платформы',
    icon: <FileText size={26} strokeWidth={1.5}/>,
    lastUpdated: '01.01.2025',
    sections: [
      {
        heading: '1. Общие положения',
        content: `Minions.Market — маркетплейс цифровых товаров, предоставляющий безопасную среду для купли-продажи между пользователями. Используя платформу, вы соглашаетесь с настоящими Правилами в полном объёме. Если вы не согласны с каким-либо пунктом — немедленно прекратите использование сервиса.`,
      },
      {
        heading: '2. Регистрация и аккаунт',
        content: `Для использования большинства функций платформы необходима регистрация. Вы обязаны предоставить достоверные данные и хранить учётные данные в тайне. Один пользователь вправе иметь только один аккаунт. Создание дублирующих аккаунтов, а также аккаунтов с целью обхода блокировки запрещено и ведёт к бессрочному бану.`,
      },
      {
        heading: '3. Правила для продавцов',
        items: [
          'Запрещено размещать товары, нарушающие законодательство РФ и международное право.',
          'Описание товара должно соответствовать действительности. Вводящие в заблуждение объявления удаляются.',
          'Продавец обязан передать товар покупателю в течение 24 часов после подтверждения оплаты.',
          'Комиссия платформы составляет 5% от суммы каждой успешной сделки.',
          'Запрещено проводить сделки в обход платформы (off-trade). За это — перманентный бан.',
        ],
      },
      {
        heading: '4. Правила для покупателей',
        items: [
          'Оплата производится исключительно через систему гаранта на платформе.',
          'После получения товара покупатель обязан подтвердить сделку в течение 72 часов.',
          'При положительном одобрении заявки на возврат деньги возвращаются на ту же карту, с которой была проведена изначальная оплата, в течение 5 календарных дней.',
          'Необоснованные споры или злоупотребление системой спорного разрешения запрещены.',
          'Чарджбэк без обращения в службу поддержки ведёт к блокировке аккаунта.',
        ],
      },
      {
        heading: '5. Запрещённые товары',
        content: `На платформе запрещено размещать: краденые аккаунты или товары, полученные мошенническим путём; читы, боты и программы для взлома игр; любой контент для взрослых, нарушающий законодательство; персональные данные третьих лиц; товары, связанные с реальными деньгами в обход лицензированных сервисов.`,
      },
      {
        heading: '6. Ответственность',
        content: `Платформа выступает посредником и не несёт ответственности за действия пользователей, качество цифровых товаров за пределами гарантийного периода, а также за убытки, возникшие вследствие нарушения настоящих Правил самим пользователем.`,
      },
      {
        heading: '7. Изменение правил',
        content: `Администрация оставляет за собой право изменять настоящие Правила без предварительного уведомления. Продолжение использования платформы после публикации изменений означает ваше согласие с новой редакцией.`,
      },
    ],
  },

  privacy: {
    title: 'Политика конфиденциальности',
    icon: <Lock size={26} strokeWidth={1.5}/>,
    lastUpdated: '01.01.2025',
    sections: [
      {
        heading: '1. Собираемые данные',
        items: [
          'Имя пользователя и адрес электронной почты при регистрации.',
          'Telegram ID при входе через Telegram.',
          'История транзакций и сделок на платформе.',
          'IP-адрес и данные браузера в целях безопасности.',
          'Переписка со службой поддержки.',
        ],
      },
      {
        heading: '2. Использование данных',
        content: `Собранные данные используются исключительно для: обеспечения работы платформы и персонализации интерфейса; предотвращения мошенничества и обеспечения безопасности; отправки уведомлений о сделках и обновлениях сервиса (с возможностью отписки); соблюдения требований применимого законодательства.`,
      },
      {
        heading: '3. Хранение данных',
        content: `Данные хранятся на защищённых серверах с применением шифрования. Срок хранения — не более 3 лет с момента последней активности аккаунта или до момента удаления аккаунта по вашему запросу. Резервные копии уничтожаются в течение 30 дней после удаления основных данных.`,
      },
      {
        heading: '4. Передача данных третьим лицам',
        content: `Мы не продаём и не передаём ваши персональные данные третьим лицам, за исключением: платёжных провайдеров (CryptoCloud, RuKassa, CryptoBot) в объёме, необходимом для проведения транзакций; государственных органов по законному запросу; партнёров по хостингу и безопасности, связанных с нами соглашениями о конфиденциальности.`,
      },
      {
        heading: '5. Ваши права',
        items: [
          'Запросить копию своих данных — обратитесь в поддержку.',
          'Потребовать исправления недостоверных данных.',
          'Удалить аккаунт и связанные данные через настройки профиля.',
          'Отозвать согласие на маркетинговые рассылки в любой момент.',
        ],
      },
      {
        heading: '6. Cookie',
        content: `Платформа использует технические cookie, необходимые для работы сессии и безопасности. Аналитические cookie применяются только при вашем явном согласии. Вы вправе отключить cookie в настройках браузера, однако это может повлиять на функциональность сайта.`,
      },
    ],
  },


  refund: {
    title: 'Условия возврата',
    icon: <RotateCcw size={26} strokeWidth={1.5}/>,
    lastUpdated: '12.03.2026',
    sections: [
      {
        heading: '1. Общие положения',
        content: `Настоящие Условия возврата регулируют порядок и основания для возврата денежных средств покупателям на платформе Minions.Market. Возврат возможен только для покупателей — инициировать его может исключительно сторона, совершившая оплату. Все заявки рассматриваются администрацией платформы индивидуально.`,
      },
      {
        heading: '2. Основания для возврата',
        items: [
          'Продавец не передал товар в течение 24 часов после подтверждения оплаты.',
          'Переданный товар не соответствует описанию в объявлении (другие характеристики, иная игра, иной регион).',
          'Товар оказался нерабочим или недействительным на момент передачи.',
          'Продавец передал неполный комплект (например, только часть аккаунта без заявленных бонусов).',
          'Дублирующая оплата — покупатель был списан дважды за одну сделку по технической ошибке.',
          'Сделка была открыта по ошибке до того, как продавец передал товар.',
        ],
      },
      {
        heading: '3. Когда возврат невозможен',
        items: [
          'Покупатель уже нажал кнопку «Подтвердить получение» — сделка считается завершённой.',
          'Прошло более 72 часов с момента передачи товара продавцом без открытия спора.',
          'Товар был использован, активирован или изменён покупателем.',
          'Покупатель изменил пароль или данные аккаунта после получения.',
          'Претензия основана на субъективной оценке (не понравился аккаунт, передумал покупать).',
          'Нарушение покупателем правил платформы, повлёкшее утрату товара.',
        ],
      },
      {
        heading: '4. Порядок подачи заявки на возврат',
        items: [
          'Шаг 1. Перейдите в раздел «Сделки» и откройте нужную сделку.',
          'Шаг 2. Если товар ещё не передан — нажмите «Отменить и вернуть деньги».',
          'Шаг 3. Если товар передан, но не соответствует описанию — нажмите «Спор» и укажите причину.',
          'Шаг 4. Приложите доказательства: скриншоты, описание проблемы.',
          'Шаг 5. Администратор рассмотрит заявку в течение 24 часов и вынесет решение.',
        ],
      },
      {
        heading: '5. Сроки и способы возврата',
        items: [
          'RuKassa (карта РФ, СБП): при положительном одобрении заявки деньги возвращаются на ту же карту, с которой была проведена изначальная оплата, в течение 5 календарных дней.',
          'CryptoCloud / CryptoBot (криптовалюта): возврат осуществляется на внутренний баланс платформы в течение 24 часов после одобрения. Вывод на внешний кошелёк возможен стандартным способом.',
          'Внутренний баланс платформы: зачисляется мгновенно после одобрения заявки.',
          'Комиссия платёжной системы при возврате не компенсируется — возвращается сумма за вычетом комиссии провайдера.',
        ],
      },
      {
        heading: '6. Роль администрации в спорах',
        content: `При открытии спора администрация платформы выступает независимым арбитром. Мы изучаем переписку в чате сделки, историю передачи товара, скриншоты и иные доказательства обеих сторон. Решение администрации является окончательным. По итогам рассмотрения средства переводятся либо продавцу (если претензия необоснована), либо покупателю (возврат).`,
      },
      {
        heading: '7. Защита от злоупотреблений',
        items: [
          'Систематические необоснованные заявки на возврат ведут к временной блокировке аккаунта.',
          'Попытка инициировать чарджбэк через банк без обращения в поддержку платформы ведёт к перманентному бану.',
          'Предоставление ложных доказательств является нарушением правил и влечёт блокировку.',
        ],
      },
      {
        heading: '8. Контакты для вопросов по возврату',
        content: `Если у вас возникли вопросы по статусу заявки на возврат или вы не можете открыть спор через интерфейс — обратитесь в поддержку: Telegram @givi_hu или email anvarikromov778@gmail.com. Время ответа — до 2 часов.`,
      },
    ],
  },
  contacts: {
    title: 'Контакты',
    icon: <Mail size={26} strokeWidth={1.5}/>,
    lastUpdated: null,
    isContacts: true,
    contacts: [
      {
        icon: '💬',
        label: 'Telegram поддержка',
        value: '@givi_hu',
        href: 'https://t.me/givi_hu',
        desc: 'Быстрый ответ — до 2 часов',
      },
      {
        icon: '📧',
        label: 'Email',
        value: 'anvarikromov778@gmail.com',
        href: 'mailto:anvarikromov778@gmail.com',
        desc: 'Для официальных запросов',
      },
    ],
    faq: [
      { q: 'Как открыть спор по сделке?', a: 'Перейдите в раздел «Сделки», откройте нужную сделку и нажмите «Открыть спор». Администратор рассмотрит заявку в течение 24 часов.' },
      { q: 'Сколько времени занимает вывод средств?', a: 'Вывод обрабатывается в течение 1–24 часов в зависимости от выбранного метода. Крипто — быстрее всего.' },
      { q: 'Что делать, если продавец не отвечает?', a: 'Если продавец не передал товар в течение 24 часов после оплаты — открывайте спор. Средства вернутся автоматически.' },
      { q: 'Как стать продавцом?', a: 'Зарегистрируйтесь, пополните баланс для залога и перейдите в раздел «Продать». Верификация не требуется.' },
    ],
  },
}

export default function LegalPage() {
  const { page } = useParams()
  const data = PAGES[page]

  if (!data) return <Navigate to="/legal/rules" replace />

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 20px', animation: 'fadeUp 0.4s ease both' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, fontSize: 13, color: 'var(--t3)' }}>
        <Link to="/" style={{ color: 'var(--t3)' }}
          onMouseEnter={e => e.target.style.color = 'var(--t2)'}
          onMouseLeave={e => e.target.style.color = 'var(--t3)'}>Главная</Link>
        <span>›</span>
        <span style={{ color: 'var(--t2)' }}>{data.title}</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(245,200,66,0.2), rgba(124,106,255,0.2))',
            border: '1px solid var(--border2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>{data.icon}</div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-h)', fontWeight: 800, fontSize: 'clamp(22px,4vw,32px)', letterSpacing: '-0.02em' }}>
              {data.title}
            </h1>
            {data.lastUpdated && (
              <div style={{ color: 'var(--t3)', fontSize: 13, marginTop: 4 }}>
                Последнее обновление: {data.lastUpdated}
              </div>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
          {Object.entries(PAGES).map(([key, p]) => (
            <Link key={key} to={`/legal/${key}`} style={{
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-h)',
              background: page === key ? 'rgba(245,200,66,0.12)' : 'var(--bg3)',
              color: page === key ? 'var(--accent)' : 'var(--t2)',
              border: `1px solid ${page === key ? 'rgba(245,200,66,0.3)' : 'var(--border)'}`,
              transition: 'all 0.15s',
            }}>
              {p.icon} {p.title}
            </Link>
          ))}
        </div>
      </div>

      {/* Contacts page */}
      {data.isContacts ? (
        <div>
          <div style={{ display: 'grid', gap: 16, marginBottom: 40 }}>
            {data.contacts.map((c, i) => (
              <a key={i} href={c.href} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 20,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: '20px 24px', transition: 'all 0.2s',
                color: 'inherit',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(245,200,66,0.15), rgba(124,106,255,0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                }}>{c.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 600, marginBottom: 2 }}>{c.label}</div>
                  <div style={{ fontFamily: 'var(--font-h)', fontWeight: 700, fontSize: 16, color: 'var(--accent)' }}>{c.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{c.desc}</div>
                </div>
                <div style={{ color: 'var(--t4)', fontSize: 18 }}>→</div>
              </a>
            ))}
          </div>

          {/* FAQ */}
          <h2 style={{ fontFamily: 'var(--font-h)', fontWeight: 800, fontSize: 20, marginBottom: 20 }}>
            Частые вопросы
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.faq.map((item, i) => (
              <FAQItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </div>
      ) : (
        /* Rules / Privacy page */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {data.sections.map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 16, padding: '24px 28px',
            }}>
              <h2 style={{
                fontFamily: 'var(--font-h)', fontWeight: 700, fontSize: 16,
                color: 'var(--accent)', marginBottom: 12, letterSpacing: '-0.01em',
              }}>{s.heading}</h2>

              {s.content && (
                <p style={{ color: 'var(--t2)', lineHeight: 1.8, fontSize: 14 }}>{s.content}</p>
              )}

              {s.items && (
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 0, listStyle: 'none' }}>
                  {s.items.map((item, j) => (
                    <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: 'var(--t2)', fontSize: 14, lineHeight: 1.7 }}>
                      <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {/* CTA */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(245,200,66,0.08), rgba(124,106,255,0.06))',
            border: '1px solid rgba(245,200,66,0.2)',
            borderRadius: 16, padding: '24px 28px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-h)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Остались вопросы?</div>
              <div style={{ color: 'var(--t3)', fontSize: 13 }}>Свяжитесь с нашей поддержкой — ответим в течение 2 часов</div>
            </div>
            <Link to="/legal/contacts" className="btn btn-primary btn-sm">Написать в поддержку</Link>
          </div>
        </div>
      )}
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s',
      ...(open ? { borderColor: 'var(--border2)' } : {}),
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', background: 'transparent', border: 'none',
        cursor: 'pointer', color: 'var(--t1)', textAlign: 'left',
        fontFamily: 'var(--font-b)', fontSize: 14, fontWeight: 600,
      }}>
        <span>{q}</span>
        <span style={{
          fontSize: 18, color: 'var(--accent)', flexShrink: 0, marginLeft: 12,
          transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s',
          display: 'inline-block',
        }}>+</span>
      </button>
      {open && (
        <div style={{
          padding: '0 20px 16px', color: 'var(--t2)', fontSize: 14, lineHeight: 1.7,
          animation: 'fadeUp 0.2s ease both',
        }}>{a}</div>
      )}
    </div>
  )
}
