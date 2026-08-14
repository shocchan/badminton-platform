// 旅の相棒（§8・D-010）。正式キャラ3体（CEO決定 2026-08-14）:
//   ナツ（猫）… よく見て、そっと寄りそう。やさしく寄り添いながら学びを支える
//   ハル（鳥）… ひらめきとことばを運ぶ。ことばの発見・表現を軽やかに後押しする
//   アキ（犬）… 元気いっぱいの応援団長。実践や挑戦に向かう一歩を応援する
// 教材・出題・採点は分岐させない: 相棒で変わるのは**応援のしかた**だけ
// （Home声掛け・復習の知らせ・バトルの励まし/褒め・完了労い・週まとめコメント）。
// 画像アセットは public/images/ai-course/companions/<id>.webp（未配置の間はモノグラムSVGで表示）。
import type { AdvCompanionDef, AdvCompanionId } from './advTypes';

export const COMPANIONS: AdvCompanionDef[] = [
  {
    id: 'natsu',
    nameJa: 'ナツ', nameZh: 'ナツ（小猫）',
    roleJa: 'よく見て、そっと寄りそう猫の相棒。気づきをやさしく届ける',
    roleZh: '安静观察、温柔陪伴的小猫搭档，会轻轻告诉你它发现的小提示',
    emphasis: { conversation: 0.25, knowledge: 0.5, practical: 0.25 },
    greetJa: 'ふむふむ、今日も少しずついこう', greetZh: '呼噜呼噜，今天也一点一点来吧',
    doneJa: '今日もいい一日をつくったね。ゆっくり休もう', doneZh: '今天也过得很充实呢，好好休息吧',
    cheerWinJa: 'よく見て解けたね。えらい', cheerWinZh: '观察得很仔细，答得漂亮',
    cheerWrongJa: 'だいじょうぶ。解説をいっしょに読も', cheerWrongZh: '没关系，我们一起看看解说吧',
    streakJa: 'すごい集中力。この調子', streakZh: '好棒的专注力，就这样继续',
    reviewNudgeJa: 'きのうのことば、もう一度見てみない？', reviewNudgeZh: '昨天的词语，要不要再看一眼？',
    weeklyJa: '今週のがんばり、ちゃんと見てたよ', weeklyZh: '这一周的努力，我都看在眼里哦',
  },
  {
    id: 'haru',
    nameJa: 'ハル', nameZh: 'ハル（小鸟）',
    roleJa: 'ひらめきとことばを運ぶ、そよ風の相棒。新しい表現の発見を後押しする',
    roleZh: '带来灵感和词语的微风小鸟搭档，助你轻快地发现新表达',
    emphasis: { conversation: 0.5, knowledge: 0.25, practical: 0.25 },
    greetJa: 'ふわりと、今日のことばを見つけよう！', greetZh: '轻轻地，去发现今天的新词语吧！',
    doneJa: '今日も新しい発見があったね！', doneZh: '今天也有新发现呢！',
    cheerWinJa: 'ふわりと勝利！ことばが増えたね', cheerWinZh: '轻轻松松获胜！词语又变多了',
    cheerWrongJa: 'まちがいは発見のタネだよ', cheerWrongZh: '错误是发现的种子哦',
    streakJa: 'ひらめきが続いてる！いいね！', streakZh: '灵感不断！太棒了！',
    reviewNudgeJa: '復習にも新しい発見があるよ', reviewNudgeZh: '复习里也藏着新发现哦',
    weeklyJa: '今週も新しいことば、たくさん見つけたね', weeklyZh: '这周也发现了好多新词语呢',
  },
  {
    id: 'aki',
    nameJa: 'アキ', nameZh: 'アキ（小狗）',
    roleJa: '元気いっぱいの応援団長。実践や挑戦への一歩を応援する',
    roleZh: '活力满满的应援团长小狗，为你迈出实践与挑战的每一步加油',
    emphasis: { conversation: 0.3, knowledge: 0.2, practical: 0.5 },
    greetJa: 'いっしょに、がんばろっ！', greetZh: '一起加油吧！',
    doneJa: 'きみのがんばり、ちゃんと見てたよ！えらい！', doneZh: '你的努力我都看到了！真棒！',
    cheerWinJa: '勝ったー！いっしょに喜ぼ！', cheerWinZh: '赢啦！一起庆祝吧！',
    cheerWrongJa: 'つぎ行こ！ぼくがついてるよ', cheerWrongZh: '继续下一题！有我在呢',
    streakJa: '連続正解！ノリノリだね！', streakZh: '连续答对！状态超好！',
    reviewNudgeJa: '復習から始めるのもかっこいいよ！', reviewNudgeZh: '从复习开始也很帅气哦！',
    weeklyJa: '今週もがんばったね！ハイタッチ！', weeklyZh: '这周也很努力！击个掌！',
  },
];

export const companionById = (id: AdvCompanionId | null | undefined): AdvCompanionDef =>
  COMPANIONS.find((c) => c.id === id) ?? COMPANIONS[0]; // 既定はナツ（もっとも中立な寄り添い型）

/** 旧キャラID（〜2026-08-14）→ 正式キャラへの対応。役割の近さで引き継ぐ */
export const migrateCompanionId = (raw: string | null | undefined): AdvCompanionId | null => {
  if (raw === 'natsu' || raw === 'haru' || raw === 'aki') return raw;
  if (raw === 'fukuro') return 'natsu'; // 知識型→観察・整理のナツ
  if (raw === 'nami') return 'haru';    // 会話型→ことば・表現のハル
  if (raw === 'kaji') return 'aki';     // 実践型→挑戦応援のアキ
  return null;
};

/** キャラ画像（正式アセット）。無い間は CompanionAvatar がモノグラムへfallbackする */
export const companionImageSrc = (id: AdvCompanionId): string =>
  `/images/ai-course/companions/${id}.webp`;

/**
 * モノグラムSVG（画像読込失敗・未配置時のfallback）。
 * カードのキーカラーに合わせる: ナツ=茶（猫）／ハル=緑（鳥）／アキ=橙（犬）
 */
export const companionSvg = (id: AdvCompanionId): string => {
  const theme = {
    natsu: { bg: '#d9c7a7', ink: '#7c5f3b', kana: 'ナ' },
    haru: { bg: '#c8e6a0', ink: '#4d7c0f', kana: 'ハ' },
    aki: { bg: '#fcd9a8', ink: '#c2660a', kana: 'ア' },
  }[id];
  return `<svg viewBox="0 0 64 64" role="img" aria-label="${companionById(id).nameJa}" xmlns="http://www.w3.org/2000/svg">`
    + `<circle cx="32" cy="32" r="28" fill="${theme.bg}"/>`
    + `<text x="32" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="700" fill="${theme.ink}">${theme.kana}</text>`
    + '</svg>';
};
