// CEO確認ページ（Phase 5）。/:lang/ai-course/review
//
// - **staging / preview / local 専用**。本番ホスト（kawabado.com）では404。
// - スクリーンショットの展示ではなく、実コンポーネントを fixture 状態で描画する。
// - fixture はメモリ上だけで完結し、production DB もローカル保存も書き換えない。
// - 教材の本文はここに書かない。問題表示の確認は「サーバー配信と同じ形」の
//   ダミー1問で行う（正解・解説が payload に無いことも、この形が証明している）。

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { NotFoundPage } from '../NotFoundPage';
import { AdvRuntimeProvider, type AdvRuntime } from '../../components/ai-course/adventure/AdvRuntimeContext';
import { AdvBattleRunner } from '../../components/ai-course/adventure/AdvBattleRunner';
import { denialText } from '../../components/ai-course/adventure/advDenialText';
import type { ActivityDenial } from '../../lib/aiLesson/course/adventure/activityClient';
import { upsellCopy } from '../../lib/aiLesson/course/sales/upsell';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

/** 本番ホストでは存在しないのと同じにする */
const PRODUCTION_HOSTS = ['kawabado.com', 'www.kawabado.com'];

const card = 'rounded-2xl border border-gray-200 bg-white p-4';
const h2cls = 'mt-8 mb-2 text-base font-bold text-gray-900';

/**
 * fixture の RuntimeAuth。fetch をメモリ内応答に差し替え、実HTTPを送らない。
 * バトル1回ぶんのサーバー応答（正解なし）と、採点応答（回答後の開示）を再現する。
 */
const fixtureBattle = {
  activity: 'battle', tier: 'normal', timed: false, timeLimitSec: null,
  unseenRatio: 1, skills: ['grammar'], attemptSeed: 1,
  questions: [
    {
      attemptToken: 'fixture-attempt-1', key: 'fx-q1', type: 'u-know', skill: 'grammar', level: 'n3',
      targetJapanese: '会議は10時に始まることになっています。',
      questionJa: '「ことになっています」の意味に最も近いものはどれですか。',
      questionZh: '与「ことになっています」意思最接近的是哪一个？',
      choices: [
        { key: 'a', textJa: '予定・規則としてそう決まっている' },
        { key: 'b', textJa: '自分の意思でそう決めた' },
        { key: 'c', textJa: 'たった今そうなった' },
      ],
      timed: false,
    },
  ],
};

const fixtureGrade = {
  correct: true, correctKey: 'a',
  explanationJa: '「ことになっている」は、予定や規則として決まっていることを表します。',
  explanationZh: '「ことになっている」表示作为预定或规则已经确定的事情。',
  meaningZh: '按规定・按预定',
  whyWrong: [
    { key: 'b', textJa: '自分の意思でそう決めた', whyWrongJa: '自分の意思は「ことにする」です。', whyWrongZh: '表达自己的决定用「ことにする」。' },
    { key: 'c', textJa: 'たった今そうなった', whyWrongJa: '直前の変化ではありません。', whyWrongZh: '不表示刚刚发生的变化。' },
  ],
  sourceLabel: 'fixture',
};

const makeFixtureRuntime = (): AdvRuntime => ({
  auth: {
    getAccessToken: async () => 'fixture-jwt',
    sessionToken: 'fixture-session',
  },
  refreshSession: async () => { /* fixture */ },
  consumedSeconds: () => 1080,
  tabActive: () => true,
});

/** fixture の fetch 差し替え。activityClient は同一オリジンへ POST するので、ここで受ける */
const installFixtureFetch = () => {
  const orig = window.fetch;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/ai-course/activity/start')) {
      return new Response(JSON.stringify(fixtureBattle), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/ai-course/activity/grade')) {
      return new Response(JSON.stringify(fixtureGrade), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return orig(input, init);
  }) as typeof fetch;
  return () => { window.fetch = orig; };
};

const REVIEW_STATES: { id: string; ja: string; zh: string }[] = [
  { id: 'pricing', ja: '料金ページ（実ページへ）', zh: '价格页（跳转实页）' },
  { id: 'unstarted', ja: '60分パス未開始（開始確認）', zh: '60分钟通行证未开始' },
  { id: 'active60', ja: 'active・残り60分', zh: '使用中・剩60分钟' },
  { id: 'active42', ja: 'active・残り42分', zh: '使用中・剩42分钟' },
  { id: 'active5', ja: 'active・残り5分（警告色）', zh: '使用中・剩5分钟' },
  { id: 'battle', ja: '問題（サーバー採点・fixture）', zh: '题目（服务器判分・fixture）' },
  { id: 'denials', ja: '拒否文言（期限切れ・使い切り・鍵）', zh: '拒绝文案' },
  { id: 'consumed', ja: '使い切り + 再購入 + アップセル', zh: '用完 + 再购买 + 升级' },
  { id: 'activeUpsell', ja: 'active中アップセル（残り10分以下）', zh: '使用中的升级提示' },
  { id: 'monthPrep', ja: '1か月準備中 / 6か月相談', zh: '1个月准备中 / 6个月咨询' },
  { id: 'journey', ja: '会話・言い直し・レポート', zh: '会话・改口・报告' },
  { id: 'takeover', ja: '二重タブ', zh: '双标签页' },
];

export function AiCourseReviewPage() {
  const params = useParams();
  const lang: L = params.lang === 'zh' ? 'zh' : 'ja';
  const [view, setView] = useState('unstarted');
  const [battleOn, setBattleOn] = useState(false);

  const [isProduction] = useState(() => typeof window !== 'undefined' && PRODUCTION_HOSTS.includes(window.location.hostname));
  const fixtureRuntime = useMemo(() => makeFixtureRuntime(), []);

  // 本番では存在しない（404）。一般ナビからもリンクしない
  if (isProduction) return <NotFoundPage />;

  const remainingChip = (min: number) => (
    <p className={`text-right text-xs font-semibold ${min <= 5 ? 'text-red-700' : 'text-gray-500'}`}>
      ⏱ {tx(lang, `残り${min}分`, `剩余${min}分钟`)}
      <span className="ml-2 font-normal text-gray-400">〜8/3 22:00</span>
    </p>
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-lg font-bold text-gray-900">
        AI日本語コース 状態確認（{lang === 'zh' ? '中文' : '日本語'}・staging専用）
      </h1>
      <p className="mt-1 text-xs text-gray-500">
        {tx(lang,
          '実コンポーネントを fixture 状態で表示します。DBは書き換えません。本番URLでは404になります。',
          '以 fixture 状态显示真实组件。不写数据库。正式环境URL返回404。')}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {REVIEW_STATES.map((s) => (
          <button key={s.id} type="button"
            className={`min-h-[36px] rounded-full border px-3 py-1 text-xs ${view === s.id ? 'border-blue-600 bg-blue-50 font-bold text-blue-800' : 'border-gray-200 bg-white text-gray-600'}`}
            onClick={() => { setView(s.id); setBattleOn(false); }}>
            {tx(lang, s.ja, s.zh)}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-3xl border-2 border-dashed border-gray-300 p-3">
        {view === 'pricing' && (
          <div className="py-6 text-center">
            <a className="text-blue-700 underline" href={`/${lang}/ai-course/plans`}>
              {tx(lang, '実際の料金ページを開く →', '打开实际的价格页 →')}
            </a>
            <p className="mt-2 text-xs text-gray-500">
              {tx(lang, '購入（模擬決済）→ 未開始 → 開始の流れは実ページで確認できます。',
                '购买（模拟支付）→ 未开始 → 开始的流程可在实页确认。')}
            </p>
          </div>
        )}

        {view === 'unstarted' && (
          <div className="mx-auto w-full max-w-xl py-4">
            <h2 className="text-lg font-bold text-gray-900">{tx(lang, '60分パスを開始しますか？', '要开始60分钟通行证吗？')}</h2>
            <div className={`${card} mt-4`}>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>⏱ {tx(lang, '開始すると24時間、合計60分まで学習できます。', '开始后24小时内，最多可学习60分钟。')}</li>
                <li>📅 {tx(lang, '開始の期限：8/9 21:00', '开始期限：8/9 21:00')}</li>
                <li>💾 {tx(lang, '学習の進捗は時間が終わっても残ります。', '学习进度在时间结束后也会保留。')}</li>
                <li>😴 {tx(lang, '画面を閉じている間・操作していない間は減りません。', '关闭页面或没有操作的时间不会被扣。')}</li>
              </ul>
            </div>
            <button type="button" className="mt-4 w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">
              {tx(lang, '体験を始める（ここから24時間）', '开始体验(从现在起24小时)')}
            </button>
          </div>
        )}

        {(view === 'active60' || view === 'active42' || view === 'active5') && (
          <div className="py-4">
            {remainingChip(view === 'active60' ? 60 : view === 'active42' ? 42 : 5)}
            <div className={`${card} mt-2`}>
              <p className="text-sm font-semibold text-gray-900">{tx(lang, '今日の冒険（実画面はログイン後に表示）', '今天的冒险（实页面登录后显示）')}</p>
              <p className="mt-1 text-xs text-gray-500">
                {tx(lang, '残り時間チップはこの位置・この色で学習画面上部に常時出ます。5分以下で赤になります。',
                  '剩余时间提示以此位置・颜色常驻学习页顶部。5分钟以下变红。')}
              </p>
            </div>
          </div>
        )}

        {view === 'battle' && (
          <div className="py-2">
            {!battleOn && (
              <button type="button" className="w-full min-h-[48px] rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
                onClick={() => { installFixtureFetch(); setBattleOn(true); }}>
                {tx(lang, 'fixtureバトルを開始（実runner・サーバー採点の形）', '开始fixture战斗（真实runner・服务器判分形态）')}
              </button>
            )}
            {battleOn && (
              <AdvRuntimeProvider value={fixtureRuntime}>
                <AdvBattleRunner
                  lang={lang} tier="normal" targetId="fx" targetLabel="fixture" targetIds={['fx']}
                  seenKeys={new Set()} recentWrongKeys={new Set()} priorAttempts={[]}
                  dateKey={new Date().toISOString().slice(0, 10)} nowISO={new Date().toISOString()} level="N3"
                  onFinish={() => { /* fixture */ }}
                  onClose={() => setBattleOn(false)}
                />
              </AdvRuntimeProvider>
            )}
            <p className="mt-2 text-xs text-gray-500">
              {tx(lang,
                '問題payloadに正解・解説は入っていません（この画面のfixtureも同じ形）。回答を押した瞬間に採点APIの応答として解説が出ます。',
                '题目payload中不含正确答案・解说（本fixture同形）。按下作答的瞬间，解说作为判分API的响应出现。')}
            </p>
          </div>
        )}

        {view === 'denials' && (
          <div className="space-y-3 py-2">
            {(['trial_expired', 'trial_consumed', 'stage_locked', 'no_entitlement', 'rate_limited'] as ActivityDenial[]).map((d) => {
              const t = denialText(d, lang);
              return (
                <div key={d} className={card}>
                  <p className="text-xs text-gray-400">{d}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{t.title}</p>
                  <p className="mt-0.5 text-sm text-gray-600">{t.body}</p>
                </div>
              );
            })}
          </div>
        )}

        {view === 'consumed' && (
          <div className="mx-auto w-full max-w-xl py-4">
            <h2 className="text-center text-lg font-bold text-gray-900">{tx(lang, '60分を使い切りました', '60分钟已用完')}</h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {tx(lang, '学習の進捗・冒険マップ・復習の予定はすべて残っています。', '学习进度、冒险地图和复习计划都完整保留。')}
            </p>
            {(() => {
              const copy = upsellCopy('ai-month', lang);
              return (
                <div className={`${card} mt-6 border-blue-200 bg-blue-50`}>
                  <p className="text-sm font-bold text-gray-900">{copy.heading}</p>
                  <ul className="mt-1 space-y-0.5">
                    {copy.points.map((p) => <li key={p} className="text-sm text-gray-700">・{p}</li>)}
                  </ul>
                  <button type="button" className="mt-3 w-full min-h-[48px] rounded-xl bg-blue-600 font-bold text-white">{copy.acceptLabel}</button>
                  <button type="button" className="mt-2 w-full min-h-[44px] text-sm text-gray-500 underline">{copy.dismissLabel}</button>
                </div>
              );
            })()}
          </div>
        )}

        {view === 'activeUpsell' && (
          <div className="mx-auto w-full max-w-xl py-2">
            <p className="text-right text-xs font-semibold text-red-700">⏱ {tx(lang, '残り8分', '剩余8分钟')}</p>
            <div className={`${card} mt-2 border-blue-200 bg-blue-50`}>
              <p className="text-sm font-bold text-gray-900">{tx(lang, '残り時間が少なくなりました', '剩余时间不多了')}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">
                {tx(lang, 'ここまでの診断結果・冒険マップ・復習の予定・学習履歴は、1か月プランへそのまま引き継げます。',
                  '到目前为止的诊断结果、冒险地图、复习计划和学习记录，都可以直接延续到1个月方案。')}
              </p>
              <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl bg-blue-600 text-sm font-bold text-white">
                {tx(lang, '1か月プランの準備状況を見る', '查看1个月方案的准备情况')}
              </button>
              <button type="button" className="mt-2 w-full min-h-[44px] rounded-xl border border-blue-300 bg-white text-sm font-semibold text-blue-700">
                {tx(lang, '60分を追加する', '再加60分钟')}
              </button>
              <button type="button" className="mt-1 w-full min-h-[40px] text-sm text-gray-500 underline">{tx(lang, '今はしない', '暂时不用')}</button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {tx(lang, '表示条件: 残り10分以下・購入直後には出ない・同一セッション1回まで・「今はしない」後は3日間再表示しない。実動作はE2E（14/15枚目のスクリーンショット）で確認済み。',
                '显示条件：剩余10分钟以下・购买后不会立即显示・同一会话最多1次・「暂时不用」后3天内不再显示。')}
            </p>
          </div>
        )}

        {view === 'monthPrep' && (
          <div className="mx-auto w-full max-w-xl space-y-4 py-2">
            <div className={card}>
              <p className="text-sm font-bold text-gray-900">{tx(lang, '1か月プラン（価格未確定）', '1个月方案（价格未定）')}</p>
              <p className="mt-1 text-sm text-gray-700">
                {tx(lang, '価格はCEO確定待ちのため、購入CTAは出しません。確定後はコード変更なしで通常CTAに切り替わります（priceStatus: confirmed）。',
                  '价格待定，因此不显示购买按钮。确定后无需改代码即自动切换为正常按钮。')}
              </p>
              <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl border border-blue-300 bg-white text-sm font-semibold text-blue-700">
                {tx(lang, '1か月プランの準備状況を見る', '查看1个月方案的准备情况')}
              </button>
            </div>
            {(() => {
              const c = upsellCopy('coach-6m', lang);
              return (
                <div className={`${card} border-emerald-200 bg-emerald-50`}>
                  <p className="text-sm font-bold text-gray-900">{c.heading}</p>
                  <ul className="mt-1 space-y-0.5">
                    {c.points.map((pt) => <li key={pt} className="text-sm text-gray-700">・{pt}</li>)}
                  </ul>
                  <button type="button" className="mt-3 w-full min-h-[44px] rounded-xl bg-emerald-600 text-sm font-bold text-white">{c.acceptLabel}</button>
                  <p className="mt-1 text-center text-xs text-gray-500">
                    {tx(lang, '6か月は即時決済ではなく相談導線（acceptIsConsultation）', '6个月不是立即支付，而是咨询入口')}
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {view === 'journey' && (
          <div className="mx-auto w-full max-w-xl space-y-3 py-2 text-sm text-gray-700">
            <div className={card}>
              <p className="font-bold text-gray-900">{tx(lang, 'AI会話', 'AI会话')}</p>
              <p className="mt-1">{tx(lang,
                '会話ミッションの本文（導入質問・ヒント6段階・例文）はレッスン開始時にサーバーから現在の1ミッションだけ届きます。開始前のclientには目次（タイトル・目標表現）しかありません。',
                '会话任务的正文（导入问题・6级提示・例句）在课程开始时由服务器只发送当前1个任务。开始前client只有目录。')}</p>
            </div>
            <div className={card}>
              <p className="font-bold text-gray-900">{tx(lang, '言い直し', '改口练习')}</p>
              <p className="mt-1">{tx(lang,
                'バトルで間違えた文法・今日の表現から素材を選びます（素材0件でも必ず進めます）。判定は目標表現の検出regex（目次側）で行います。',
                '从战斗中答错的语法和今天的表达中选择材料。判定使用目录侧的检测正则。')}</p>
            </div>
            <div className={card}>
              <p className="font-bold text-gray-900">{tx(lang, '学習レポート', '学习报告')}</p>
              <p className="mt-1">{tx(lang,
                '今日できたこと・バトル成果・技能別の手ごたえ・次の復習と次の冒険を表示します（E2E 12枚目=模試の科目別結果を参照）。',
                '显示今天完成的内容・战斗成果・各技能手感・下次复习与下次冒险。')}</p>
            </div>
          </div>
        )}

        {view === 'takeover' && (
          <div className="py-8 text-center">
            <h2 className="text-lg font-bold text-gray-900">{tx(lang, '別のタブで学習中です', '正在其他标签页学习')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {tx(lang, '時間を二重に使わないため、学習は1つのタブだけで行えます。', '为了不重复扣时间，学习只能在一个标签页进行。')}
            </p>
          </div>
        )}
      </div>

      <h2 className={h2cls}>{tx(lang, '実サーバーで確認する項目（staging）', '在真实服务器上确认的项目（staging）')}</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
        <li>{tx(lang, '料金 → 模擬購入 → 開始確認 → 冒険 → 問題 → 採点の一連は実ページで通せます。', '价格 → 模拟购买 → 开始确认 → 冒险 → 题目 → 判分可在实页走通。')}</li>
        <li>{tx(lang, '未ログイン・利用権なしでは教材APIが401/403を返します（実測30項目PASS）。', '未登录・无使用权时教材API返回401/403（实测30项PASS）。')}</li>
      </ul>
    </div>
  );
}

export default AiCourseReviewPage;
