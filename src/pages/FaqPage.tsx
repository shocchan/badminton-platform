import { useState } from 'react';
import { Link } from 'react-router-dom';

const faqs = [
  {
    category: '参加・申し込みについて',
    icon: '📝',
    items: [
      {
        q: '初めてでも参加できますか？',
        a: 'もちろん大歓迎です！超初級・初級クラスは初心者の方を対象にしており、試合に慣れていない方も安心してご参加いただけます。「負けても楽しかった！」が目標のクラスです。',
      },
      {
        q: '一人で参加してもいいですか？',
        a: 'シングルスは一人でご参加いただけます。ダブルス・混合ダブルス大会は、ペアが決まってからお申し込みください。当日ペア未定の場合は試合が組めないため、ペアが確定した段階でのエントリーをお願いしています。',
      },
      {
        q: '申し込み後に内容を変更できますか？',
        a: '申し込み内容の変更はキャンセル期限内に限りご対応できます。お早めにご連絡ください。',
      },
      {
        q: '子どもと一緒に参加できますか？',
        a: '中学生以上であれば参加可能です。保護者の方も一緒にご参加いただけます。',
      },
    ],
  },
  {
    category: 'シャトル・用具について',
    icon: '🏸',
    items: [
      {
        q: 'シャトルは持参が必要ですか？',
        a: '超初級ダブルス大会を除き、シャトル持参が必須です。日本バドミントン協会またはBWF認定の第2種検定球以上を、規定数（8〜12球）ご用意ください。なお、超初級ダブルス大会のみシャトル持参は不要です。',
      },
      {
        q: 'シャトルの番手（スピード）はどれを選べばいいですか？',
        a: '季節によって推奨番手が異なります。4月〜9月は3番、10月〜翌3月は4番をご用意ください。番手が違うと飛び方が変わり試合に影響するため、できるだけ推奨番手でお願いします。',
      },
      {
        q: 'シャトルを忘れた場合はどうなりますか？',
        a: '会場にて1球500円でご購入いただけます。数に限りがあるため、なるべくご持参いただくようお願いします。',
      },
      {
        q: 'シャトルの種類（ナイロン・羽毛）はどちらでもいいですか？',
        a: '羽毛シャトルのみ使用可能です。ナイロン製は使用不可です。また、羽毛でも検定なしの練習球（エアロセンサ500以下など）は使用不可となります。使用可能なのは日本バドミントン協会またはBWF認定の第2種検定球以上のみです。例：ヨネックス「エアロセンサ700（AS-700）」「ニューオフィシャル（F-80）」など。',
      },
      {
        q: 'ラケットは貸し出ししていますか？',
        a: 'ラケットの貸し出しはございません。ご自身のラケットをお持ちください。',
      },
      {
        q: 'ウェアの指定はありますか？',
        a: '特に指定はありません。動きやすい服装でお越しください。ただし、会場のシューズルールに従い、体育館用シューズが必要です。',
      },
    ],
  },
  {
    category: '当日の流れについて',
    icon: '📅',
    items: [
      {
        q: '何分前に到着すれば良いですか？',
        a: '開始5分前までにはお越しください。15分以上の遅刻は進行に支障をきたす恐れがあり、試合が組めない場合は不戦敗となることもあります。遅れそうな場合は事前にご連絡をお願いします。',
      },
      {
        q: '審判はいますか？',
        a: 'セルフジャッジ制です。お互いがフェアにジャッジし合います。気持ちよくプレーできるよう、スポーツマンシップのある態度でのご参加をお願いします。',
      },
      {
        q: '試合は何試合できますか？',
        a: 'クラスや参加人数によって異なりますが、最低3試合以上を保証しています。詳細は各大会の案内をご確認ください。',
      },
      {
        q: '途中で帰ることはできますか？',
        a: 'やむを得ない事情がある場合はご相談ください。ただし、試合の組み合わせに影響が出るため、途中退場はなるべくご遠慮いただいています。',
      },
    ],
  },
  {
    category: 'キャンセル・費用について',
    icon: '💰',
    items: [
      {
        q: '参加費はいつ支払うのですか？',
        a: '事前支払いが必要な大会と、当日支払いの大会があります。大会カードの「事前支払い」表示をご確認ください。',
      },
      {
        q: 'キャンセルした場合、返金されますか？',
        a: 'キャンセル期限内のキャンセルに限り、返金対応をしています。期限を過ぎたキャンセルは原則返金できません。詳細はキャンセルポリシーをご確認ください。',
      },
      {
        q: '雨天や会場都合で中止になった場合は？',
        a: '主催側都合での中止の場合は全額返金します。天候による中止判断は原則として前日までに連絡いたします。',
      },
    ],
  },
];

export const FaqPage = () => {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      {/* タイトル */}
      <div className="text-center mb-10">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">
          ❓ よくある質問
        </h1>
        <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
          「初めてで不安…」という方もご安心ください。<br />
          よく寄せられる質問をまとめました。
        </p>
      </div>

      {/* シャトル持参ガイド */}
      <div className="mb-10 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏸</span>
          <span className="font-extrabold text-gray-900 text-base sm:text-lg">使用OK・NGシャトルガイド</span>
          <span className="text-xs text-gray-400 font-normal">（超初級ダブルスを除く）</span>
        </div>

        {/* OK商品 */}
        <div>
          <div className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1">
            <span className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center text-green-600 flex-shrink-0">✓</span>
            使用OK（第2種検定球以上・羽毛のみ）
          </div>
          {/* モバイル: 横スクロール / デスクトップ: 3列グリッド */}
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 sm:overflow-visible">
            {/* AS-700 */}
            <div className="flex-shrink-0 w-[72vw] sm:w-auto bg-white border-2 border-green-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs font-bold text-red-600 mb-0.5">YONEX</div>
                  <div className="font-extrabold text-gray-900 text-sm leading-tight">エアロセンサ700</div>
                  <div className="text-xs text-gray-400">AS-700</div>
                </div>
                <span className="flex-shrink-0 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">第2種検定</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">一般大会でよく使われるスタンダード。コスパと品質のバランスが◎</p>
              <a
                href="https://www.amazon.co.jp/s?k=ヨネックス+エアロセンサ700+AS-700"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-xs font-bold py-2 rounded-lg transition-colors"
              >
                <span>🛒</span> Amazonで見る
              </a>
            </div>
            {/* F-80 */}
            <div className="flex-shrink-0 w-[72vw] sm:w-auto bg-white border-2 border-green-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs font-bold text-red-600 mb-0.5">YONEX</div>
                  <div className="font-extrabold text-gray-900 text-sm leading-tight">ニューオフィシャル</div>
                  <div className="text-xs text-gray-400">F-80</div>
                </div>
                <span className="flex-shrink-0 text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">第1種検定</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">国内主要大会で使われるハイグレード球。耐久性・飛行性能ともにトップクラス</p>
              <a
                href="https://www.amazon.co.jp/s?k=ヨネックス+ニューオフィシャル+F-80"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-xs font-bold py-2 rounded-lg transition-colors"
              >
                <span>🛒</span> Amazonで見る
              </a>
            </div>
            {/* RSL シルバーフェザー */}
            <div className="flex-shrink-0 w-[72vw] sm:w-auto bg-white border-2 border-green-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="text-xs font-bold text-blue-700 mb-0.5">RSL</div>
                  <div className="font-extrabold text-gray-900 text-sm leading-tight">シルバーフェザー</div>
                  <div className="text-xs text-gray-400">Silver Feather</div>
                </div>
                <span className="flex-shrink-0 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">第2種検定</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">マレーシア老舗ブランド。ヨネックスより安価で耐久性が高く、コスパ最強と人気</p>
              <a
                href="https://www.amazon.co.jp/s?k=RSL+シルバーフェザー+シャトル"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-xs font-bold py-2 rounded-lg transition-colors"
              >
                <span>🛒</span> Amazonで見る
              </a>
            </div>
          </div>
        </div>

        {/* NG例 */}
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <div className="text-xs font-bold text-red-700 mb-1.5 flex items-center gap-1">
            <span>🚫</span> 使用NG（持参しても使えません）
          </div>
          <div className="flex flex-wrap gap-2">
            {['ナイロン製シャトル全般', 'エアロセンサ600以下（AS-600/500/400/300/200）', 'メイビスシリーズ（ナイロン）'].map(ng => (
              <span key={ng} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{ng}</span>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400">8〜12球持参 ／ 忘れた場合は会場で1球500円購入可 ／ 超初級ダブルスのみ持参不要</p>
      </div>

      {/* 参加費ガイド */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">💰</span>
          <span className="font-extrabold text-gray-900 text-base sm:text-lg">参加費一覧</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {/* シングルス */}
          <div className="bg-white border-2 border-blue-200 rounded-2xl p-4">
            <div className="text-xs font-bold text-blue-600 mb-1">シングルス</div>
            <div className="text-2xl font-extrabold text-gray-900 mb-1">¥1,500<span className="text-sm font-normal text-gray-500"> / 人</span></div>
            <p className="text-xs text-gray-500 leading-relaxed">シャトル持参必須（8〜12球）</p>
          </div>
          {/* ダブルス */}
          <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4">
            <div className="text-xs font-bold text-indigo-600 mb-1">ダブルス・混合ダブルス</div>
            <div className="text-2xl font-extrabold text-gray-900 mb-1">¥2,000<span className="text-sm font-normal text-gray-500"> / ペア</span></div>
            <p className="text-xs text-gray-500 leading-relaxed">シャトル持参必須（8〜12球）</p>
          </div>
          {/* 超初級 */}
          <div className="bg-white border-2 border-green-200 rounded-2xl p-4">
            <div className="text-xs font-bold text-green-600 mb-1">超初級ダブルス</div>
            <div className="text-2xl font-extrabold text-gray-900 mb-1">¥3,000<span className="text-sm font-normal text-gray-500"> / ペア</span></div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">シャトル持参不要</span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mt-1.5">シャトルは主催側が用意します</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">※ 参加費は大会カードに記載。事前支払い・当日支払いは大会ごとに異なります。</p>
      </div>

      {/* FAQセクション */}
      <div className="space-y-8">
        {faqs.map((section) => (
          <div key={section.category}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">{section.icon}</span>
              <h2 className="font-extrabold text-gray-800 text-base sm:text-lg">{section.category}</h2>
            </div>
            <div className="space-y-2">
              {section.items.map((item, i) => {
                const key = `${section.category}-${i}`;
                const isOpen = !!openItems[key];
                return (
                  <div key={key} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggle(key)}
                      className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-blue-600 font-extrabold text-sm flex-shrink-0 mt-0.5">Q.</span>
                        <span className="font-bold text-gray-800 text-sm sm:text-base">{item.q}</span>
                      </div>
                      <span className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 pt-0">
                        <div className="border-t border-gray-100 pt-4 flex gap-3">
                          <span className="text-green-600 font-extrabold text-sm flex-shrink-0 mt-0.5">A.</span>
                          <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* まだ疑問が解決しない場合 */}
      <div className="mt-12 bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
        <div className="text-2xl mb-2">💬</div>
        <h3 className="font-bold text-gray-900 mb-2">他にご不明点はありますか？</h3>
        <p className="text-sm text-gray-600 mb-4">
          お気軽にお問い合わせください。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            大会一覧を見る →
          </Link>
          <Link
            to="/cancel-policy"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-bold px-6 py-3 rounded-xl border border-gray-200 transition-colors"
          >
            キャンセルポリシーを確認 →
          </Link>
        </div>
      </div>
    </main>
  );
};
