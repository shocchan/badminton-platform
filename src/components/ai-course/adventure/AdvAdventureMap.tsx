// 成長マップ（冒険マップ）。PRODUCT_CANON §5・§6・原則11/12/13/15/16。
//
// 旧コースの「成長」画面（12週の文字リスト）と V2 のルート表示が別々の進捗モデルとして
// 併存していたので、**ここ1枚へ統合**している。
//
// この画面がやること（優先順位そのまま上から並べる）:
//   1. いまどの章の、どこにいるのか            → ヒーロー帯
//   2. だから今日は何をすればいいのか          → 「今日の一歩」カード（Primary CTA）
//   3. 攻略状況（晴らした地域／これから行く地域）→ 冒険の道
//   4. 各地域の詳細と、そこから起こせる行動      → 地域カード（**必ずCTAを持つ**）
//
// 守っていること:
// - 地図を豪華にして今日の行動を隠さない。**Primary CTA は地図より上**（原則16）
// - 現在地は必ず1つ（`buildAdventureMap` が保証）
// - 世界観の名前だけにしない。地域名の下に必ず「何の力を鍛えるか」を出す（原則12）
// - 色だけで状態を伝えない（霧・枠線・記号・ラベル・aria-labelでも伝える）
// - 測っていないものは「未判定」と書く（原則13）
// - **どの地域を開いても押せるボタンが1つある**（原則15・行き止まりを作らない）
// - prefers-reduced-motion ではアニメーションを止める
// - 地図が読めない/使えない人のために**一覧表示へ切り替えられる**
import { useEffect, useMemo, useRef, useState } from 'react';
import { List, Map as MapIcon, Check, Lock, Flag, ChevronRight } from 'lucide-react';
import {
  buildAdventureMap, availableRouteKinds, ROUTE_KIND_LABEL, ROUTE_KIND_HINT, LAYER_LABEL,
  type MapRegion, type MapRouteKind, type RegionAction,
} from '../../../lib/aiLesson/course/adventure/advMapModel';
import type { AdventureV2Profile, AdvRoute, AdvTodayQuest } from '../../../lib/aiLesson/course/adventure/advTypes';
import { LandmarkScene, LandmarkIcon } from './AdvMapLandmarks';
import { TeacherAvatar } from '../TeacherAvatar';

type L = 'ja' | 'zh';
const tx = (lang: L, ja: string, zh: string) => (lang === 'zh' ? zh : ja);

interface Props {
  lang: L;
  profile: AdventureV2Profile;
  route: AdvRoute | null;
  mastered: Set<string>;
  currentWeek: number;
  quest: AdvTodayQuest | null;
  /** 今日の冒険で次にやる step の名前（CTAの理由に出す。無ければ出さない） */
  nextStepTitleJa?: string | null;
  nextStepTitleZh?: string | null;
  /** 今日の冒険へ戻る（Primary CTA） */
  onStartToday: () => void;
  onBack: () => void;
  /** 地域カードのCTAが繋がる先。使えないときは今日の冒険へ倒す（行き止まりにしない） */
  onOpenReview: () => void;
  reviewAvailable: boolean;
  onStartConversation: () => void;
  conversationAvailable: boolean;
  onOpenMock: () => void;
  /**
   * 過去問の試験場（答案用紙）。**N2の試験を受ける人にだけ出す。**
   * ルートの進行とは独立した「いつでも入れる特別な場所」なので、
   * 冒険の道（現在地は1つ）には混ぜず、別枠のカードとして出す。
   */
  sheetsVisible: boolean;
  sheetCount: number;
  onOpenSheets: () => void;
}

const STATE_LABEL: Record<MapRegion['state'], { ja: string; zh: string }> = {
  done: { ja: '攻略済み', zh: '已攻略' },
  current: { ja: '現在地・攻略中', zh: '当前位置・攻略中' },
  next: { ja: '次の目的地', zh: '下一个目的地' },
  locked: { ja: 'ことばの霧の中', zh: '在词语的迷雾中' },
};

/** 状態の見た目。色だけに頼らないよう、記号・枠線もセットで持つ */
const STATE_STYLE: Record<MapRegion['state'], { ring: string; chip: string }> = {
  done: { ring: 'ring-2 ring-emerald-400', chip: 'bg-emerald-50 text-emerald-800' },
  current: { ring: 'ring-4 ring-blue-500', chip: 'bg-blue-600 text-white' },
  next: { ring: 'ring-2 ring-amber-400', chip: 'bg-amber-50 text-amber-900' },
  locked: { ring: 'ring-1 ring-gray-300', chip: 'bg-gray-100 text-gray-600' },
};

/** 定着率のバー。未判定はバーを出さない（0%に見せない・原則13） */
const MasteryBar = ({ lang, pct }: { lang: L; pct: number | null }) => {
  if (pct === null) {
    return (
      <p className="text-xs text-gray-500">
        {tx(lang, '定着：未判定（まだ測っていません）', '巩固度：尚未判定（还没有测量）')}
      </p>
    );
  }
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">{tx(lang, '定着', '巩固度')}</span>
        <span className="text-xs font-bold text-gray-800">{pct}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        aria-label={tx(lang, '定着', '巩固度')}>
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export const AdvAdventureMap = ({
  lang, profile, route, mastered, currentWeek, quest,
  nextStepTitleJa, nextStepTitleZh,
  onStartToday, onBack,
  onOpenReview, reviewAvailable, onStartConversation, conversationAvailable, onOpenMock,
  sheetsVisible, sheetCount, onOpenSheets,
}: Props) => {
  const kinds = availableRouteKinds(profile.goalType);
  const [routeKind, setRouteKind] = useState<MapRouteKind>(kinds[0]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [asList, setAsList] = useState(false);
  const currentRef = useRef<HTMLLIElement>(null);

  const map = useMemo(
    () => buildAdventureMap(profile, route, mastered, currentWeek, routeKind),
    [profile, route, mastered, currentWeek, routeKind],
  );

  const current = map.regions.find((r) => r.id === map.currentRegionId) ?? null;
  const nextRegion = map.regions.find((r) => r.id === map.nextRegionId) ?? null;
  const overallPct = map.totalCount === 0 ? 0 : Math.round((map.doneCount / map.totalCount) * 100);

  // 開いている地域の既定は現在地（開いた瞬間に「いまここで何をするか」が見える）。
  // ルートを切り替えたら現在地へ戻す。effectでsetStateすると1フレーム古い表示が挟まるので、
  // **render中にpropsの変化へ合わせて調整する**（AdvShellと同じ形）
  const [syncedKind, setSyncedKind] = useState<MapRouteKind | null>(null);
  if (syncedKind !== routeKind) {
    setSyncedKind(routeKind);
    setOpenId(map.currentRegionId);
  }
  const openRegion = map.regions.find((r) => r.id === openId) ?? null;

  // 地図を開いたら現在地までスクロールする。20地域あると現在地が画面外になる
  useEffect(() => {
    if (asList) return;
    const el = currentRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [asList, routeKind]);

  const regionAria = (r: MapRegion) =>
    `${tx(lang, r.nameJa, r.nameZh)}、${tx(lang, r.abilityJa, r.abilityZh)}、${tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}`;

  /**
   * 地域カードのCTAを実際の行動へ繋ぐ。
   * **使えない行き先には飛ばさず、今日の冒険へ倒す**（押しても何も起きない状態を作らない）。
   */
  const resolveAction = (a: RegionAction): { label: string; reason: string; run: () => void } => {
    if (a.kind === 'review' && !reviewAvailable) {
      return {
        label: tx(lang, '今日の冒険を始める', '开始今天的冒险'),
        reason: tx(lang, 'いま復習の予定はありません。今日のぶんを進めましょう', '现在没有待复习的内容。先完成今天的份量吧'),
        run: onStartToday,
      };
    }
    if (a.kind === 'conversation' && !conversationAvailable) {
      return {
        label: tx(lang, '今日の冒険を始める', '开始今天的冒险'),
        reason: tx(lang, 'いまAI会話は使えません。今日のぶんを進めると会話の準備が整います', '现在无法使用AI会话。完成今天的份量后就能准备好会话'),
        run: onStartToday,
      };
    }
    const run = a.kind === 'review' ? onOpenReview
      : a.kind === 'conversation' ? onStartConversation
      : a.kind === 'mock' ? onOpenMock
      : onStartToday;
    return { label: tx(lang, a.labelJa, a.labelZh), reason: tx(lang, a.reasonJa, a.reasonZh), run };
  };

  /* ── 地域の詳細カード（**必ずCTAを1つ持つ**） ── */
  const RegionDetail = ({ r }: { r: MapRegion }) => {
    const act = resolveAction(r.action);
    return (
      <div className={`mt-2 overflow-hidden rounded-2xl border bg-white ${
        r.state === 'current' ? 'border-blue-300' : 'border-gray-200'}`}>
        <div className="relative h-24 w-full sm:h-28">
          <LandmarkScene kind={r.landmark} tone={r.tone} fogged={r.state === 'locked'}
            className="h-full w-full" />
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm ${STATE_STYLE[r.state].chip}`}>
            {tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}
          </span>
          <span className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
            {tx(lang, LAYER_LABEL[r.layer].ja, LAYER_LABEL[r.layer].zh)}
          </span>
        </div>
        <div className="p-4">
          <p className="text-[11px] font-semibold text-gray-500">{tx(lang, r.chapterJa, r.chapterZh)}</p>
          <p className="text-base font-bold text-gray-900">{tx(lang, r.nameJa, r.nameZh)}</p>
          <p className="mt-0.5 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">
            {tx(lang, '鍛える力：', '锻炼的能力：')}{tx(lang, r.abilityJa, r.abilityZh)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{tx(lang, r.blurbJa, r.blurbZh)}</p>

          <div className="mt-3">
            <MasteryBar lang={lang} pct={r.masteryPct} />
          </div>

          {(r.unlockJa || r.unlockZh) && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-600">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {tx(lang, r.unlockJa, r.unlockZh)}
            </p>
          )}

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-gray-500">{tx(lang, 'ここまで', '到目前为止')}</dt>
              <dd className="text-right text-gray-800">{tx(lang, r.doneJa, r.doneZh)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-gray-500">{tx(lang, '次にすること', '接下来要做的')}</dt>
              <dd className="text-right font-semibold text-gray-900">{tx(lang, r.nextJa, r.nextZh)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">{tx(lang, '目安の時間', '预计时间')}</dt>
              <dd className="text-gray-800">{tx(lang, `約${r.estMinutes}分`, `约${r.estMinutes}分钟`)}</dd>
            </div>
          </dl>

          {/* 行き止まりを作らない。ここから必ず何かを始められる（原則15） */}
          <p className="mt-3 text-xs leading-relaxed text-gray-600">{act.reason}</p>
          <button type="button" onClick={act.run}
            className="mt-1.5 flex w-full min-h-[48px] items-center justify-center gap-1 rounded-xl border-2 border-blue-600 bg-white px-4 py-3 text-base font-bold text-blue-700">
            {act.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      {/* ── 見出し ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onBack}
            className="mb-1 min-h-[44px] text-sm text-gray-500 hover:text-gray-700">
            ← {tx(lang, '今日の冒険へ戻る', '回到今天的冒险')}
          </button>
          <h1 className="text-xl font-bold text-gray-900">{tx(lang, '成長マップ', '成长地图')}</h1>
          <p className="mt-0.5 text-sm text-gray-600">
            {tx(lang, 'ことばの霧を晴らしながら、目的地へ進もう', '一边驱散词语的迷雾，一边前往目的地')}
          </p>
        </div>
        <button type="button" onClick={() => setAsList((v) => !v)}
          className="shrink-0 flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700"
          aria-pressed={asList}>
          {asList ? <MapIcon className="h-4 w-4" aria-hidden /> : <List className="h-4 w-4" aria-hidden />}
          {asList ? tx(lang, '地図で見る', '用地图看') : tx(lang, '一覧で見る', '用列表看')}
        </button>
      </div>

      {/* ── 1. いまどこにいるのか（3秒で分かる帯） ── */}
      <section className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
        aria-label={tx(lang, '現在地', '当前位置')}>
        <div className="relative h-28 w-full sm:h-32">
          {current
            ? <LandmarkScene kind={current.landmark} tone={current.tone} className="h-full w-full" />
            : <div className="h-full w-full bg-gradient-to-b from-sky-100 to-emerald-100" />}
          {/* 文字を読ませるための暗幕。イラストは下に透ける */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="text-[11px] font-semibold text-white/85">
              {current ? tx(lang, current.chapterJa, current.chapterZh) : tx(lang, '冒険の準備中', '冒险准备中')}
            </p>
            <p className="flex items-center gap-1.5 text-lg font-bold leading-tight text-white">
              <Flag className="h-4 w-4 shrink-0" aria-hidden />
              {current ? tx(lang, current.nameJa, current.nameZh) : tx(lang, '現在地を準備しています', '正在准备当前位置')}
            </p>
            {current && (
              <p className="text-xs text-white/90">
                {tx(lang, '鍛える力：', '锻炼的能力：')}{tx(lang, current.abilityJa, current.abilityZh)}
              </p>
            )}
          </div>
        </div>

        <div className="p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700">
              {tx(lang, `目的地：${map.destinationJa}`, `目的地：${map.destinationZh}`)}
            </p>
            <p className="shrink-0 text-xs text-gray-600">
              {tx(lang, `${map.doneCount} / ${map.totalCount} 地域`, `${map.doneCount} / ${map.totalCount} 个地区`)}
            </p>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100}
            aria-label={tx(lang, '晴らした地域の割合', '已驱散迷雾的地区比例')}>
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-600"
              style={{ width: `${overallPct}%` }} />
          </div>
          {nextRegion && (
            // 地域名は長いことがある（例「会話の開始地点：ヒノデ台（暮らしの会話）」）。
            // 1行に押し込まず、素直に折り返させる
            <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-600">
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              <p className="min-w-0">
                {tx(lang, '次の目的地：', '下一个目的地：')}
                <span className="font-semibold text-gray-800">{tx(lang, nextRegion.nameJa, nextRegion.nameZh)}</span>
                <span className="text-gray-500">（{tx(lang, nextRegion.abilityJa, nextRegion.abilityZh)}）</span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── 2. だから今日は何をするのか（この画面のPrimary CTA・地図より上） ── */}
      <section className="mt-3 rounded-2xl border-2 border-blue-500 bg-blue-50/70 p-4"
        aria-label={tx(lang, '今日の一歩', '今天的一步')}>
        <div className="flex items-center gap-2">
          <TeacherAvatar size={32} lang={lang} labeled={false} className="shrink-0 ring-2 ring-white" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">{tx(lang, '今日の一歩', '今天的一步')}</p>
            <p className="text-xs text-gray-700">
              {quest
                ? tx(lang, `${quest.steps.length}つ・約${quest.estimatedMinutes}分`, `${quest.steps.length}项・约${quest.estimatedMinutes}分钟`)
                : tx(lang, '今日の分を用意しています', '正在准备今天的内容')}
            </p>
          </div>
        </div>
        {(nextStepTitleJa || nextStepTitleZh) && (
          <p className="mt-2 text-sm text-gray-800">
            {tx(lang, `次にやること：「${nextStepTitleJa ?? ''}」`, `接下来要做：「${nextStepTitleZh ?? ''}」`)}
          </p>
        )}
        <button type="button" onClick={onStartToday}
          className="mt-3 w-full min-h-[52px] rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white shadow-sm">
          {tx(lang, '今日の冒険を始める', '开始今天的冒险')}
        </button>
      </section>

      {/* ── ルート切り替え（1つしか選べないときは出さない） ── */}
      {kinds.length > 1 && (
        <div className="mt-4">
          <div className="flex gap-2" role="tablist" aria-label={tx(lang, 'ルート', '路线')}>
            {kinds.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={routeKind === k}
                onClick={() => { setRouteKind(k); setOpenId(null); }}
                className={`min-h-[44px] flex-1 rounded-xl border px-2 text-sm font-semibold ${
                  routeKind === k ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}>
                {tx(lang, ROUTE_KIND_LABEL[k].ja, ROUTE_KIND_LABEL[k].zh)}
              </button>
            ))}
          </div>
          {/* タブ名だけでは何が違うか分からないので、必ず一言添える */}
          <p className="mt-1.5 text-xs text-gray-600">
            {tx(lang, ROUTE_KIND_HINT[routeKind].ja, ROUTE_KIND_HINT[routeKind].zh)}
          </p>
        </div>
      )}

      {/* ── 3. 冒険の道 ── */}
      {asList ? (
        <ul className="mt-4 space-y-2">
          {map.regions.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)}
                aria-label={regionAria(r)} aria-expanded={openId === r.id}
                className={`flex w-full min-h-[56px] items-center gap-3 rounded-xl border px-3 py-2 text-left ${
                  r.state === 'current' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                <LandmarkIcon kind={r.landmark} size={32} muted={r.state === 'locked'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{tx(lang, r.nameJa, r.nameZh)}</span>
                  <span className="block text-xs text-gray-600">{tx(lang, r.abilityJa, r.abilityZh)}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-gray-500">
                  {tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}
                </span>
              </button>
              {openId === r.id && <RegionDetail r={r} />}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-sky-50 via-white to-emerald-50 p-3">
          {/* 凡例。色だけで状態を伝えないための言葉での説明 */}
          <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
            <li className="flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" aria-hidden />{tx(lang, '攻略済み', '已攻略')}</li>
            <li className="flex items-center gap-1"><Flag className="h-3 w-3 text-blue-600" aria-hidden />{tx(lang, '現在地', '当前位置')}</li>
            <li className="flex items-center gap-1"><ChevronRight className="h-3 w-3 text-amber-500" aria-hidden />{tx(lang, '次の目的地', '下一个目的地')}</li>
            <li className="flex items-center gap-1"><Lock className="h-3 w-3 text-gray-400" aria-hidden />{tx(lang, '霧の中（未解放）', '迷雾中（未开启）')}</li>
          </ul>

          <ol className="relative">
            {map.regions.map((r, i) => {
              const prev = map.regions[i - 1];
              const newChapter = !prev || prev.chapterJa !== r.chapterJa;
              const isCurrent = r.state === 'current';
              const isLast = i === map.regions.length - 1;
              // 攻略済みの区間は実線で明るく、これからの区間は点線
              const railDone = r.state === 'done';
              // 章の見出しが挟まる行は、その高さぶんだけ道の始点が下がる
              const chapterOffset = newChapter ? 30 : 0;
              return (
                <li key={r.id} ref={isCurrent ? currentRef : undefined} className="relative">
                  {/*
                    冒険の道。**<li>全体を貫く**ように引く。
                    行の中だけに引くと、地域カードを開いたときに道が途切れて見える
                  */}
                  <span aria-hidden
                    className={`absolute left-[38px] -translate-x-1/2 border-l-4 ${
                      railDone ? 'border-emerald-400' : isCurrent ? 'border-blue-400 border-dashed' : 'border-gray-300 border-dashed'
                    }`}
                    style={{ top: chapterOffset, height: isLast ? 44 : `calc(100% - ${chapterOffset}px)` }} />
                  {newChapter && (
                    <p className={`relative z-10 -mx-1 mb-1 rounded-lg bg-gray-900/85 px-3 py-1 text-[11px] font-bold text-white ${i === 0 ? '' : 'mt-3'}`}>
                      {tx(lang, r.chapterJa, r.chapterZh)}
                    </p>
                  )}
                  <div className="flex gap-3">
                    {/* 地域のイラスト（道の上に立つ） */}
                    <div className="relative w-[76px] shrink-0">
                      <button type="button"
                        onClick={() => setOpenId(openId === r.id ? null : r.id)}
                        aria-label={regionAria(r)} aria-expanded={openId === r.id}
                        aria-current={isCurrent ? 'step' : undefined}
                        className="relative z-10 block w-full rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">
                        {/* 現在地の脈動。**枠の外側**に置く（overflow-hiddenの内側だと切れる） */}
                        {isCurrent && (
                          <span className="pointer-events-none absolute -inset-1 rounded-2xl border-2 border-blue-400 motion-safe:animate-ping" aria-hidden />
                        )}
                        <span className={`relative block overflow-hidden rounded-2xl bg-white ${STATE_STYLE[r.state].ring} ${
                          isCurrent ? 'shadow-lg' : ''}`}>
                          <LandmarkScene kind={r.landmark} tone={r.tone} fogged={r.state === 'locked'}
                            className={`block w-full ${isCurrent ? 'h-[76px]' : 'h-[62px]'}`} />
                          {/* 状態を記号でも示す（色だけに依存しない） */}
                          {r.state === 'done' && (
                            <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden>
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </span>
                          )}
                          {r.state === 'locked' && (
                            <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-gray-500" aria-hidden>
                              <Lock className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </button>
                      {/* 現在地には学習者と先生を立たせる */}
                      {isCurrent && (
                        <div className="mt-1 flex items-center justify-center gap-1" aria-hidden>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-white">
                            {tx(lang, '私', '我')}
                          </span>
                          <TeacherAvatar size={24} lang={lang} labeled={false} className="ring-2 ring-white" />
                        </div>
                      )}
                    </div>

                    {/* 地域の見出し（押すと詳細が開く） */}
                    <div className="min-w-0 flex-1 pb-3 pt-1">
                      <button type="button" onClick={() => setOpenId(openId === r.id ? null : r.id)}
                        aria-label={regionAria(r)} aria-expanded={openId === r.id}
                        className="w-full text-left">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${STATE_STYLE[r.state].chip}`}>
                          {tx(lang, STATE_LABEL[r.state].ja, STATE_LABEL[r.state].zh)}
                        </span>
                        <span className={`mt-0.5 block text-sm font-bold leading-tight ${
                          r.state === 'locked' ? 'text-gray-500' : 'text-gray-900'}`}>
                          {tx(lang, r.nameJa, r.nameZh)}
                        </span>
                        <span className="block text-xs leading-tight text-gray-600">
                          {tx(lang, r.abilityJa, r.abilityZh)}
                        </span>
                      </button>
                    </div>
                  </div>
                  {/*
                    詳細は**行の外・画面幅いっぱい**に出す。
                    細い右カラムの中に入れると、スマホで文章もボタンも潰れる
                  */}
                  {openRegion?.id === r.id && (
                    <div className="relative z-10 pb-3">
                      <RegionDetail r={r} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ── 特別な場所（ルートの進行とは独立。N2受験者だけに見える） ── */}
      {sheetsVisible && (
        <section className="mt-4" aria-label={tx(lang, '特別な場所', '特别的地方')}>
          <p className="mb-1.5 text-xs font-bold text-gray-500">
            {tx(lang, '特別な場所', '特别的地方')}
          </p>
          <button type="button" onClick={onOpenSheets}
            className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300">
            <div className="relative h-20 w-full">
              <LandmarkScene kind="gate" tone="night" className="h-full w-full" />
              <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-gray-800">
                {tx(lang, 'N2受験者だけの場所', '仅N2考生可见')}
              </span>
            </div>
            <div className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900">
                  {tx(lang, '過去問の試験場', '真题考场')}
                </span>
                <span className="block text-xs leading-snug text-gray-600">
                  {tx(lang,
                    sheetCount > 0
                      ? `先生から届いた問題を、時間を測って解く（答案用紙 ${sheetCount}枚）`
                      : '先生からWeChatで問題が届いたら、ここで時間を測って解く',
                    sheetCount > 0
                      ? `计时作答老师发来的题目（答题卡 ${sheetCount}张）`
                      : '收到老师微信发来的题目后，在这里计时作答')}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
            </div>
          </button>
        </section>
      )}
    </div>
  );
};
