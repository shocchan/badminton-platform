import { Helmet } from 'react-helmet-async'

type Player = { rank: number | null; medal: string | null; name: string; team: string; win: number; lose: number; gFor: number; gAgainst: number; ratio: string; host: boolean }

const players: Player[] = [
  // TODO: 実際の結果データを入力してください
  // 例: { rank: 1, medal: '🥇', name: '選手名', team: 'チーム名', win: 6, lose: 0, gFor: 90, gAgainst: 50, ratio: '1.800', host: false },
]

const playerNames: string[] = [
  // TODO: 選手名（短縮）を入力してください
]

const scores: (string | null)[][] = [
  // TODO: スコアマトリクスを入力してください
]

function isWin(score: string): boolean {
  const [a, b] = score.split('-').map(Number)
  return a > b
}

const photos = [
  { src: '/images/vol2/award.jpg', alt: '表彰式' },
  { src: '/images/vol2/match1.jpg', alt: '試合の様子 1' },
  { src: '/images/vol2/match2.jpg', alt: '試合の様子 2' },
  { src: '/images/vol2/match3.jpg', alt: '試合の様子 3' },
  { src: '/images/vol2/match4.jpg', alt: '試合の様子 4' },
]

export default function Vol2Results() {
  return (
    <>
      <Helmet>
        <title>第2回大会 結果 | 川口・蕨バド交流杯</title>
        <meta name="description" content="第2回川口・蕨バド交流大会の試合結果・総当たりスコア表・最終順位。" />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm text-gray-500 mb-1">TODO: 日付・会場を入力</p>
          <h1 className="text-2xl font-bold text-gray-900">
            第2回 川口・蕨バド交流大会<br />
            <span className="text-lg font-medium text-gray-600">シングルス 夜の部 — 結果</span>
          </h1>
        </div>

        {players.length > 0 && (
          <>
            <h2 className="text-base font-semibold text-gray-700 mb-3">■ 最終順位</h2>
            <div className="overflow-x-auto mb-10">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#1b2a4a] text-white">
                    <th className="py-2 px-3 text-center w-14">順位</th>
                    <th className="py-2 px-3 text-left">選手名</th>
                    <th className="py-2 px-3 text-center">勝</th>
                    <th className="py-2 px-3 text-center">敗</th>
                    <th className="py-2 px-3 text-center">G得</th>
                    <th className="py-2 px-3 text-center">G失</th>
                    <th className="py-2 px-3 text-center">得失率</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => (
                    <tr key={p.name} className={`border-b border-gray-100 ${p.host ? 'bg-gray-50 text-gray-400' : i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                      <td className="py-2 px-3 text-center text-base">{p.medal ?? (p.host ? '―' : p.rank)}</td>
                      <td className="py-2 px-3 font-medium">
                        {p.name}
                        <span className="ml-2 text-xs text-gray-400 font-normal">{p.team}</span>
                        {p.host && <span className="ml-2 text-xs text-gray-400">（主催・非公開）</span>}
                      </td>
                      <td className="py-2 px-3 text-center">{p.win}</td>
                      <td className="py-2 px-3 text-center">{p.lose}</td>
                      <td className="py-2 px-3 text-center">{p.gFor}</td>
                      <td className="py-2 px-3 text-center">{p.gAgainst}</td>
                      <td className="py-2 px-3 text-center">{p.ratio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2 text-center">※ 主催者は参加しましたが、大会の公平性のため順位は非公開扱いとしています</p>
            </div>

            <h2 className="text-base font-semibold text-gray-700 mb-3">■ 総当たりスコア表</h2>
            <p className="text-xs text-gray-400 mb-3">横列の選手が縦列の選手に対した得点。緑＝勝ち、赤＝負け。</p>
            <div className="overflow-x-auto mb-10">
              <table className="border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1b2a4a] text-white">
                    <th className="py-2 px-3 text-left min-w-[90px]">選手 ↓ vs →</th>
                    {playerNames.map(n => (
                      <th key={n} className="py-2 px-2 text-center min-w-[56px]">{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scores.map((row, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${players[i]?.host ? 'bg-gray-50 text-gray-400' : i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                      <td className="py-2 px-3 font-medium whitespace-nowrap">{playerNames[i]}</td>
                      {row.map((score, j) => (
                        <td key={j} className={`py-2 px-2 text-center ${score === null ? 'bg-gray-200' : isWin(score) ? 'text-green-700 font-medium' : 'text-red-800'}`}>
                          {score ?? '―'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* 写真ギャラリー */}
        <h2 className="text-base font-semibold text-gray-700 mb-3">■ 大会の様子</h2>
        <div className="grid grid-cols-2 gap-3 mb-10">
          {photos.map(photo => (
            <div key={photo.src} className={photo.src.includes('award') ? 'col-span-2' : ''}>
              <img
                src={photo.src}
                alt={photo.alt}
                className="w-full rounded-xl object-cover"
                style={{ maxHeight: photo.src.includes('award') ? '360px' : '220px' }}
              />
              <p className="text-xs text-gray-400 mt-1 text-center">{photo.alt}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <a href="/blog" className="text-sm text-blue-600 hover:underline">← 大会レポートブログに戻る</a>
        </div>
      </div>
    </>
  )
}
