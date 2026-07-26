// VisualAssetManifest（Phase 2C+ §15-§16）。画像は差し替え可能・未生成はplanned＋filePath:null。
// ファイルはpublic/images/ai-course/foundation/ 配下（bundleへ埋め込まない・§28）。
// 実ファイルが存在しないassetを完成画像として扱わない（§14）。
import type { VisualAsset } from './visualAssetTypes';

const IMG = '/images/ai-course/foundation';
/** AI生成場面イラスト（planned→生成後にfilePath等を更新・§16） */
const planned = (id: string, targetId: string, altJa: string, altZh: string, prompt: string): VisualAsset => ({
  id, assetType: 'scene_illustration', learningTargetType: 'item', learningTargetId: targetId,
  filePath: null, thumbnailPath: null, width: null, height: null,
  altJa, altZh, generationPrompt: prompt, sourceKind: 'ai_generated',
  reviewStatus: 'planned', copyrightStatus: 'ai_generated_internal',
});
const plannedContrast = (id: string, targetId: string, altJa: string, altZh: string, prompt: string): VisualAsset =>
  ({ ...planned(id, targetId, altJa, altZh, prompt), assetType: 'contrast_illustration' });
const plannedScene = (id: string, targetId: string, altJa: string, altZh: string, prompt: string): VisualAsset =>
  ({ ...planned(id, targetId, altJa, altZh, prompt), learningTargetType: 'scene' });

const STYLE = '成人向け日本語教材用の柔らかいフラットイラスト。清潔感のある構図・落ち着いた配色・明確な輪郭・余白が多い・背景は簡潔・画像内に文字やロゴを入れない・人物の国籍を固定しない多様な成人・4:3。';

export const VISUAL_ASSETS: VisualAsset[] = [
  // ── 第1バッチ: 基本動詞（§69） ──
  planned('va-verb-iku-scene', 'fi-iku', '目的地へ向かって歩いて移動している場面', '朝着目的地走去的场景', `${STYLE} 成人の人物が少し離れた駅の入口へ向かって歩いている。進行方向が明確で、目的地にまだ到着していない。こちらへ来る構図・帰宅に見える構図は避ける。`),
  planned('va-verb-kuru-scene', 'fi-kuru', '奥からこちらへ歩み寄る人物の場面', '朝这边走来的场景', `${STYLE} 画面手前で成人が待っていて、別の成人が奥から手前へ歩いて近づいてくる。近づく方向が明確。「行く」と同じ構図にしない。`),
  planned('va-verb-kaeru-scene', 'fi-kaeru', '夕方、自宅へ戻る場面', '回家的场景', `${STYLE} 夕方、成人がかばんを持って自宅の玄関へ向かっている。家に帰る安心感が伝わる。出勤に見える構図は避ける。`),
  planned('va-verb-sumu-scene', 'fi-sumu', 'その場所で継続して生活している場面', '在住处持续生活的场景', `${STYLE} 成人が自宅の部屋でくつろいで日常生活をしている。生活用品が少し見え、ホテル滞在や訪問には見えない。`),
  planned('va-verb-hataraku-scene', 'fi-hataraku', '職場で働いている場面', '在公司工作的场景', `${STYLE} 成人がオフィスのデスクで仕事をしている。画面の主役は働く動作。背景の同僚はシルエット程度。`),
  planned('va-verb-benkyo-scene', 'fi-benkyo', '机で勉強している場面', '在书桌前学习的场景', `${STYLE} 成人がノートと本を開いて勉強している。集中している様子。文字は読めない抽象表現。`),
  planned('va-verb-taberu-scene', 'fi-taberu', '食事をしている場面', '吃饭的场景', `${STYLE} 成人がテーブルで食事をしている。箸やスプーンで食べる動作が明確。`),
  planned('va-verb-nomu-scene', 'fi-nomu', '飲み物を飲んでいる場面', '喝饮料的场景', `${STYLE} 成人がコップの水やお茶を飲んでいる。飲む動作が明確。食べる場面と混同しない。`),
  // ── 第2バッチ: 日常動作 ──
  planned('va-verb-miru-scene', 'fi-miru', '何かを見ている場面', '看东西的场景', `${STYLE} 成人が壁のポスターや画面を見ている。視線の先が明確。読む動作とは区別する。`),
  planned('va-verb-kiku-scene', 'fi-kiku', '音楽や話を聞いている場面', '听音乐或听人说话的场景', `${STYLE} 成人がヘッドホンで音楽を聞いている。聞く動作が主役。`),
  planned('va-verb-hanasu-scene', 'fi-hanasu', '人と話している場面', '与人交谈的场景', `${STYLE} 二人の成人が向かい合って会話している。吹き出しは空白の図形のみで文字なし。`),
  planned('va-verb-yomu-scene', 'fi-yomu', '本を読んでいる場面', '读书的场景', `${STYLE} 成人が本を開いて読んでいる。本の文字は読めない抽象表現。`),
  planned('va-verb-kaku-scene', 'fi-kaku', '書類やノートに書いている場面', '写字的场景', `${STYLE} 成人がペンでノートに書いている。書く動作の手元が主役。文字は抽象的な線。`),
  planned('va-verb-kau-scene', 'fi-kau', '店で買い物をしている場面', '在商店买东西的场景', `${STYLE} 成人が店のレジで商品を買っている。支払いの場面が分かる。`),
  planned('va-verb-tsukau-scene', 'fi-tsukau', '道具を使っている場面', '使用工具的场景', `${STYLE} 成人がスマートフォンを操作して使っている。使う対象が明確。`),
  planned('va-verb-tsukuru-scene', 'fi-tsukuru', '料理を作っている場面', '做饭的场景', `${STYLE} 成人がキッチンで料理を作っている。作る動作が主役。`),
  // ── 第3バッチ: 生活・移動 ──
  planned('va-verb-au-scene', 'fi-au', '友達と会っている場面', '和朋友见面的场景', `${STYLE} 二人の成人が待ち合わせ場所で会って挨拶している。再会の瞬間が分かる。`),
  planned('va-verb-okiru-scene', 'fi-okiru', '朝、ベッドから起き上がる場面', '早晨起床的场景', `${STYLE} 朝、成人がベッドから起き上がっている。窓から朝の光。寝る場面と混同しない。`),
  planned('va-verb-neru-scene', 'fi-neru', '夜、ベッドで眠っている場面', '晚上睡觉的场景', `${STYLE} 夜、成人がベッドで眠っている。落ち着いた夜の雰囲気。`),
  planned('va-verb-noru-scene', 'fi-noru', '電車に乗り込む場面', '上电车的场景', `${STYLE} 成人が開いたドアから電車に乗り込んでいる。乗る方向が明確。降りる場面と混同しない。`),
  planned('va-verb-oriru-scene', 'fi-oriru', '電車からホームに降り立つ場面', '下电车的场景', `${STYLE} 成人が電車のドアからホームへ降りている。降りる方向が明確。「乗る」と反対の構図。`),
  planned('va-verb-hairu-scene', 'fi-hairu', '店の入口から中へ進む場面', '进店的场景', `${STYLE} 成人が店の入口ドアを開けて中へ入っている。入る方向が明確。`),
  planned('va-verb-deru-scene', 'fi-deru', '玄関から外へ向かう場面', '出门的场景', `${STYLE} 成人が玄関から外へ出ている。出る方向が明確。「入る」と反対の構図。`),
  // ── 第4バッチ: 形容詞対比（§9） ──
  plannedContrast('va-adj-ookii-chiisai-contrast', 'fi-ookii', '大きいかばんと小さいかばんの比較', '大包和小包的对比', `${STYLE} 左に大きいかばん、右に小さいかばんを並べた対比図。大きさの差が一目で分かる。`),
  plannedContrast('va-adj-takai-yasui-contrast', 'fi-takai', '高い値札と安い値札の商品比較', '贵和便宜的商品对比', `${STYLE} 左に高そうな商品と大きい値札、右に安い商品と小さい値札。金額の数字は抽象的な記号で表現し読める文字は入れない。`),
  plannedContrast('va-adj-atsui-samui-contrast', 'fi-atsui', '暑い夏と寒い冬の比較', '炎热夏天和寒冷冬天的对比', `${STYLE} 左に太陽と汗をかく成人（夏服）、右に雪と震える成人（冬服）の対比。`),
  plannedContrast('va-adj-chikai-tooi-contrast', 'fi-chikai', '近い距離と遠い距離の比較', '近和远的对比', `${STYLE} 同じ人物と建物の距離が、左は近く右は遠い対比図。距離差が明確。`),
  plannedContrast('va-adj-atarashii-furui-contrast', 'fi-atarashii', '新しい建物と古い建物の比較', '新房子和旧房子的对比', `${STYLE} 左にきれいな新しい建物、右に年月を感じる古い建物。`),
  plannedContrast('va-adj-ooi-sukunai-contrast', 'fi-ooi', '多い人数と少ない人数の比較', '人多和人少的对比', `${STYLE} 左に人が多い場所、右に人が少ない場所の対比。人物は簡潔なシルエット。`),
  // ── 第5バッチ: 生活場面 ──
  plannedScene('va-scene-shopping', 'shopping', 'スーパーで買い物をする場面', '在超市购物的场景', `${STYLE} 成人がスーパーで買い物かごを持って商品を選んでいる。`),
  plannedScene('va-scene-station', 'fi-eki', '駅の改札前の場面', '车站检票口的场景', `${STYLE} 駅の改札前を成人が歩いている。駅と分かる構図だが案内表示の文字は抽象化。`),
  plannedScene('va-scene-hospital', 'fi-byouin', '病院の受付の場面', '医院前台的场景', `${STYLE} 成人が病院の受付で話している。清潔で落ち着いた医療機関の雰囲気。`),
  plannedScene('va-scene-restaurant', 'fi-oishii', 'レストランで食事する場面', '在餐厅吃饭的场景', `${STYLE} 成人がレストランでおいしそうな料理を前にしている。`),
];

/**
 * 取り込み済み実画像（2026-07-27 ChatGPT生成→検証→WebP最適化→配置済み・全draft・§74）。
 * ここに無いassetはplannedのまま（実ファイルが存在しない段階で完成画像として扱わない）。
 */
const IMPORTED: Record<string, { filePath: string; thumbnailPath: string; width: number; height: number }> = {
  'va-verb-iku-scene': { filePath: '/images/ai-course/foundation/verbs/verb-iku-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-iku-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-kuru-scene': { filePath: '/images/ai-course/foundation/verbs/verb-kuru-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-kuru-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-taberu-scene': { filePath: '/images/ai-course/foundation/verbs/verb-taberu-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-taberu-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-hataraku-scene': { filePath: '/images/ai-course/foundation/verbs/verb-hataraku-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-hataraku-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-sumu-scene': { filePath: '/images/ai-course/foundation/verbs/verb-sumu-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-sumu-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-benkyo-scene': { filePath: '/images/ai-course/foundation/verbs/verb-benkyo-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-benkyo-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-nomu-scene': { filePath: '/images/ai-course/foundation/verbs/verb-nomu-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-nomu-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-miru-scene': { filePath: '/images/ai-course/foundation/verbs/verb-miru-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-miru-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-kiku-scene': { filePath: '/images/ai-course/foundation/verbs/verb-kiku-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-kiku-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-verb-hanasu-scene': { filePath: '/images/ai-course/foundation/verbs/verb-hanasu-scene-v1.webp', thumbnailPath: '/images/ai-course/foundation/verbs/verb-hanasu-scene-v1-thumb.webp', width: 800, height: 600 },
  'va-adj-ookii-chiisai-contrast': { filePath: '/images/ai-course/foundation/adjectives/adj-ookii-chiisai-contrast-v1.webp', thumbnailPath: '/images/ai-course/foundation/adjectives/adj-ookii-chiisai-contrast-v1-thumb.webp', width: 800, height: 600 },
  'va-adj-atsui-samui-contrast': { filePath: '/images/ai-course/foundation/adjectives/adj-atsui-samui-contrast-v1.webp', thumbnailPath: '/images/ai-course/foundation/adjectives/adj-atsui-samui-contrast-v1-thumb.webp', width: 800, height: 600 },
};
for (const a of VISUAL_ASSETS) {
  const im = IMPORTED[a.id];
  if (im) { a.filePath = im.filePath; a.thumbnailPath = im.thumbnailPath; a.width = im.width; a.height = im.height; a.reviewStatus = 'generated' as const; a.reviewStatus = 'draft'; }
}

export const assetById = (id: string): VisualAsset | undefined => VISUAL_ASSETS.find((a) => a.id === id);
export const assetForItem = (itemId: string): VisualAsset | undefined =>
  VISUAL_ASSETS.find((a) => a.learningTargetId === itemId && a.reviewStatus !== 'rejected');
export { IMG as VISUAL_ASSET_BASE };
