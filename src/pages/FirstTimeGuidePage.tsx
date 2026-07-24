import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  UserPlus, Users, ShoppingBag, JapaneseYen, ListChecks,
  CalendarX, Languages, HelpCircle, ArrowRight, BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';
import { Breadcrumbs } from '../components/Breadcrumbs';

// 初参加・一人参加ガイド（/:lang/first-time）。
// 「バドミントン 初心者 参加」「バドミントン 一人参加 埼玉」等の検索意図の受け皿。
// 内容は既存の FAQ / レベルガイド / 活動データで確認できる事実のみ。未確認の情報
// （ラケット貸出の有無・当日の詳細タイムテーブル等）は掲載せず、相互リンクで補う。

const TEXT = {
  ja: {
    home: 'ホーム',
    crumb: 'はじめての方へ',
    h1: 'はじめての方へ — 初参加・一人参加ガイド',
    intro:
      '川口・蕨バドミントン交流会に初めて参加する方向けのガイドです。一人参加・初心者の方も多く参加しています。持ち物・参加費・当日の流れ・キャンセル・中国語対応など、参加前に知っておきたいことをまとめました。',
    soloTitle: '一人参加・初参加でも大丈夫？',
    solo:
      '参加者の多くがお一人での参加です。交流会形式なのですぐに馴染めます。レベル分けをしているので、初心者・ブランクのある方も歓迎しています。',
    levelTitle: '参加できるレベル',
    level:
      '超初級からオープンまでレベル別に開催しています。自分に合ったクラスの目安はレベルガイドをご覧ください。',
    levelLink: 'レベルガイドを見る',
    bringTitle: '持ち物',
    bring:
      'ラケットと室内用シューズをご持参ください。シャトルは会費に含まれています。',
    feeTitle: '参加費',
    fee:
      '通常活動は2時間600円〜（定員制・事前申し込み制）。大会の参加費は種目により異なり、各大会ページに記載しています。',
    feeActivity: '募集中の通常活動を見る',
    feeTournament: '大会一覧を見る',
    flowTitle: '当日の流れ（通常活動）',
    flow:
      '受付後、まず20〜30分ほど練習し、そのあとはフリーで試合を行います。',
    cancelTitle: 'キャンセルについて',
    cancel:
      'やむを得ずキャンセルする場合の扱いは、キャンセルポリシー・参加ルールをご確認ください。',
    cancelLink: 'キャンセルポリシーを見る',
    langTitle: '中国語対応',
    langBody:
      '運営は中国語対応が可能で、日本人・中国人を中心とした中日バイリンガルのコミュニティです。中国語のみでも安心してご参加いただけます。',
    faqTitle: 'その他のよくある質問',
    faqBody: '会場・駐車場・申し込み方法など、よくある質問をまとめています。',
    faqLink: 'FAQを見る',
    ctaTitle: 'まずは参加してみましょう',
    ctaActivity: '募集中の通常活動',
    ctaTournament: '募集中の大会',
  },
  zh: {
    home: '首页',
    crumb: '首次参加指南',
    h1: '首次参加・单独参加指南',
    intro:
      '这是为首次参加川口・蕨羽毛球交流会的朋友准备的指南。很多参加者都是单独参加・初学者。汇总了携带物品・参加费・当天流程・取消・中文对应等参加前想了解的内容。',
    soloTitle: '单独参加・首次参加也可以吗？',
    solo:
      '大多数参加者都是一个人来的，交流会形式很容易融入。我们设有分级制度，欢迎初学者和有一段时间没打球的朋友参加。',
    levelTitle: '可参加的级别',
    level:
      '从超初级到公开级别按水平分组举办。适合自己的班次参考请查看级别说明。',
    levelLink: '查看级别说明',
    bringTitle: '携带物品',
    bring:
      '请自带球拍和室内运动鞋。羽毛球已包含在活动费用中。',
    feeTitle: '参加费',
    fee:
      '常规活动为2小时600日元起（定员制・需事前报名）。比赛的参加费因项目而异，详见各比赛页面。',
    feeActivity: '查看报名中的常规活动',
    feeTournament: '查看赛事列表',
    flowTitle: '当天流程（常规活动）',
    flow:
      '签到后，先练习20〜30分钟左右，之后自由进行比赛。',
    cancelTitle: '关于取消',
    cancel:
      '不得已需要取消时的处理，请查看取消政策・参加规则。',
    cancelLink: '查看取消政策',
    langTitle: '中文对应',
    langBody:
      '运营团队可以用中文沟通，是以日本人・中国人为主的中日双语社区。只会中文也能安心参加。',
    faqTitle: '其他常见问题',
    faqBody: '汇总了场地・停车场・报名方法等常见问题。',
    faqLink: '查看FAQ',
    ctaTitle: '先来参加一次吧',
    ctaActivity: '报名中的常规活动',
    ctaTournament: '报名中的比赛',
  },
} as const;

const inlineLink = 'inline-flex items-center gap-1 text-blue-600 font-medium hover:underline';

const Section = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
      <Icon className="w-5 h-5 text-blue-500 flex-shrink-0" /> {title}
    </h2>
    <div className="text-sm sm:text-base text-gray-600 leading-relaxed">{children}</div>
  </section>
);

export const FirstTimeGuidePage = () => {
  const { lang } = useLanguage();
  const homeLang = lang === 'zh' ? 'zh' : 'ja';
  const t = TEXT[homeLang];

  useStaticPageMeta();

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: t.home, path: `/${homeLang}/` }, { label: t.crumb }]} />

      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 flex items-center gap-2">
          <UserPlus className="w-7 h-7 text-blue-500 flex-shrink-0" /> {t.h1}
        </h1>
        <p className="text-gray-600 text-sm sm:text-base leading-relaxed">{t.intro}</p>
      </header>

      <Section icon={Users} title={t.soloTitle}>{t.solo}</Section>

      <Section icon={BarChart3} title={t.levelTitle}>
        <p className="mb-2">{t.level}</p>
        <Link to={`/${homeLang}/level-guide`} className={inlineLink}>{t.levelLink} <ArrowRight className="w-3.5 h-3.5" /></Link>
      </Section>

      <Section icon={ShoppingBag} title={t.bringTitle}>{t.bring}</Section>

      <Section icon={JapaneseYen} title={t.feeTitle}>
        <p className="mb-2">{t.fee}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to={`/${homeLang}/activity`} className={inlineLink}>{t.feeActivity} <ArrowRight className="w-3.5 h-3.5" /></Link>
          <Link to={`/${homeLang}/tournaments`} className={inlineLink}>{t.feeTournament} <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
      </Section>

      <Section icon={ListChecks} title={t.flowTitle}>{t.flow}</Section>

      <Section icon={CalendarX} title={t.cancelTitle}>
        <p className="mb-2">{t.cancel}</p>
        <Link to={`/${homeLang}/cancel-policy`} className={inlineLink}>{t.cancelLink} <ArrowRight className="w-3.5 h-3.5" /></Link>
      </Section>

      <Section icon={Languages} title={t.langTitle}>{t.langBody}</Section>

      <Section icon={HelpCircle} title={t.faqTitle}>
        <p className="mb-2">{t.faqBody}</p>
        <Link to={`/${homeLang}/faq`} className={inlineLink}>{t.faqLink} <ArrowRight className="w-3.5 h-3.5" /></Link>
      </Section>

      {/* CTA */}
      <section className="mt-10 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-6 text-white">
        <h2 className="text-lg font-extrabold mb-4">{t.ctaTitle}</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to={`/${homeLang}/activity`} className="flex-1 bg-white text-blue-700 font-bold px-5 py-3 rounded-xl text-sm text-center hover:bg-blue-50 transition-colors">
            {t.ctaActivity} →
          </Link>
          <Link to={`/${homeLang}/tournaments`} className="flex-1 bg-blue-800/40 text-white font-bold px-5 py-3 rounded-xl text-sm text-center hover:bg-blue-800/60 transition-colors ring-1 ring-white/30">
            {t.ctaTournament} →
          </Link>
        </div>
      </section>
    </main>
  );
};

export default FirstTimeGuidePage;
