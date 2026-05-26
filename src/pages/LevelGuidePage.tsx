import { Link } from 'react-router-dom';

const levels = [
  {
    id: 'open',
    name: 'オープン',
    nameEn: 'OPEN',
    emoji: '🥇',
    bg: 'from-violet-600 to-violet-500',
    lightBg: 'bg-violet-50',
    border: 'border-violet-400',
    svgFill: '#7c3aed',
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
    name: '中級',
    nameEn: 'INTERMEDIATE',
    emoji: '🥈',
    bg: 'from-indigo-600 to-indigo-500',
    lightBg: 'bg-indigo-50',
    border: 'border-indigo-400',
    svgFill: '#4f46e5',
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
    name: '初級',
    nameEn: 'BEGINNER',
    emoji: '🥉',
    bg: 'from-orange-500 to-orange-400',
    lightBg: 'bg-orange-50',
    border: 'border-orange-400',
    svgFill: '#f97316',
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
    name: '超初級',
    nameEn: 'FRESHER',
    emoji: '🌱',
    bg: 'from-green-500 to-green-400',
    lightBg: 'bg-green-50',
    border: 'border-green-400',
    svgFill: '#22c55e',
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

// SVGピラミッド
const ClassPyramid = () => {
  const W = 560;
  const H = 260;
  const cx = W / 2;

  // 各段の高さ・上辺幅・下辺幅（台形）
  const tiers = [
    { topW: 110, botW: 200, y: 0,   h: 60, fill: '#7c3aed', label: '🥇 オープン',  sub: 'OPEN' },
    { topW: 200, botW: 310, y: 64,  h: 60, fill: '#4f46e5', label: '🥈 中級',      sub: 'INTERMEDIATE' },
    { topW: 310, botW: 420, y: 128, h: 60, fill: '#f97316', label: '🥉 初級',      sub: 'BEGINNER' },
    { topW: 420, botW: 540, y: 192, h: 60, fill: '#10b981', label: '🌱 超初級',    sub: 'FRESHER — 初めての方大歓迎' },
  ];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-lg mx-auto"
      aria-label="クラスピラミッド図：上から オープン・中級・初級・超初級"
    >
      {tiers.map((t, i) => {
        const x1 = cx - t.topW / 2;
        const x2 = cx + t.topW / 2;
        const x3 = cx + t.botW / 2;
        const x4 = cx - t.botW / 2;
        const y1 = t.y;
        const y2 = t.y + t.h - 4;
        const isLast = i === tiers.length - 1;
        const points = isLast
          ? `${x1},${y1} ${x2},${y1} ${x3},${y2} ${x4},${y2}`
          : `${x1},${y1} ${x2},${y1} ${x3},${y2} ${x4},${y2}`;

        const my = t.y + t.h / 2 - 6;

        return (
          <g key={i}>
            <polygon
              points={points}
              fill={t.fill}
              opacity="0.92"
            />
            {/* 段の間の区切り線 */}
            {!isLast && (
              <line
                x1={cx - t.botW / 2} y1={y2}
                x2={cx + t.botW / 2} y2={y2}
                stroke="white" strokeWidth="2.5" opacity="0.6"
              />
            )}
            {/* ラベル */}
            <text
              x={cx} y={my + 4}
              textAnchor="middle"
              fontSize="15"
              fontWeight="800"
              fontFamily="system-ui, sans-serif"
              fill="white"
            >
              {t.label}
            </text>
            <text
              x={cx} y={my + 20}
              textAnchor="middle"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
              fill="rgba(255,255,255,0.8)"
            >
              {t.sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

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

      {/* SVGピラミッド */}
      <div className="mb-12">
        <h2 className="text-center text-xs font-bold text-gray-400 mb-4 tracking-widest uppercase">
          ↑ 上が最高峰クラス
        </h2>
        <ClassPyramid />
        <p className="text-center text-xs text-gray-400 mt-3">
          各クラスの詳細は下のカードをご確認ください
        </p>
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
                  <div className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                    <span>👤</span> こんな方におすすめ
                  </div>
                  {level.target.split('\n').map((line, i) => (
                    <div key={i} className="text-sm text-gray-700 py-0.5">{line}</div>
                  ))}
                </div>

                {/* レベル目安 */}
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                    <span>✅</span> レベルの目安
                  </div>
                  <ul className="space-y-1.5">
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
