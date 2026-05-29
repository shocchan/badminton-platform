import { Link } from 'react-router-dom';

const rules = [
  {
    id: 'cancel',
    icon: '❌',
    color: 'border-red-400',
    headerBg: 'bg-gradient-to-r from-red-600 to-red-500',
    lightBg: 'bg-red-50',
    title: 'キャンセルについて',
    items: [
      {
        heading: 'キャンセル期限を必ず守ってください',
        body: '各大会にはキャンセル期限があります。期限までにキャンセルを申し出た場合のみ返金対応が可能です。期限を過ぎたキャンセルは、理由のいかんにかかわらず返金できません。',
        level: 'warning',
      },
      {
        heading: '当日キャンセル・無断欠席は厳禁です',
        body: '当日になってのキャンセル連絡、および無断欠席は、他の参加者・運営に多大なご迷惑をおかけします。やむを得ない事情がある場合は、できるだけ早めにご連絡ください。',
        level: 'danger',
      },
      {
        heading: '繰り返しの違反はご参加をお断りします',
        body: '無断欠席や悪質なキャンセルを繰り返した方は、今後の大会へのご参加をお断りする場合があります。気持ちよく大会を運営するため、ルールのご理解・ご協力をお願いします。',
        level: 'danger',
      },
    ],
  },
  {
    id: 'shuttle',
    icon: '🏸',
    color: 'border-blue-400',
    headerBg: 'bg-gradient-to-r from-blue-600 to-blue-500',
    lightBg: 'bg-blue-50',
    title: 'シャトルについて',
    items: [
      {
        heading: '超初級ダブルス以外はシャトル持参が必須です',
        body: '超初級ダブルス大会を除くすべての大会でシャトル持参が必須です。日本バドミントン協会またはBWF認定の第2種検定球以上を規定数（8〜12球）ご用意ください。ナイロン・羽毛どちらも可です。なお、超初級ダブルス大会はシャトル持参不要です。',
        level: 'info',
      },
      {
        heading: '季節によって推奨番手（スピード）があります',
        body: '4月〜9月は3番、10月〜翌3月は4番が推奨です。番手が違うと飛び方が変わり試合に影響するため、できるだけ推奨番手でお願いします。',
        level: 'warning',
      },
      {
        heading: '忘れた場合・持ち込めない場合は現地購入できます',
        body: '当日シャトルを忘れた場合は、会場にて1球500円でご購入いただけます。ただし数に限りがあるため、なるべくご持参ください。',
        level: 'warning',
      },
    ],
  },
  {
    id: 'general',
    icon: '📋',
    color: 'border-gray-400',
    headerBg: 'bg-gradient-to-r from-gray-600 to-gray-500',
    lightBg: 'bg-gray-50',
    title: '参加に関するルール',
    items: [
      {
        heading: '申し込みは必ずご本人が行ってください',
        body: '複数人分のまとめ申し込みはトラブルの原因になります。参加者それぞれがご自身で申し込みをお願いします。',
        level: 'info',
      },
      {
        heading: '体調不良の場合は参加をご遠慮ください',
        body: '発熱・体調不良の場合は、他の参加者への配慮のため、参加をご遠慮ください。この場合のキャンセルは個別にご相談ください。',
        level: 'info',
      },
      {
        heading: 'フェアプレーの精神でご参加ください',
        body: '審判なし・セルフジャッジが基本です。お互いを尊重し、気持ちよくプレーできる環境を一緒に作りましょう。過度な抗議・暴言はご退場いただく場合があります。',
        level: 'info',
      },
    ],
  },
];

const levelStyle = (level: string) => {
  switch (level) {
    case 'danger': return 'bg-red-100 border-l-4 border-red-500';
    case 'warning': return 'bg-yellow-50 border-l-4 border-yellow-400';
    default: return 'bg-white border-l-4 border-blue-300';
  }
};

const levelIcon = (level: string) => {
  switch (level) {
    case 'danger': return '🚨';
    case 'warning': return '⚠️';
    default: return 'ℹ️';
  }
};

export const CancelPolicyPage = () => {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      {/* タイトル */}
      <div className="text-center mb-10">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">
          📋 大会ルール・キャンセルポリシー
        </h1>
        <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
          参加前に必ずご確認ください。<br />
          皆が気持ちよく楽しめる大会のために、ルールのご理解・ご協力をお願いします。
        </p>
      </div>

      {/* 重要な警告バナー */}
      <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-5 mb-10 flex gap-4">
        <span className="text-3xl flex-shrink-0">🚨</span>
        <div>
          <div className="font-extrabold text-red-700 text-base mb-1">当日キャンセル・無断欠席は厳禁です</div>
          <p className="text-sm text-red-600">
            空席が出ると、補欠の方や運営に多大なご迷惑をおかけします。やむを得ない場合はできるだけ早めにご連絡ください。繰り返し違反された場合は今後の参加をお断りします。
          </p>
        </div>
      </div>

      {/* ルールセクション */}
      <div className="space-y-8">
        {rules.map(section => (
          <div key={section.id} className={`rounded-2xl border-2 ${section.color} overflow-hidden`}>
            <div className={`${section.headerBg} px-6 py-4 flex items-center gap-3`}>
              <span className="text-2xl">{section.icon}</span>
              <h2 className="text-white font-extrabold text-lg">{section.title}</h2>
            </div>
            <div className={`${section.lightBg} p-6 space-y-4`}>
              {section.items.map((item, i) => (
                <div key={i} className={`rounded-xl p-4 ${levelStyle(item.level)}`}>
                  <div className="flex items-start gap-2 mb-1">
                    <span className="flex-shrink-0 mt-0.5">{levelIcon(item.level)}</span>
                    <div className="font-bold text-gray-800 text-sm sm:text-base">{item.heading}</div>
                  </div>
                  <p className="text-sm text-gray-600 ml-6 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* キャンセル手順 */}
      <div className="mt-10 bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <h3 className="font-extrabold text-gray-900 text-lg mb-4">📮 キャンセルの方法</h3>
        <ol className="space-y-3">
          {[
            '大会カードに記載されたキャンセル期限を確認する',
            '期限前であれば、申し込み時のメールアドレス宛にご連絡ください',
            '返金は確認後、3〜5営業日以内に対応します',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-gray-700">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* 戻るリンク */}
      <div className="mt-10 text-center">
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
