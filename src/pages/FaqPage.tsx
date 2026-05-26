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
        a: '羽毛シャトルのみ使用可能です。ナイロン製は使用不可となります。日本バドミントン協会またはBWF認定の第2種検定球以上をご用意ください。例：ヨネックス「エアロセンサ300／500」、ミズノ「ミズノ練習球」など。',
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

      {/* シャトル番手クイックリファレンス */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">🏸</span>
          <span className="font-extrabold text-blue-900">シャトル持参ガイド（超初級ダブルスを除く）</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-3 border border-blue-200 text-center">
            <div className="text-xs text-gray-500 mb-1">🌸 4月〜9月</div>
            <div className="font-extrabold text-blue-700 text-lg">3番</div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-blue-200 text-center">
            <div className="text-xs text-gray-500 mb-1">🍂 10月〜3月</div>
            <div className="font-extrabold text-blue-700 text-lg">4番</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">第2種検定球以上・8〜12球 ／ 忘れた場合は会場で1球500円購入可 ／ 超初級ダブルスのみ持参不要</p>
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
