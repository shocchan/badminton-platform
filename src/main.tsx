import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './lib/analytics'

// 広告計測タグ（GA4/Metaピクセル）。env未設定・非本番ドメインならno-op
// （実装差ではなくコメント文言だけの衝突。lib/analytics.ts の isEnabled() は
//   env に加えて kawabado.com かどうかも見るので、条件を明記した方を残した）
initAnalytics()

// Cache bust to force new CF Pages KV upload
;(window as Window & { __v?: string }).__v = '2'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>,
)
