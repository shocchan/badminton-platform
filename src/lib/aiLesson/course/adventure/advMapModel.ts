// 冒険マップのデータ組み立て（PRODUCT_CANON §5・原則11/12）。
//
// 原則:
// - **RPGは学習構造を分かりやすくする手段**。地図を豪華にして今日の行動を隠さない
// - **矛盾する「現在地」を2つ出さない**。ルートを切り替えても現在地は必ず1つ
// - 世界観の名前だけにしない。地域名の横に必ず「何の力を鍛えるか」を出す（原則12）
// - 旧コースの12週会話マップは、ここの**会話レイヤー**へ統合する（別の進捗モデルを併存させない）
// - **どの地域を選んでも次の行動が1つ決まる**（原則15・行き止まりを作らない）。
//   そのため各地域は `action` を必ず持ち、UI はそれをボタンにするだけでよい
import type { AdvRoute, AdventureV2Profile, JlptLevel, AdvMasteryLedger } from './advTypes';
import { PLACE_NAME as JOURNEY_PLACES } from '../courseJourney';
import { computeMastery, masteryProgressPct } from './advMastery';

/** 表示するルート。Hybridは総合（試験＋会話が合流する） */
export type MapRouteKind = 'combined' | 'exam' | 'conversation';

/** 地域の見た目。外部IP・既存ゲーム素材は使わず、すべて自作SVGで描く */
export type LandmarkKind =
  | 'camp' | 'bridge' | 'ruins' | 'gate' | 'tower' | 'library' | 'castle'
  | 'village' | 'road' | 'hill' | 'avenue' | 'town' | 'plaza' | 'mountain'
  | 'crossroad' | 'forest' | 'city';

/**
 * 地域の色調。**場所ごとに空と地面の色を変える**ための鍵。
 * 形だけを変えても小さく描くと「どこも同じ」に見えるため、時間帯・気候で差をつける。
 */
export type MapTone = 'dawn' | 'meadow' | 'forest' | 'water' | 'stone' | 'sunset' | 'sky' | 'night';

export type RegionState = 'done' | 'current' | 'next' | 'locked';

/**
 * 地域を選んだときに提示する「次の行動」。
 * UI側で分岐を増やさないよう、**行き先の種類はここで決める**。
 * `today` はいつでも成立する安全な既定（今日の冒険へ戻って次のstepを実行する）。
 */
export type RegionActionKind = 'today' | 'review' | 'conversation' | 'mock';

export interface RegionAction {
  kind: RegionActionKind;
  labelJa: string;
  labelZh: string;
  /** なぜこれをやるのか（ボタンの上に出す一言） */
  reasonJa: string;
  reasonZh: string;
}

export interface MapRegion {
  id: string;
  layer: 'exam' | 'conversation';
  /** 冒険の章。連続する地域をまとめて「いま何編を進めているか」を出す */
  chapterJa: string;
  chapterZh: string;
  nameJa: string;
  nameZh: string;
  /** 何の力を鍛える地域か（世界観の名前だけにしない・原則12） */
  abilityJa: string;
  abilityZh: string;
  /** その地域で何が起きるかの短い説明（1文） */
  blurbJa: string;
  blurbZh: string;
  landmark: LandmarkKind;
  tone: MapTone;
  state: RegionState;
  /** 0-100。locked は null（未計測を0%と見せない・原則13） */
  masteryPct: number | null;
  doneJa: string; doneZh: string;
  nextJa: string; nextZh: string;
  /** 未解放の地域だけ。ここへ入るための条件（空文字なら出さない） */
  unlockJa: string; unlockZh: string;
  /** **必ず1つ**。行き止まりを作らない（原則15） */
  action: RegionAction;
  estMinutes: number;
}

export interface AdventureMap {
  routeKind: MapRouteKind;
  regions: MapRegion[];
  /** 現在地。**常に1つだけ**（見つからなければ null） */
  currentRegionId: string | null;
  /** 次に向かう地域 */
  nextRegionId: string | null;
  destinationJa: string;
  destinationZh: string;
  /** 試験ルートと会話ルートが合流する地点のindex（combinedのときだけ） */
  mergeIndex: number | null;
  doneCount: number;
  totalCount: number;
}

const STAGE_LANDMARK: Record<string, LandmarkKind> = {
  foundation_camp: 'camp',
  n3_bridge: 'bridge',
  n3_practice: 'village',
  n3_grammar: 'ruins',
  n2_gate: 'gate',
  n2_grammar: 'tower',
  reading_listening: 'library',
  mock_boss: 'castle',
  conversation_start: 'plaza',
  conversation_growth: 'city',
};

/** 試験レイヤーの色調。基礎→朝、N3→昼、N2→夕、模試→夜。進むほど空が変わる */
const STAGE_TONE: Record<string, MapTone> = {
  foundation_camp: 'dawn',
  n3_bridge: 'water',
  n3_practice: 'meadow',
  n3_grammar: 'stone',
  n2_gate: 'sunset',
  n2_grammar: 'sky',
  reading_listening: 'forest',
  mock_boss: 'night',
  conversation_start: 'meadow',
  conversation_growth: 'sunset',
};

/**
 * 色調の並び。隣り合う地域が同じ色調になったとき、次の候補へずらすのに使う。
 * ルートの組み合わせは診断結果で変わるので、対応表を手で書くだけでは重複を防げない。
 */
const TONE_CYCLE: MapTone[] = ['dawn', 'meadow', 'forest', 'water', 'stone', 'sunset', 'sky', 'night'];

/** 隣り合う地域の色調をずらす。並べたときに「どこも同じ」に見せないための処理 */
const spreadTones = (regions: MapRegion[]): MapRegion[] => {
  let prev: MapTone | null = null;
  return regions.map((r) => {
    let tone = r.tone;
    if (tone === prev) {
      const i = TONE_CYCLE.indexOf(r.tone);
      for (let k = 1; k <= TONE_CYCLE.length; k += 1) {
        const cand = TONE_CYCLE[(i + k) % TONE_CYCLE.length];
        if (cand !== prev) { tone = cand; break; }
      }
    }
    prev = tone;
    return tone === r.tone ? r : { ...r, tone };
  });
};

/** 試験レイヤーの章。地域を1つずつ見るのではなく「いま何編か」を掴ませる */
const STAGE_CHAPTER: Record<string, { ja: string; zh: string }> = {
  foundation_camp: { ja: '第1章　土台をつくる', zh: '第1章　打好基础' },
  n3_bridge: { ja: '第2章　N3を渡る', zh: '第2章　跨越N3' },
  n3_practice: { ja: '第2章　N3を渡る', zh: '第2章　跨越N3' },
  n3_grammar: { ja: '第2章　N3を渡る', zh: '第2章　跨越N3' },
  n2_gate: { ja: '第3章　N2へ挑む', zh: '第3章　挑战N2' },
  n2_grammar: { ja: '第3章　N2へ挑む', zh: '第3章　挑战N2' },
  reading_listening: { ja: '第3章　N2へ挑む', zh: '第3章　挑战N2' },
  mock_boss: { ja: '最終章　本番へ', zh: '最终章　迎接考试' },
  // 試験ルートに編み込まれる会話stage。会話レイヤー12地域の章名（会話の旅N）と
  // 見分けがつくよう「番外編」にする（似た章名が2つ並ぶと、どちらの話か分からなくなる）
  conversation_start: { ja: '番外編　いま話せる場面から', zh: '番外篇　从现在能说的场景开始' },
  conversation_growth: { ja: '番外編　実戦で伸ばす', zh: '番外篇　实战提升' },
};

const STAGE_ABILITY: Record<string, { ja: string; zh: string }> = {
  foundation_camp: { ja: '基礎の語彙と文字', zh: '基础词汇与文字' },
  n3_bridge: { ja: 'N3の語彙・文法', zh: 'N3词汇与语法' },
  n3_practice: { ja: 'N3の実践', zh: 'N3实践' },
  n3_grammar: { ja: 'N3文法', zh: 'N3语法' },
  n2_gate: { ja: 'N3の総仕上げ', zh: 'N3总复习' },
  n2_grammar: { ja: 'N2語彙・文法', zh: 'N2词汇与语法' },
  reading_listening: { ja: '読解と聴解', zh: '阅读与听力' },
  mock_boss: { ja: '時間配分と総合力', zh: '时间分配与综合能力' },
  conversation_start: { ja: 'いま話せる場面を増やす', zh: '增加现在能开口的场景' },
  conversation_growth: { ja: '理由説明・言い直し・聞き返し', zh: '说明理由・改口・听不懂再问' },
};

/**
 * 会話レイヤーの地域（旧コースの12週マップをここへ統合）。
 * 地名の正準は `courseJourney.PLACE_NAME`（12件）。ここは**同じ数だけ**持つ。
 */
const CONVERSATION_LANDMARK: LandmarkKind[] = [
  'village', 'road', 'hill', 'avenue', 'town', 'plaza',
  'mountain', 'crossroad', 'forest', 'city', 'bridge', 'castle',
];
/** 隣り合う地域が同じ色調にならないように並べる */
const CONVERSATION_TONE: MapTone[] = [
  'dawn', 'sunset', 'meadow', 'forest', 'stone', 'water',
  'sky', 'meadow', 'forest', 'stone', 'water', 'night',
];
const CONVERSATION_ABILITY: { ja: string; zh: string }[] = [
  { ja: '自己紹介と今の生活', zh: '自我介绍与当前生活' },
  { ja: '過去の経験を話す', zh: '讲述过去的经历' },
  { ja: '変化と成長を話す', zh: '讲述变化与成长' },
  { ja: '習慣と継続を話す', zh: '讲述习惯与坚持' },
  { ja: '許可と依頼', zh: '许可与请求' },
  { ja: '困りごとの相談', zh: '咨询困扰' },
  { ja: '意見と理由', zh: '意见与理由' },
  { ja: '選択と比較', zh: '选择与比较' },
  { ja: '推測とぼかし表現', zh: '推测与委婉表达' },
  { ja: '仕事と暮らしの会話', zh: '工作与生活的会话' },
  { ja: '人とつながる会話', zh: '与人建立联系的会话' },
  { ja: '話題をまたぐ総合会話', zh: '跨话题的综合会话' },
];
/** その地域で「実際に何ができるようになるか」。能力名だけだと場面が想像できない */
const CONVERSATION_BLURB: { ja: string; zh: string }[] = [
  { ja: '名前・仕事・住まいを、詰まらずに一続きで話せるようにする', zh: '让你能连贯地说出名字、工作和居住情况' },
  { ja: '「前はこうだった」を過去形で語れるようにする', zh: '让你能用过去式讲述"以前是这样的"' },
  { ja: '「〜ようになった」で自分の変化を伝えられるようにする', zh: '让你能用"变得会…"表达自己的变化' },
  { ja: '続けていること・やめたことを説明できるようにする', zh: '让你能说明一直坚持的事和放弃的事' },
  { ja: '相手に負担をかけずに頼む言い方を身につける', zh: '掌握不给对方压力的请求说法' },
  { ja: '困っていることを整理して相談できるようにする', zh: '让你能条理清楚地说出困扰并求助' },
  { ja: '意見に理由を付けて言い切れるようにする', zh: '让你能给出理由并明确表达意见' },
  { ja: '2つを比べて、選んだ理由を言えるようにする', zh: '让你能比较两者并说出选择的理由' },
  { ja: '断定を避けたいときの言い方を使い分ける', zh: '学会在不想断言时的委婉说法' },
  { ja: '職場と生活の場面で必要なやりとりをこなす', zh: '应对职场与生活场景中必要的交流' },
  { ja: '相手の話を受けて会話を続けられるようにする', zh: '让你能承接对方的话并把会话延续下去' },
  { ja: '話題が変わっても崩れない会話力にする', zh: '让你的会话在话题变化时也不会崩溃' },
];
/** 会話レイヤーの章。4地域ずつ区切る */
const conversationChapter = (i: number): { ja: string; zh: string } => {
  if (i < 4) return { ja: '会話の旅1　話しはじめる', zh: '会话之旅1　开口说话' };
  if (i < 8) return { ja: '会話の旅2　伝える・頼む', zh: '会话之旅2　表达与请求' };
  return { ja: '会話の旅3　考えを語る', zh: '会话之旅3　讲述想法' };
};

/**
 * 攻略済みの地域に出す共通の行動。
 *
 * 行き先は「間違えた問題ノートの解き直し」で、**この地域だけの問題が出るわけではない**
 * （2026-08-18 監査P1: 以前は「復習で維持する／一度攻略した内容は…残ります」と書きながら
 * 旧コースのことばの3分復習を開いており、V2では1問も出なかった）。
 * 出るものだけを書く: 地域名も「この内容を維持できる」も約束しない。
 */
const REVIEW_ACTION: RegionAction = {
  kind: 'review',
  labelJa: '間違えた問題を解き直す', labelZh: '重做做错的题',
  reasonJa: 'この地域は攻略済みです。いまは間違えた問題を解き直して、あやふやなところを減らせます',
  reasonZh: '这个地区已经攻略完成。现在可以重做做错的题，减少还不牢的地方',
};

const todayAction = (reasonJa: string, reasonZh: string, labelJa = '今日の冒険を始める', labelZh = '开始今天的冒险'): RegionAction => ({
  kind: 'today', labelJa, labelZh, reasonJa, reasonZh,
});

/** 試験レイヤーの地域を作る */
const examRegions = (
  route: AdvRoute,
  mastered: Set<string>,
  dailyMinutes: number,
  ledger: AdvMasteryLedger,
  nowISO: string,
): MapRegion[] => route.stages
  // 会話stageは試験レイヤーに出さない（出題プールが無く80%攻略条件を満たせない・
  // 会話は conversationRegions レイヤーが担う。原則13/15）
  .filter((s) => s.kind !== 'conversation_start' && s.kind !== 'conversation_growth')
  .map((s) => {
  const done = mastered.has(s.stageId);
  // 攻略条件そのものではなく「**いま何回足りないか**」を出す（advMasteryの正直な文言を使う）
  const st = computeMastery(ledger[s.stageId], nowISO);
  // 「ここまで」は台帳の実績をそのまま言う。
  // 定着50%と出しているのに「まだ攻略していません」だけだと、数字と言葉が食い違う
  const soFar = done || st.state === 'mastered'
    ? { ja: 'この地域は攻略済みです', zh: '这个地区已经攻略完成' }
    : st.state === 'cleared_pending_delay'
      ? { ja: '別の日に3回クリア。7日後の確認待ちです', zh: '已在不同的日子通过3次。等待7天后的复查' }
      : st.qualifyingDays.length > 0
        ? { ja: `別の日に${st.qualifyingDays.length}回、80%以上を達成しています`, zh: `已在${st.qualifyingDays.length}个不同的日子达到80%以上` }
        : { ja: 'まだ挑戦していません', zh: '还没有挑战过' };
  return {
    id: s.stageId,
    layer: 'exam' as const,
    chapterJa: STAGE_CHAPTER[s.kind]?.ja ?? '攻略ルート',
    chapterZh: STAGE_CHAPTER[s.kind]?.zh ?? '攻略路线',
    nameJa: s.titleJa,
    nameZh: s.titleZh,
    abilityJa: STAGE_ABILITY[s.kind]?.ja ?? s.purposeJa,
    abilityZh: STAGE_ABILITY[s.kind]?.zh ?? s.purposeZh,
    blurbJa: s.purposeJa,
    blurbZh: s.purposeZh,
    landmark: STAGE_LANDMARK[s.kind] ?? 'village',
    tone: STAGE_TONE[s.kind] ?? 'meadow',
    state: (done ? 'done' : 'locked') as RegionState,
    masteryPct: done ? 100 : null,
    doneJa: soFar.ja,
    doneZh: soFar.zh,
    nextJa: done ? '攻略済み。ときどき復習で維持する' : st.nextJa,
    nextZh: done ? '已攻克。偶尔复习保持' : st.nextZh,
    unlockJa: '', unlockZh: '',
    action: done ? REVIEW_ACTION : (s.kind === 'mock_boss'
      ? { kind: 'mock' as const, labelJa: 'ミニ模試を受ける', labelZh: '参加迷你模拟考',
          reasonJa: '本番と同じ形式で、時間配分ごと試す場所です',
          reasonZh: '这里用与正式考试相同的形式，连时间分配一起练' }
      // 攻略条件は上の「次にすること」に出しているので、ここは**なぜ押すのか**を書く
      : todayAction(
        '今日の冒険には、この地域を攻略するための問題が入っています',
        '今天的冒险里，就有攻略这个地区所需要的题目',
      )),
    estMinutes: dailyMinutes,
  };
});

/**
 * 会話レイヤーの地域を作る。
 *
 * **会話は地域ごとの定着率を測っていない。**
 * それらしい数字を出すと「測っている」と誤解させるので、masteryPct は null（未判定）にする（原則13）。
 * 通過したかどうかだけを done で表す。
 */
const conversationRegions = (
  currentWeek: number,
  dailyMinutes: number,
): MapRegion[] => Object.entries(JOURNEY_PLACES).map(([weekStr, name], i) => {
  const week = Number(weekStr);
  const done = week < currentWeek;
  const ch = conversationChapter(i);
  return {
    id: `conv-w${week}`,
    layer: 'conversation' as const,
    chapterJa: ch.ja, chapterZh: ch.zh,
    nameJa: name.ja,
    nameZh: name.zh,
    abilityJa: CONVERSATION_ABILITY[i]?.ja ?? '会話',
    abilityZh: CONVERSATION_ABILITY[i]?.zh ?? '会话',
    blurbJa: CONVERSATION_BLURB[i]?.ja ?? '会話ミッションで実際に使う',
    blurbZh: CONVERSATION_BLURB[i]?.zh ?? '在会话任务中实际使用',
    landmark: CONVERSATION_LANDMARK[i] ?? 'village',
    tone: CONVERSATION_TONE[i] ?? 'meadow',
    state: (done ? 'done' : 'locked') as RegionState,
    masteryPct: null,
    doneJa: done ? 'この地域の会話は一度通りました' : 'まだ会話していません',
    doneZh: done ? '这个地区的会话已经走过一次' : '还没有进行会话',
    nextJa: done ? 'もう一度話して、言い方を安定させる' : '会話ミッションで実際に使う',
    nextZh: done ? '再说一次，让说法更稳定' : '在会话任务中实际使用',
    unlockJa: '', unlockZh: '',
    action: {
      kind: 'conversation' as const,
      labelJa: 'AI会話を始める', labelZh: '开始AI会话',
      reasonJa: '会話は解くのではなく、実際に口に出すと定着します',
      reasonZh: '会话不是做题，实际说出口才能掌握',
    },
    estMinutes: Math.min(dailyMinutes, 10),
  };
});

/**
 * 冒険マップを組み立てる。
 * **現在地は必ず1つ。** 未攻略の先頭を current にし、その次を next にする。
 */
export const buildAdventureMap = (
  prof: AdventureV2Profile,
  route: AdvRoute | null,
  mastered: Set<string>,
  currentWeek: number,
  routeKind: MapRouteKind,
  nowISO: string = new Date().toISOString(),
): AdventureMap => {
  const daily = prof.dailyMinutes ?? 15;
  const ledger = prof.mastery ?? {};
  const exam = route ? examRegions(route, mastered, daily, ledger, nowISO) : [];
  const conv = conversationRegions(currentWeek, daily);

  let built: MapRegion[];
  let mergeIndex: number | null = null;
  if (routeKind === 'exam') built = exam;
  else if (routeKind === 'conversation') built = conv;
  else {
    // 総合: 目的に応じて主レイヤーを先に置き、もう一方を合流させる
    const examFirst = prof.goalType !== 'conversation';
    built = examFirst ? [...exam, ...conv] : [...conv, ...exam];
    mergeIndex = examFirst ? exam.length : conv.length;
    if (mergeIndex === 0 || mergeIndex === built.length) mergeIndex = null;
  }

  // 診断結果で stage の組み合わせが変わるので、並べ終えてから色調の重複をならす
  const regions = spreadTones(built);

  // 現在地＝未攻略の先頭。1つだけに確定させる
  const firstOpen = regions.findIndex((r) => r.state !== 'done');
  const currentName = firstOpen >= 0
    ? { ja: regions[firstOpen].nameJa, zh: regions[firstOpen].nameZh }
    : null;

  const withState = regions.map((r, i) => {
    // 会話レイヤーは並走レーン（総合ルート時）。試験stageの攻略待ちにしない:
    // 会話は今日から使える（10回/日）事実と地図の表示を矛盾させない（原則13・迷子防止）。
    if (routeKind === 'combined' && r.layer === 'conversation' && i !== firstOpen) {
      if (r.state === 'done') return r;
      if (r.id === `conv-w${currentWeek}`) {
        // 今週の会話地域: 霧にせず「AI会話を始める」CTAを保つ（会話タブと同じ扱い）
        return { ...r, state: 'next' as RegionState };
      }
      const wk = Number(r.id.replace('conv-w', ''));
      return {
        ...r,
        unlockJa: `会話の旅は週ごとに進みます。第${wk}週になると開きます`,
        unlockZh: `会话之旅按周推进。到第${wk}周开启`,
        action: todayAction(
          '会話は今週のぶんから順に進みます。今週の会話はAI会話ミッションでできます',
          '会话从本周的部分开始依次推进。本周的会话可以在AI会话任务中进行',
          // 「ここを進める」と誤解させない: このボタンは今日の冒険へ戻るだけ（2026-08-16 CEO指摘）
          '今日の冒険へもどる', '回到今天的冒险',
        ),
      };
    }
    if (i === firstOpen) {
      // 試験レイヤーは mastery台帳の**記録がある場合だけ**実測値を出す
      // （挑戦して届かなかった0%は実測。まだ一度も測っていない0%は未判定＝null・原則13）。
      // **会話レイヤーは測っていないので null のまま**にする
      return {
        ...r,
        state: 'current' as RegionState,
        masteryPct: r.layer === 'exam' && (ledger[r.id]?.length ?? 0) > 0
          ? masteryProgressPct(ledger[r.id], nowISO) : null,
        // 画面上部の主要CTAと**同じ文言のボタンを2つ並べない**。
        // どちらも今日の冒険へ行くが、ここは「この地域を進める」と場所を名指しする
        action: r.action.kind === 'today'
          ? { ...r.action, labelJa: '今日の冒険でここを進める', labelZh: '在今天的冒险中推进这里' }
          : r.action,
      };
    }
    if (i === firstOpen + 1) {
      return {
        ...r,
        state: 'next' as RegionState,
        unlockJa: currentName ? `${currentName.ja}を攻略すると開きます` : '',
        unlockZh: currentName ? `攻略${currentName.zh}后开启` : '',
        // 次の目的地はまだ入れない。**押せる行動は「今日の冒険」に寄せる**（行き止まりにしない）。
        // ボタンは「ここを進められる」と誤解させず、現在地へ戻ることを名指しする（2026-08-16 CEO指摘）
        action: todayAction(
          `いま向かっているのは${currentName?.ja ?? '現在地'}です。今日のぶんを進めると近づきます`,
          `你正前往${currentName?.zh ?? '当前位置'}。完成今天的份量就会更近一步`,
          currentName ? `現在地（${currentName.ja}）を進める` : '今日の冒険へもどる',
          currentName ? `推进当前位置（${currentName.zh}）` : '回到今天的冒险',
        ),
      };
    }
    if (i > firstOpen) {
      return {
        ...r,
        unlockJa: currentName ? `先に${currentName.ja}を攻略します` : '',
        unlockZh: currentName ? `需要先攻略${currentName.zh}` : '',
        action: todayAction(
          // ここ（鍵付き）は今日進める場所ではない。ボタンが現在地へ戻るだけだと明示する（2026-08-16 CEO指摘）
          'ここはまだ霧の中です。いまの攻略地を進めると、道がつながって開きます',
          '这里还在迷雾中。推进当前的攻略地，道路连上后就会开启',
          currentName ? `現在地（${currentName.ja}）にもどる` : '今日の冒険へもどる',
          currentName ? `回到当前位置（${currentName.zh}）` : '回到今天的冒险',
        ),
      };
    }
    return r;
  });

  return {
    routeKind,
    regions: withState,
    currentRegionId: firstOpen >= 0 ? withState[firstOpen].id : null,
    nextRegionId: firstOpen >= 0 && withState[firstOpen + 1] ? withState[firstOpen + 1].id : null,
    destinationJa: route?.destinationLabelJa ?? '会話力の向上',
    destinationZh: route?.destinationLabelZh ?? '提升会话能力',
    mergeIndex,
    doneCount: withState.filter((r) => r.state === 'done').length,
    totalCount: withState.length,
  };
};

/** ルート切り替えの選択肢。目的によって出す組み合わせを変える */
export const availableRouteKinds = (goalType: AdventureV2Profile['goalType']): MapRouteKind[] => {
  if (goalType === 'conversation') return ['conversation'];
  if (goalType === 'jlpt') return ['exam'];
  return ['combined', 'exam', 'conversation'];
};

export const ROUTE_KIND_LABEL: Record<MapRouteKind, { ja: string; zh: string }> = {
  combined: { ja: '総合ルート', zh: '综合路线' },
  exam: { ja: '試験ルート', zh: '考试路线' },
  conversation: { ja: '会話ルート', zh: '会话路线' },
};

/** ルートの違いを一言で（タブ名だけだと何が違うか分からない） */
export const ROUTE_KIND_HINT: Record<MapRouteKind, { ja: string; zh: string }> = {
  combined: { ja: '試験の攻略と会話の練習をひとつながりで見る', zh: '把考试攻略与会话练习连成一条线来看' },
  exam: { ja: '選択式でJLPTの得点力を上げる道', zh: '用选择题提升JLPT得分能力的路线' },
  conversation: { ja: '実際に話して使えるようにする道', zh: '实际开口、把学到的用出来的路线' },
};

/** レイヤーの表示名。総合ルートで「いまどちらの道か」を出すのに使う */
export const LAYER_LABEL: Record<MapRegion['layer'], { ja: string; zh: string }> = {
  exam: { ja: '試験ルート', zh: '考试路线' },
  conversation: { ja: '会話ルート', zh: '会话路线' },
};

/** 目標レベル表示（未設定を決めつけない） */
export const mapLevelLabel = (level: JlptLevel | null): string => level ?? '—';
