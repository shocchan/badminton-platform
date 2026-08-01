import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // AIコースの教材データ（層C語彙・読解・聴解）を、画面コード（AdvShell）から
        // 別チャンクへ切り出す。
        //
        // 狙いはキャッシュの粒度。教材は増え続ける一方、画面コードの修正は頻繁に入る。
        // 同居していると、UIを1行直すたびに学習者が教材ぜんぶを再ダウンロードすることになる。
        // 分けておけば、変わった側だけを取り直せばよい。
        //
        // 注意: いずれも静的importなので、**初回の合計転送量は減らない**。
        // 初回を軽くするには出題プールを動的importへ変える必要があり、それは別途P2として記録している。
        manualChunks(id: string) {
          if (id.includes('/course/adventure/vocab/content/')) return 'ai-course-vocab-content';
          if (id.includes('/course/adventure/reading/')) return 'ai-course-reading';
          if (id.includes('/course/adventure/listening/')) return 'ai-course-listening';
          return undefined;
        },
      },
    },
  },
})
