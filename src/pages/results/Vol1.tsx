import { Helmet } from 'react-helmet-async'
import { useParams } from 'react-router-dom'

const t = {
  ja: {
    title: '第1回大会 結果 | 川口・蕨バド交流杯',
    desc: '第1回川口・蕨バド交流大会シングルス夜の部（2026年6月18日）の試合結果・総当たりスコア表・最終順位。',
    date: '2026年6月18日（木）川口市芝園公民館',
    heading: '第1回 川口・蕨バド交流大会',
    sub: 'シングルス 夜の部 — 結果',
    ranking: '■ 最終順位',
    cols: { rank: '順位', name: '選手名', win: '勝', lose: '敗', gFor: 'G得', gAgainst: 'G失', ratio: '得失率' },
    hostNote: '（主催・非公開）',
    hostFooter: '※ 主催者（安田）は参加しましたが、大会の公平性のため順位は非公開扱いとしています',
    scoreSection: '■ 総当たりスコア表',
    scoreNote: '横列の選手が縦列の選手に対した得点。緑＝勝ち、赤＝負け。',
    scoreHeader: '選手 ↓ vs →',
    back: '← 大会レポートブログに戻る',
  },
  zh: {
    title: '第1届比赛结果 | 川口・蕨羽毛球交流杯',
    desc: '第1届川口・蕨羽毛球交流大会单打夜场（2026年6月18日）比赛结果・循环赛成绩表・最终排名。',
    date: '2026年6月18日（周四）川口市芝园公民馆',
    heading: '第1届 川口・蕨羽毛球交流大会',
    sub: '单打 夜场 — 结果',
    ranking: '■ 最终排名',
    cols: { rank: '排名', name: '选手名', win: '胜', lose: '负', gFor: '得分', gAgainst: '失分', ratio: '得失率' },
    hostNote: '（主办・不公开）',
    hostFooter: '※ 主办方（安田）参加了比赛，但为了公平性，排名不公开',
    scoreSection: '■ 循环赛成绩表',
    scoreNote: '横行选手对纵列选手的得分。绿色＝胜，红色＝负。',
    scoreHeader: '选手 ↓ vs →',
    back: '← 返回比赛报道博客',
  },
}

const players = [
  { rank: 1, medal: '🥇', name: '吉田 昌弘', team: 'チームワイ', win: 6, lose: 0, gFor: 90, gAgainst: 50, ratio: '1.800', host: false },
  { rank: 2, medal: '🥈', name: 'Gupta Shivam Tejpal', team: '一般', win: 4, lose: 2, gFor: 83, gAgainst: 72, ratio: '1.153', host: false },
  { rank: 3, medal: '🥉', name: '李 秋傑', team: '一般', win: 3, lose: 3, gFor: 71, gAgainst: 82, ratio: '0.866', host: false },
  { rank: 4, medal: null, name: '付 超然', team: '一般', win: 2, lose: 4, gFor: 71, gAgainst: 79, ratio: '0.899', host: false },
  { rank: 5, medal: null, name: 'Andy', team: '川口・蕨バド', win: 1, lose: 5, gFor: 54, gAgainst: 87, ratio: '0.621', host: false },
  { rank: 6, medal: null, name: '氷', team: '川口・蕨バド', win: 0, lose: 6, gFor: 62, gAgainst: 90, ratio: '0.689', host: false },
  { rank: null, medal: null, name: '安田 翔', team: '川口・蕨バド', win: 5, lose: 1, gFor: 86, gAgainst: 56, ratio: '1.536', host: true },
]

const playerNames = ['吉田', 'Gupta', '李', '付', 'Andy', '氷', '安田']
const scores: (string | null)[][] = [
  [null, '15-12', '15-3',  '15-11', '15-4',  '15-9',  '15-11'],
  ['12-15', null, '15-11', '15-11', '15-11', '15-9',  '11-15'],
  ['3-15',  '11-15', null, '15-11', '15-12', '15-14', '12-15'],
  ['11-15', '11-15', '11-15', null, '15-9',  '15-10', '8-15'],
  ['4-15',  '11-15', '12-15', '9-15', null,  '15-12', '3-15'],
  ['9-15',  '9-15',  '14-15', '10-15', '12-15', null, '7-15'],
  ['11-15', '15-11', '15-12', '15-8',  '15-3',  '15-7', null],
]

function isWin(score: string): boolean {
  const [a, b] = score.split('-').map(Number)
  return a > b
}

export default function Vol1Results() {
  const { lang } = useParams<{ lang?: string }>()
  const l = lang === 'zh' ? t.zh : t.ja

  return (
    <>
      <Helmet>
        <title>{l.title}</title>
        <meta name="description" content={l.desc} />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <p className="text-sm text-gray-500 mb-1">{l.date}</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {l.heading}<br />
            <span className="text-lg font-medium text-gray-600">{l.sub}</span>
          </h1>
        </div>

        <h2 className="text-base font-semibold text-gray-700 mb-3">{l.ranking}</h2>
        <div className="overflow-x-auto mb-10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#1b2a4a] text-white">
                <th className="py-2 px-3 text-center w-14">{l.cols.rank}</th>
                <th className="py-2 px-3 text-left">{l.cols.name}</th>
                <th className="py-2 px-3 text-center">{l.cols.win}</th>
                <th className="py-2 px-3 text-center">{l.cols.lose}</th>
                <th className="py-2 px-3 text-center">{l.cols.gFor}</th>
                <th className="py-2 px-3 text-center">{l.cols.gAgainst}</th>
                <th className="py-2 px-3 text-center">{l.cols.ratio}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.name} className={`border-b border-gray-100 ${p.host ? 'bg-gray-50 text-gray-400' : i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                  <td className="py-2 px-3 text-center text-base">{p.medal ?? (p.host ? '―' : p.rank)}</td>
                  <td className="py-2 px-3 font-medium">
                    {p.name}
                    <span className="ml-2 text-xs text-gray-400 font-normal">{p.team}</span>
                    {p.host && <span className="ml-2 text-xs text-gray-400">{l.hostNote}</span>}
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
          <p className="text-xs text-gray-400 mt-2 text-center">{l.hostFooter}</p>
        </div>

        <h2 className="text-base font-semibold text-gray-700 mb-3">{l.scoreSection}</h2>
        <p className="text-xs text-gray-400 mb-3">{l.scoreNote}</p>
        <div className="overflow-x-auto mb-6">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-[#1b2a4a] text-white">
                <th className="py-2 px-3 text-left min-w-[90px]">{l.scoreHeader}</th>
                {playerNames.map(n => (
                  <th key={n} className="py-2 px-2 text-center min-w-[56px]">{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map((row, i) => (
                <tr key={i} className={`border-b border-gray-100 ${players[i].host ? 'bg-gray-50 text-gray-400' : i % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
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

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <a href="/blog" className="text-sm text-blue-600 hover:underline">{l.back}</a>
        </div>
      </div>
    </>
  )
}
