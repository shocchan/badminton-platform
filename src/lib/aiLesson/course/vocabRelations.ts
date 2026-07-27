// 語彙の近似・類義関係（Phase 2E-1.5 §24・全draft）。
// 低confidenceで大量確定しない。学習画面へ表示するのは high confidence の draft のみ。
// 自他ペアは vocabDiagnosticPool.RELATED_ITEM_PAIRS（復習候補用）と役割が異なる:
// こちらは「詳細画面での関係説明」用の教材データ。
export type VocabularyRelationType =
  | 'synonym' | 'near_synonym' | 'antonym' | 'transitive_intransitive'
  | 'collocation_partner' | 'register_difference' | 'concept_related';

export interface VocabularyRelation {
  itemId: string;
  relatedItemId: string;
  relationType: VocabularyRelationType;
  explanationJa: string;
  explanationZh: string;
  confidence: 'high' | 'medium' | 'low';
  reviewStatus: 'draft' | 'unreviewed';
}

const r = (
  itemId: string, relatedItemId: string, relationType: VocabularyRelationType,
  explanationJa: string, explanationZh: string,
  confidence: VocabularyRelation['confidence'] = 'high',
  reviewStatus: VocabularyRelation['reviewStatus'] = 'draft',
): VocabularyRelation => ({ itemId, relatedItemId, relationType, explanationJa, explanationZh, confidence, reviewStatus });

export const VOCABULARY_RELATIONS: VocabularyRelation[] = [
  // 自他ペア（対称・§24）
  r('fi-kimaru', 'fi-kimeru', 'transitive_intransitive', '「〜が決まる」（自）／「〜を決める」（他）', '自动词「決まる」（〜が）／他动词「決める」（〜を）'),
  r('fi-kawaru', 'fi-kaeru-change', 'transitive_intransitive', '「〜が変わる」（自）／「〜を変える」（他）', '自动词「変わる」（〜が）／他动词「変える」（〜を）'),
  r('fi-fueru', 'fi-heru', 'antonym', '増える⇔減る', '增加⇔减少'),
  r('fi-tsuzuku', 'fi-tsuzukeru', 'transitive_intransitive', '「〜が続く」（自）／「〜を続ける」（他）', '自动词「続く」（〜が）／他动词「続ける」（〜を）'),
  r('fi-hajimeru', 'fi-owaru', 'antonym', '始める⇔終わる（時間の反対）', '开始⇔结束'),
  // 類義（使い分けが学習ポイント）
  r('fi-omou', 'fi-kangaeru', 'near_synonym', '思う=感じ・意見／考える=頭を使ってじっくり', '「思う」=觉得・认为；「考える」=动脑思考'),
  r('fi-kimochi', 'fi-kibun', 'near_synonym', '気持ち=内心の感情／気分=その時の状態・体調', '「気持ち」=内心感受；「気分」=当下状态（気分が悪い多指身体不适）'),
  r('fi-miru', 'fi-kakunin', 'near_synonym', '見る=視覚で見る／確認する=正しいか確かめる', '「見る」=看；「確認する」=核实・确认', 'medium'),
  r('fi-riyou', 'fi-tsukau', 'register_difference', '使う=具体的な道具／利用する=サービス・施設（ややかたい）', '「使う」=具体工具；「利用する」=服务・设施（较正式）'),
  r('fi-joukyou', 'fi-mondai', 'concept_related', '状況を確認して、問題があれば伝える（報告の流れ）', '先确认状況，有問題再说明（汇报的流程）', 'medium'),
  r('fi-riyuu', 'fi-tsugou', 'concept_related', '断るとき: 理由を言わず「都合が悪い」で丁寧に', '拒绝时可以不说理由，用「都合が悪い」更委婉', 'medium'),
  r('fi-houhou', 'fi-shiraberu', 'collocation_partner', '「方法を調べる」', '常用搭配「方法を調べる」', 'medium'),
  r('fi-zenzen', 'fi-nakanaka', 'near_synonym', '全然〜ない=まったくない／なかなか〜ない=思うようにできない', '「全然〜ない」=完全不；「なかなか〜ない」=不容易・总是不能', 'medium'),
  r('fi-yotei', 'fi-yakusoku', 'near_synonym', '予定=自分の計画／約束=相手との取り決め', '「予定」=自己的安排；「約束」=和别人的约定'),
];

/** 詳細画面表示用（§24: high confidenceのdraftのみ・対称に引く） */
export const relationsForItem = (itemId: string): VocabularyRelation[] =>
  VOCABULARY_RELATIONS.filter((rel) =>
    (rel.itemId === itemId || rel.relatedItemId === itemId) && rel.confidence === 'high' && rel.reviewStatus === 'draft');
