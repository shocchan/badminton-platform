// 教材レビューの対象一覧（Task 3・2026-08-21）。
//
// 教材の本文は**コードが正準**（語彙 / N2文法 / 聴解でファイルも型もバラバラ）。
// ここで「レビュー画面が扱える1つの形」へ正規化するだけで、内容は複製も改変もしない。
// 人がどう判定したかは DB（ai_content_reviews）にあり、この一覧と id で突き合わせる。
import { buildVocabularyReviewRecords } from '../vocabularyReview';
import { ALL_LISTENING_SETS, LISTENING_TYPE_LABELS } from '../adventure/listening/listeningBank';
import { N2_GRAMMAR_ITEMS } from '../n2GrammarData';
import { N2_GRAMMAR_CONTENT } from '../n2GrammarContent';

export type ContentKind = 'vocab' | 'n2grammar' | 'listening';
export type ReviewStatus = 'unreviewed' | 'needs_fix' | 'reviewed';

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  vocab: '語彙',
  n2grammar: 'N2文法',
  listening: '聴解',
};

/** レビュー画面に出す1件（本文はここで組み立てるが、元データは書き換えない） */
export interface ReviewableItem {
  kind: ContentKind;
  /** DBの content_id と一致させる安定ID */
  id: string;
  /** 一覧に出す見出し（日本語） */
  title: string;
  /** 絞り込み用の分類（レベル・品詞・聴解種別など） */
  category: string;
  /** 表示するフィールド。値が無いものは呼び出し側で落とす */
  fields: { label: string; value: string }[];
  /** 音声（public配下のパス）。無ければ null */
  audioPath: string | null;
  /** 画像（public配下のパス）。無ければ null */
  imagePath: string | null;
  /** 元データが持つ状態（参考表示。人の判定とは別物） */
  sourceState: string;
}

const nonEmpty = (fields: { label: string; value: unknown }[]): { label: string; value: string }[] =>
  fields
    .map((f) => ({ label: f.label, value: typeof f.value === 'string' ? f.value.trim() : '' }))
    .filter((f) => f.value.length > 0);

/** 語彙140語 */
export const vocabReviewItems = (): ReviewableItem[] =>
  buildVocabularyReviewRecords().map((r) => {
    const it = r.item;
    return {
      kind: 'vocab' as const,
      id: r.itemId,
      title: `${it.displayForm}（${it.readingKana}）`,
      category: it.partOfSpeech,
      fields: nonEmpty([
        { label: '見出し', value: it.displayForm },
        { label: '読み', value: it.readingKana },
        { label: '品詞', value: it.partOfSpeech },
        { label: '中国語訳', value: it.meaningZh },
        { label: '短い中国語訳', value: r.meaningZhShort },
        { label: '例文（日）', value: it.exampleJa },
        { label: '例文（中）', value: it.exampleZh },
        { label: '中国語話者向け注意', value: it.usageNoteZh ?? '' },
        { label: '学習の要点（日）', value: r.learningFocusJa ?? '' },
        { label: '学習の要点（中）', value: r.learningFocusZh ?? '' },
      ]),
      audioPath: null,
      imagePath: r.imageAsset && r.imageStatus === 'imported_draft'
        ? (r.imageAsset as { path?: string }).path ?? null
        : null,
      sourceState: r.contentReviewStatus,
    };
  });

/** N2文法（原本180項目。補完コンテンツがある分は本文も出す） */
export const n2GrammarReviewItems = (): ReviewableItem[] =>
  N2_GRAMMAR_ITEMS.map((g) => {
    const c = (N2_GRAMMAR_CONTENT as Record<string, Record<string, unknown>>)[g.grammarId];
    const str = (k: string): string => (typeof c?.[k] === 'string' ? String(c[k]) : '');
    const examples = Array.isArray(g.examples) ? g.examples.filter(Boolean).join('\n') : '';
    return {
      kind: 'n2grammar' as const,
      id: g.grammarId,
      title: g.displayExpression || g.expression,
      category: g.level ?? 'N2',
      fields: nonEmpty([
        { label: '文型', value: g.displayExpression || g.expression },
        { label: '原本の単元', value: g.sourceUnit },
        { label: '読み', value: g.reading ?? '' },
        { label: '意味（日）', value: g.meaningJa ?? '' },
        { label: '意味（中）', value: g.meaningZh ?? '' },
        { label: '例文', value: examples },
        { label: '解説（中）', value: str('explanationZh') },
        { label: '接続', value: str('formation') },
        { label: '使う場面', value: str('usageScene') },
        { label: 'よくある間違い（中）', value: str('commonMistakesZh') },
        { label: '要確認フラグ', value: (g.reviewFlags ?? []).join(', ') },
      ]),
      audioPath: null,
      imagePath: null,
      sourceState: c ? '補完あり' : '原本のみ',
    };
  });

/** 聴解（音声つき。**音声を再生して確認する**のが主目的） */
export const listeningReviewItems = (): ReviewableItem[] =>
  ALL_LISTENING_SETS.map((s) => ({
    kind: 'listening' as const,
    id: s.setId,
    title: `${s.sourceLevel} ${LISTENING_TYPE_LABELS[s.listeningType].ja}：${s.situationJa.slice(0, 24)}`,
    category: s.sourceLevel,
    fields: nonEmpty([
      { label: '場面（日）', value: s.situationJa },
      { label: '場面（中）', value: s.situationZh },
      { label: '読み上げ原稿', value: s.transcriptJa },
      { label: '設問（日）', value: s.questionJa },
      { label: '設問（中）', value: s.questionZh },
      {
        label: '選択肢',
        value: s.choices.map((c) => `${c.isCorrect ? '◯' : '×'} ${c.textJa}${c.whyWrongJa ? `（${c.whyWrongJa}）` : ''}`).join('\n'),
      },
      { label: '解説（日）', value: s.explanationJa },
      { label: '解説（中）', value: s.explanationZh },
    ]),
    audioPath: s.audioAsset,
    imagePath: null,
    sourceState: s.reviewState,
  }));

/** 全教材（種別ごとに安定した順序で並べる＝「次の未確認へ」が毎回同じ順になる） */
export const allReviewableItems = (): ReviewableItem[] => [
  ...vocabReviewItems(),
  ...n2GrammarReviewItems(),
  ...listeningReviewItems(),
];

export interface ReviewProgress {
  total: number;
  reviewed: number;
  needsFix: number;
  unreviewed: number;
}

/** 進捗。**状態が無い項目は未確認**として数える（暗黙に確認済みにしない） */
export const reviewProgressOf = (
  items: ReviewableItem[],
  statuses: Map<string, ReviewStatus>,
): ReviewProgress => {
  let reviewed = 0, needsFix = 0;
  for (const it of items) {
    const s = statuses.get(`${it.kind}:${it.id}`);
    if (s === 'reviewed') reviewed += 1;
    else if (s === 'needs_fix') needsFix += 1;
  }
  return { total: items.length, reviewed, needsFix, unreviewed: items.length - reviewed - needsFix };
};

/** 一覧の絞り込み（種別・分類・状態）。空文字は「すべて」 */
export const filterReviewItems = (input: {
  items: ReviewableItem[];
  statuses: Map<string, ReviewStatus>;
  kind: ContentKind | '';
  category: string;
  status: ReviewStatus | '';
  query: string;
}): ReviewableItem[] => {
  const q = input.query.trim().toLowerCase();
  return input.items.filter((it) => {
    if (input.kind && it.kind !== input.kind) return false;
    if (input.category && it.category !== input.category) return false;
    if (input.status) {
      const s = input.statuses.get(`${it.kind}:${it.id}`) ?? 'unreviewed';
      if (s !== input.status) return false;
    }
    if (q) {
      const hay = `${it.title}\n${it.fields.map((f) => f.value).join('\n')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

/** 「次の未確認へ」。現在地の後ろを探し、無ければ先頭から探す（末尾で止まらない） */
export const nextUnreviewedIndex = (
  items: ReviewableItem[],
  statuses: Map<string, ReviewStatus>,
  from: number,
): number => {
  const isUnreviewed = (i: number): boolean =>
    (statuses.get(`${items[i].kind}:${items[i].id}`) ?? 'unreviewed') === 'unreviewed';
  for (let i = from + 1; i < items.length; i += 1) if (isUnreviewed(i)) return i;
  for (let i = 0; i <= from && i < items.length; i += 1) if (isUnreviewed(i)) return i;
  return -1;
};
