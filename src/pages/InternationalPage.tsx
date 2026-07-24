import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe, Users, Languages, UserPlus, CalendarDays, Image as ImageIcon,
  ArrowRight, type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';
import { Breadcrumbs } from '../components/Breadcrumbs';

// 国際交流ページ（/:lang/international）。
// 「川口 国際交流 バドミントン」「埼玉 外国人 バドミントン」「日本人 中国人 交流 川口」
// 「中国人 バドミントン 埼玉」等の検索意図の受け皿。
// 事実のみ使用し、国籍比率・人数は断定しない（「参加実績がある」表現）。国籍を強調しすぎず、
// 多様な参加者が自然に交流する雰囲気を伝える。

const inlineLink = 'inline-flex items-center gap-1 text-blue-600 font-medium hover:underline';

const Section = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
      <Icon className="w-5 h-5 text-blue-500 flex-shrink-0" /> {title}
    </h2>
    <div className="text-sm sm:text-base text-gray-600 leading-relaxed">{children}</div>
  </section>
);

const TEXT = {
  ja: {
    home: 'ホーム',
    crumb: '国際交流',
    h1: '国際交流バドミントン（川口・蕨）',
    intro:
      '川口・蕨エリアで活動している、国際交流バドミントンのコミュニティです。日本人・中国人を中心に、さまざまな国から来た人たちが自然に交流しながらプレーしています。一人参加・初参加の方も多く、はじめてでも溶け込みやすい雰囲気です。',
    membersTitle: 'どんな人が参加していますか？',
    members:
      '日本人・中国人を中心に、これまでにインド・フィリピン・インドネシア出身の方の参加実績もあります。国籍も経験もさまざまですが、レベル分けをしているので、初めての方から経験者まで一緒に楽しめます。',
    langTitle: '日本語・中国語で案内できます',
    lang:
      '運営は日本語・中国語の両方で案内が可能です。日本語がまだ不安な方も、中国語だけの方も、安心してご参加いただけます。',
    soloTitle: '一人参加・初参加も歓迎',
    solo: '参加者の多くがお一人での参加です。はじめての方向けのガイドもご用意しています。',
    soloLink: '初参加ガイドを見る',
    activityTitle: '大会と通常活動を開催',
    activity:
      '川口・蕨周辺を中心に、大会（トーナメント）と通常活動（練習＋フリー試合）の両方を開催しています。目的やご都合に合わせて参加できます。',
    tournamentsLink: '大会一覧を見る',
    activityLink: '通常活動を見る',
    reportTitle: '雰囲気は開催レポートから',
    report:
      '過去の大会・活動のレポートや写真を公開しています。当日の雰囲気や、参加者どうしの交流の様子をご覧いただけます。',
    reportLink: '大会レポート・写真を見る',
    ctaTitle: '一緒にプレーしませんか？',
    ctaTournament: '募集中の大会',
    ctaActivity: '募集中の通常活動',
  },
  zh: {
    home: '首页',
    crumb: '国际交流',
    h1: '国际交流羽毛球（川口・蕨）',
    intro:
      '这是在川口・蕨地区活动的国际交流羽毛球社区。以日本人・中国人为主，来自不同国家的人在这里一边自然交流一边打球。单独参加・首次参加的人也很多，即使是第一次也很容易融入。',
    membersTitle: '都有哪些人参加？',
    members:
      '以日本人・中国人为主，此前也有来自印度・菲律宾・印度尼西亚的参加者。国籍和经验各不相同，但我们设有分级制度，从初次参加到有经验的球友都能一起享受。',
    langTitle: '可用日语・中文对应',
    lang:
      '运营团队可以用日语・中文两种语言进行对应。日语还不太有把握的朋友，或只会中文的朋友，都可以安心参加。',
    soloTitle: '欢迎单独参加・首次参加',
    solo: '大多数参加者都是一个人来的。我们也为首次参加的朋友准备了指南。',
    soloLink: '查看首次参加指南',
    activityTitle: '举办比赛和常规活动',
    activity:
      '以川口・蕨周边为中心，举办比赛（锦标赛）和常规活动（练习＋自由比赛）两种。可根据目的和时间安排参加。',
    tournamentsLink: '查看赛事列表',
    activityLink: '查看常规活动',
    reportTitle: '通过活动回顾了解氛围',
    report:
      '我们公开了往届比赛・活动的回顾和照片。可以了解当天的氛围以及参加者之间交流的情形。',
    reportLink: '查看赛事回顾・照片',
    ctaTitle: '要不要一起来打球？',
    ctaTournament: '报名中的比赛',
    ctaActivity: '报名中的常规活动',
  },
} as const;

export const InternationalPage = () => {
  const { lang } = useLanguage();
  const homeLang = lang === 'zh' ? 'zh' : 'ja';
  const t = TEXT[homeLang];

  useStaticPageMeta();

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: t.home, path: `/${homeLang}/` }, { label: t.crumb }]} />

      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Globe className="w-7 h-7 text-blue-500 flex-shrink-0" /> {t.h1}
        </h1>
        <p className="text-gray-600 text-sm sm:text-base leading-relaxed">{t.intro}</p>
      </header>

      <Section icon={Users} title={t.membersTitle}>{t.members}</Section>

      <Section icon={Languages} title={t.langTitle}>{t.lang}</Section>

      <Section icon={UserPlus} title={t.soloTitle}>
        <p className="mb-2">{t.solo}</p>
        <Link to={`/${homeLang}/first-time`} className={inlineLink}>{t.soloLink} <ArrowRight className="w-3.5 h-3.5" /></Link>
      </Section>

      <Section icon={CalendarDays} title={t.activityTitle}>
        <p className="mb-2">{t.activity}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to={`/${homeLang}/tournaments`} className={inlineLink}>{t.tournamentsLink} <ArrowRight className="w-3.5 h-3.5" /></Link>
          <Link to={`/${homeLang}/activity`} className={inlineLink}>{t.activityLink} <ArrowRight className="w-3.5 h-3.5" /></Link>
        </div>
      </Section>

      <Section icon={ImageIcon} title={t.reportTitle}>
        <p className="mb-2">{t.report}</p>
        <Link to={`/${homeLang}/tournaments/gallery`} className={inlineLink}>{t.reportLink} <ArrowRight className="w-3.5 h-3.5" /></Link>
      </Section>

      {/* CTA */}
      <section className="mt-10 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl p-6 text-white">
        <h2 className="text-lg font-extrabold mb-4">{t.ctaTitle}</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to={`/${homeLang}/tournaments`} className="flex-1 bg-white text-blue-700 font-bold px-5 py-3 rounded-xl text-sm text-center hover:bg-blue-50 transition-colors">
            {t.ctaTournament} →
          </Link>
          <Link to={`/${homeLang}/activity`} className="flex-1 bg-blue-800/40 text-white font-bold px-5 py-3 rounded-xl text-sm text-center hover:bg-blue-800/60 transition-colors ring-1 ring-white/30">
            {t.ctaActivity} →
          </Link>
        </div>
      </section>
    </main>
  );
};

export default InternationalPage;
