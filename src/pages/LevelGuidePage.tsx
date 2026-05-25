import { Link } from 'react-router-dom';

const levels = [
  {
    id: 'open',
    name: 'オープン',
    nameEn: 'OPEN',
    emoji: '🥇',
    color: '#B8860B',
    bg: 'from-yellow-500 to-yellow-400',
    lightBg: 'bg-yellow-50',
    border: 'border-yellow-400',
    badge: 'bg-yellow-100 text-yellow-800',
    description: 'レベル制限なし。上級者から一般プレーヤーまで誰でも参加可能な最高峰クラス。',
    target: '・試合経験が豊富な方\n・しっかり競い合いたい方\n・レベルを問わず挑戦したい方',
    guide: [
      'スマッシュ・ドライブなど攻撃的なショットが打てる',
      '試合の組み立て（戦術）を意識できる',
      '大会経験が複数回ある',
    ],
    note: '初心者の方は下のクラスからのエントリーをおすすめします',
  },
  {
    id: 'intermediate',
    name: '初級SS / 中級',
    nameEn: 'INTERMEDIATE',
    emoji: '🥈',
    color: '#708090',
    bg: 'from-gray-500 to-gray-400',
    lightBg: 'bg-gray-50',
    border: 'border-gray-400',
    badge: 'bg-gray-100 text-gray-700',
    description: 'ある程度の経験があり、ラリーを安定して続けられるプレーヤー向けクラス。',
    target: '・バドミントン歴3年以上\n・ゲーム練習を定期的にしている\n・大会に1〜2回出たことがある',
    guide: [
      'クリアー・スマッシュ・ドロップなど一通り打てる',
      '前後左右の動きができる',
      'ラリーが10球以上続けられる',
    ],
    note: null,
  },
  {
    id: 'beginner',
    name: '初級 / 初級S',
    nameEn: 'BEGINNER',
    emoji: '🥉',
    color: '#CD7F32',
    bg: 'from-orange-500 to-orange-400',
    lightBg: 'bg-orange-50',
    border: 'border-orange-400',
    badge: 'bg-orange-100 text-orange-800',
    description: '基本的なショットを覚えて、ゲームを楽しめるようになってきた方向けのクラス。',
    target: '・バドミントン歴1〜3年\n・練習でゲームを経験している\n・初めての大会に挑戦したい',
    guide: [
      'サーブが安定して入る',
      'クリアーとスマッシュが打てる',
      'ショートラリーが続けられる',
    ],
    note: null,
  },
  {
    id: 'fresher',
    name: '超初級 / 初級OP',
    nameEn: 'FRESHER',
    emoji: '🌱',
    color: '#2d9e5f',
    bg: 'from-green-500 to-green-400',
    lightBg: 'bg-green-50',
    border: 'border-green-400',
    badge: 'bg-green-100 text-green-800',
    description: 'バドミントンを始めたばかりの方でも安心して参加できる、最も敷居の低いクラス。',
    target: '・バドミントン歴1年未満\n・初めて試合に出る方\n・とにかく楽しく参加したい方',
    guide: [
      'ラケットにシャトルが当てられる',
      '基本的なサーブができる',
      'ゆっくりなラリーが少し続けられる',
    ],
    note: '「負けても楽しかった！」が目標のクラスです',
  },
];

export const LevelGuidePage = () => {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {/* タイトル */}
      <div className="text-center mb-10">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">
          🏸 クラス分け案内
        </h1>
        <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
          「自分はどのクラスに出ればいいの？」を解決します。<br />
          下のガイドを参考に、ぴったりのクラスを選んでください。
        </p>
      </div>

      {/* ピラミッド図 */}
      <div className="mb-12">
        <h2 className="text-center text-sm font-bold text-gray-400 mb-6 tracking-widest uppercase">Class Pyramid</h2>
        <div className="flex flex-col items-center gap-2">
          {levels.map((level, i) => {
            const widths = ['w-full sm:w-2/4', 'w-full sm:w-3/4', 'w-full sm:w-3/4', 'w-full'];
            return (
              <div key={level.id} className={`${widths[i]} transition-all`}>
                <div className={`bg-gradient-to-r ${level.bg} rounded-xl px-6 py-3 flex items-center justify-between shadow-sm`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{level.emoji}</span>
                    <div>
                      <div className="text-white font-bold text-sm sm:text-base">{level.name}</div>
                      <div className="text-white/70 text-xs">{level.nameEn}</div>
                    </div>
                  </div>
                  <a
                    href={`/#`}
                    onClick={e => { e.preventDefault(); document.getElementById(level.id)?.scrollIntoView({ behavior: 'smooth' }); }}
                    className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-full transition-colors"
                  >
                    詳細 ↓
                  </a>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">↑ 上に行くほど競技レベルが高くなります</p>
      </div>

      {/* クラス詳細カード */}
      <div className="space-y-6">
        {levels.map(level => (
          <div key={level.id} id={level.id} className={`rounded-2xl border-2 ${level.border} ${level.lightBg} overflow-hidden scroll-mt-20`}>
            {/* カードヘッダー */}
            <div className={`bg-gradient-to-r ${level.bg} px-6 py-4`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{level.emoji}</span>
                <div>
                  <div className="text-white font-extrabold text-xl">{level.name}</div>
                  <div className="text-white/80 text-xs font-medium tracking-widest">{level.nameEn}</div>
                </div>
              </div>
            </div>

            {/* カード本文 */}
            <div className="p-6">
              <p className="text-gray-700 text-sm sm:text-base mb-5">{level.description}</p>

              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                {/* こんな方におすすめ */}
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="text-xs font-bold text-gray-500 mb-2">👤 こんな方におすすめ</div>
                  {level.target.split('\n').map((line, i) => (
                    <div key={i} className="text-sm text-gray-700">{line}</div>
                  ))}
                </div>

                {/* レベル目安 */}
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="text-xs font-bold text-gray-500 mb-2">✅ レベルの目安</div>
                  <ul className="space-y-1">
                    {level.guide.map((g, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {level.note && (
                <div className="bg-white border border-blue-200 rounded-xl px-4 py-3 mb-5">
                  <p className="text-sm text-blue-700">💡 {level.note}</p>
                </div>
              )}

              {/* エントリーボタン */}
              <Link
                to="/"
                className={`flex items-center justify-center gap-2 w-full sm:w-auto sm:inline-flex bg-gradient-to-r ${level.bg} text-white font-bold px-6 py-3 rounded-xl shadow hover:opacity-90 transition-opacity`}
              >
                {level.name}クラスの大会を見る →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* 迷ったら */}
      <div className="mt-10 bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
        <div className="text-2xl mb-2">🤔</div>
        <h3 className="font-bold text-gray-900 mb-2">どのクラスか迷ったら？</h3>
        <p className="text-sm text-gray-600 mb-4">
          迷ったら<strong>一つ下のクラス</strong>から始めることをおすすめします。<br />
          楽しく試合ができることが一番大切です！
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
        >
          大会一覧を見る →
        </Link>
      </div>
    </main>
  );
};
