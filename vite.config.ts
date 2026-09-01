import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /*
     * 古いブラウザ向けの控え（2026-09-01）。
     *
     * 【なぜ要るか】
     * 実在の生徒がPCからログインできず、画面には素のHTML（kb-prerender）だけが出ていた。
     * 本番のバンドルを調べたところ:
     *   - <script type="module"> だけで読み込んでいる（ESM＝Chrome 61以降）
     *   - ?. が55箇所・?? が71箇所・||= ??= が19箇所（Chrome 80〜85以降）
     *   - nomodule の控えが**無い**
     * つまり古いブラウザは**バンドルを1行も実行しない**。
     * エラーも出ないので、画面は真っ白か、消えるはずの素のHTMLが残ったままになる。
     *
     * 中国では 360浏览器・QQ浏览器 の「兼容模式」（IE相当で描画）が普通に使われていて、
     * WeChat内蔵ブラウザも古い。**買ってくれた人が入れない**のがいちばん高くつく。
     *
     * 【何をするか】
     * modern と同じ内容を ES5 まで落とした控えを別に出し、
     * <script nomodule> で読ませる。新しいブラウザはこちらを無視するので、
     * いまの利用者の読み込み量は変わらない（modern 側は今までどおり）。
     */
    legacy({
      // Chrome 64 は ES2017 相当。ここより下は polyfill で補う
      targets: ['defaults', 'not IE 11', 'chrome >= 64', 'safari >= 12'],
      // 使っている構文・APIを自動で検出して詰める（手で列挙すると必ず漏れる）
      modernPolyfills: true,
    }),
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
