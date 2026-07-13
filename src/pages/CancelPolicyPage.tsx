import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';

type RuleItem = { heading: string; body: string; level: string };
type RuleSection = { id: string; icon: string; color: string; headerBg: string; lightBg: string; title: string; items: RuleItem[] };

const rulesJa: RuleSection[] = [
  {
    id: 'cancel-ja',
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
        body: '超初級ダブルス大会を除くすべての大会でシャトル持参が必須です。日本バドミントン協会またはBWF認定の第2種検定球以上を規定数（3〜5球）ご用意ください。ナイロン・羽毛どちらも可です。なお、超初級ダブルス大会はシャトル持参不要です。',
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

const rulesZh: RuleSection[] = [
  {
    id: 'cancel',
    icon: '❌',
    color: 'border-red-400',
    headerBg: 'bg-gradient-to-r from-red-600 to-red-500',
    lightBg: 'bg-red-50',
    title: '取消相关规定',
    items: [
      {
        heading: '请务必遵守取消截止日期',
        body: '每个赛事都有取消截止日期。只有在截止日期前申请取消，才能办理退款。超过截止日期后，无论何种原因均无法退款。',
        level: 'warning',
      },
      {
        heading: '严禁当天取消或无故缺席',
        body: '当天临时取消或无故缺席会给其他参赛者和工作人员带来极大困扰。如有特殊情况，请尽早联系我们。',
        level: 'danger',
      },
      {
        heading: '多次违规将被拒绝参赛',
        body: '多次无故缺席或恶意取消的参赛者，可能被拒绝参加今后的赛事。为了维护良好的比赛秩序，请理解并遵守规则。',
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
    title: '羽毛球相关规定',
    items: [
      {
        heading: '超初级双打以外必须自带羽毛球',
        body: '除超初级双打外，所有赛事均须自带羽毛球。请准备日本羽毛球协会或BWF认证的2级以上检定球（3〜5颗）。超初级双打赛事无需自带。',
        level: 'info',
      },
      {
        heading: '请按季节选择合适的羽毛球速度',
        body: '4〜9月推荐3号，10〜次年3月推荐4号。速度不对会影响飞行轨迹和比赛，请尽量按要求准备。',
        level: 'warning',
      },
      {
        heading: '忘带时可在会场购买',
        body: '当天忘带羽毛球可在会场以500日元/颗购买，数量有限，请尽量自备。',
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
    title: '参赛相关规定',
    items: [
      {
        heading: '请本人亲自完成报名',
        body: '代他人集体报名容易引发问题，请每位参赛者自行报名。',
        level: 'info',
      },
      {
        heading: '身体不适时请勿参赛',
        body: '发烧或身体不适时，请为其他参赛者着想，勿来参赛。此类情况的取消可个别协商处理。',
        level: 'info',
      },
      {
        heading: '请以体育精神参赛',
        body: '无裁判、自裁制度。请互相尊重，共同营造良好的比赛氛围。过激抗议或言语暴力可能被要求离场。',
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
  const { lang } = useLanguage();
  const rules = lang === 'zh' ? rulesZh : rulesJa;
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <Breadcrumbs items={[
        { label: lang === 'ja' ? 'ホーム' : '首页', path: `/${lang}/` },
        { label: lang === 'ja' ? 'キャンセルポリシー' : '取消政策' },
      ]} />
      {/* タイトル */}
      <div className="text-center mb-10">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">
          {lang === 'ja' ? '📋 大会ルール・キャンセルポリシー' : '📋 赛事规则・取消政策'}
        </h1>
        <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
          {lang === 'ja' ? (
            <>参加前に必ずご確認ください。<br />皆が気持ちよく楽しめる大会のために、ルールのご理解・ご協力をお願いします。</>
          ) : (
            <>参赛前请务必确认。<br />为了让所有人都能愉快参赛，请理解并遵守规则。</>
          )}
        </p>
      </div>

      {/* 重要な警告バナー */}
      <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-5 mb-10 flex gap-4">
        <span className="text-3xl flex-shrink-0">🚨</span>
        <div>
          <div className="font-extrabold text-red-700 text-base mb-1">
            {lang === 'ja' ? '当日キャンセル・無断欠席は厳禁です' : '严禁当天取消或无故缺席'}
          </div>
          <p className="text-sm text-red-600">
            {lang === 'ja'
              ? '空席が出ると、補欠の方や運営に多大なご迷惑をおかけします。やむを得ない場合はできるだけ早めにご連絡ください。繰り返し違反された場合は今後の参加をお断りします。'
              : '空位出现会给候补选手和工作人员带来极大困扰。如有特殊情况请尽早联系我们。多次违规将被拒绝参赛。'}
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
        <h3 className="font-extrabold text-gray-900 text-lg mb-4">
          {lang === 'ja' ? '📮 キャンセルの方法' : '📮 取消方法'}
        </h3>
        <ol className="space-y-3">
          {(lang === 'ja'
            ? [
                '大会カードに記載されたキャンセル期限を確認する',
                '期限前であれば、申し込み時のメールアドレス宛にご連絡ください',
                '返金は確認後、3〜5営業日以内に対応します',
              ]
            : [
                '确认赛事卡上记载的取消截止日期',
                '在截止日期前，请通过报名时使用的邮箱联系我们',
                '确认后将在3〜5个工作日内办理退款',
              ]
          ).map((step, i) => (
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
          {lang === 'ja' ? '大会一覧を見る →' : '查看赛事列表 →'}
        </Link>
      </div>
    </main>
  );
};
