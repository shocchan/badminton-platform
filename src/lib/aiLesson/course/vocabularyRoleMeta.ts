// N3準備パック62語の目標別role監査（Phase 2E-1 §3・全draft）。
// 評価軸: N3準備での重要度／会話での再利用性／読解重要度／中国語からの推測しやすさ／学習負荷。
// remedialは静的roleにしない（診断・問題結果からの動的付与のみ・§3）。
// rationaleJaは人間レビュー用の分類根拠（利用者へは表示しない）。
import type { VocabularyPackItemRole } from './vocabularyPacks';

type R = Exclude<VocabularyPackItemRole, 'remedial'>;
export interface N3RoleEntry {
  n3_prep: R;
  conversation: R;
  n2_prep: R;
  rationaleJa: string;
}

const e = (n3: R, conv: R, n2: R, rationaleJa: string): N3RoleEntry => ({ n3_prep: n3, conversation: conv, n2_prep: n2, rationaleJa });
// n2_prepは原則diagnostic（N3語の不足確認から・§3）。false friend中核のみrequired。
const req = (rationale: string) => e('required', 'required', 'diagnostic', rationale);

export const N3_ROLE_META: Record<string, N3RoleEntry> = {
  // ── 変化・自他（自他ペアはN3文法・読解の基軸） ──
  'fi-kawaru': req('自他ペアの基軸。「状況が変わる」等、会話・読解とも頻出'),
  'fi-kaeru-change': req('「変わる」との自他対比で必須。予定変更の会話で再利用性が高い'),
  'fi-fueru': req('変化表現の核。「機会が増えた」等、自分の生活を語る発話で使える'),
  'fi-heru': e('required', 'optional', 'diagnostic', '「増える」との対で読解に必要。発話頻度は増えるよりやや低い'),
  'fi-hajimeru': req('「〜を始めました」は経験を語る核表現。自動詞「始まる」との対比も学習点'),
  'fi-owaru': req('時間の報告「〜時に終わります」で会話再利用性が高い'),
  'fi-tsuzukeru': req('継続を語る核。「勉強を続けています」は学習者自身の話題で頻出'),
  'fi-tsuzuku': e('required', 'optional', 'diagnostic', '「暑い日が続く」等読解・天候表現で必要。発話では続けるが優先'),
  'fi-kimeru': req('意思決定の核動詞。「〜を決めました」で会話再利用性が高い'),
  'fi-kimaru': req('「仕事が決まった」等、近況報告の頻出表現。自他対比の学習点'),
  // ── 思考・伝達 ──
  'fi-omou': req('「〜と思います」は意見表明の最重要構文。全トラックで必須級'),
  'fi-kangaeru': req('「思う」との使い分けが学習点。転職・計画の話題で頻出'),
  'fi-kanjiru': e('optional', 'optional', 'diagnostic', 'やや抽象的で代替表現（思う）で言い換え可能。負荷対効果から任意'),
  'fi-tsutaeru': req('依頼・伝言の核動詞。職場会話での再利用性が高い'),
  'fi-setsumei': req('「説明してください」は生活・職場の実用表現'),
  'fi-soudan': req('「上司に相談する」等、助詞「に/と」の学習点を含む実用動詞'),
  'fi-renraku': req('遅刻・欠席の連絡は生活必須場面。「に連絡する」の助詞学習点'),
  'fi-kakunin': req('職場・生活で最頻出のする動詞の一つ。「状況を確認する」コロケーション'),
  // ── 準備・生活動詞 ──
  'fi-junbi': req('「面接の準備」等、目標達成の話題で頻出'),
  'fi-yoyaku': req('店・病院の予約は在日生活の必須場面'),
  'fi-riyou': e('required', 'optional', 'diagnostic', '「使う」との使い分けが学習点で読解に必要。発話では使うで代替可'),
  'fi-erabu': e('required', 'optional', 'diagnostic', '読解・指示文で頻出。発話頻度は中程度'),
  'fi-shiraberu': req('「調べます」は学習行動の核。会話でも頻出'),
  'fi-oboeru': req('学習の話題の核動詞。「覚えられない」等の可能形接続も学習点'),
  'fi-wasureru': req('「忘れました」は生活実用度が最高クラス'),
  'fi-kuraberu': e('optional', 'optional', 'diagnostic', '「〜と比べて」は文法項目として扱う方が効率的。単語単体の優先度は中'),
  'fi-nareru': req('「生活に慣れる」は在日学習者の頻出話題。助詞「に」の学習点'),
  'fi-komaru': req('困りごとの表明は生活必須。「〜なくて困る」接続も学習点'),
  'fi-ganbaru': req('あいさつ・決意表明で最頻出。文化的にも重要'),
  // ── 抽象名詞（中国語と字形が近い語はdiagnosticで読み・用法確認を優先・§5） ──
  'fi-kimochi': req('感情を語る核名詞。「気持ちを伝える」コロケーション'),
  'fi-kibun': req('体調・状態の報告で頻出。「気持ち」との使い分けが学習点'),
  'fi-riyuu': e('diagnostic', 'optional', 'diagnostic', '中国語「理由」と同形同義（transparent）。読みの確認が中心'),
  'fi-iken': e('diagnostic', 'diagnostic', 'diagnostic', '中国語「意见」とほぼ同義。読みと「意見を言う」の確認のみ'),
  'fi-keiken': e('diagnostic', 'diagnostic', 'diagnostic', '中国語「经验/经历」と重なる。読みと「経験がある」の確認のみ'),
  'fi-yotei': req('「予定があります」は会話最頻出。断り表現とも接続'),
  'fi-shuukan': e('diagnostic', 'optional', 'diagnostic', '中国語「习惯」と中心義が同じ。読み確認が中心'),
  'fi-houhou': e('diagnostic', 'optional', 'diagnostic', '中国語「方法」と同形同義。読み確認が中心'),
  'fi-mondai': e('diagnostic', 'diagnostic', 'diagnostic', '中国語「问题」と同形同義。読み確認が中心'),
  'fi-joukyou': e('diagnostic', 'optional', 'diagnostic', '中国語「状况」とほぼ同義。読みと「状況を確認する」の確認'),
  'fi-kankei': e('diagnostic', 'optional', 'diagnostic', '中国語「关系」と重なる。読み確認が中心'),
  'fi-jouhou': e('diagnostic', 'optional', 'diagnostic', '中国語「信息」とは字形が違うが「情報」は推測しやすい。読み確認中心'),
  'fi-tsugou': e('required', 'required', 'required', 'false friend（中文「都合适」とは別語）。誤解リスクが高くN2でも要確認'),
  'fi-yakusoku': req('「約束がある」は誘いを断る場面の核。中国語「约定」と字形が異なる'),
  'fi-kyoumi': req('「〜に興味があります」は自己紹介の核。助詞「に」とコロケーションが学習点'),
  // ── 感情・状態の形容詞 ──
  'fi-ureshii': req('感情表現の核。合格・再会等の話題で頻出'),
  'fi-kanashii': e('optional', 'optional', 'diagnostic', '嬉しいとの対で意味は推測しやすい。優先度は中'),
  'fi-sabishii': e('optional', 'required', 'diagnostic', '家族と離れて暮らす学習者の会話で頻出。読解優先度は中'),
  'fi-hazukashii': e('optional', 'optional', 'diagnostic', '使えると自然だが代替表現あり。負荷対効果から任意'),
  'fi-kibishii': req('「時間に厳しい」は日本の職場文化を語る核表現'),
  'fi-taihen': e('required', 'required', 'required', 'false friend（中文「大变」とは別語）。あいさつ「大変ですね」も核'),
  'fi-hitsuyou': req('「〜が必要です」は手続き・生活の核構文'),
  'fi-muri': req('「ちょっと無理です」は断りの核表現'),
  'fi-fukuzatsu': e('diagnostic', 'optional', 'diagnostic', '中国語「复杂」と同形同義。読み確認が中心'),
  'fi-jiyuu': e('diagnostic', 'optional', 'diagnostic', '中国語「自由」と同形同義。読み確認が中心'),
  // ── 副詞・接続 ──
  'fi-tabun': req('推量「たぶん〜と思います」は会話の核'),
  'fi-kanarazu': req('約束・依頼の強調で頻出'),
  'fi-saikin': req('近況報告の起点。「最近〜を始めました」'),
  'fi-zenzen': req('否定呼応「全然〜ない」は文法学習点を含む頻出副詞'),
  'fi-nakanaka': e('optional', 'optional', 'diagnostic', '「なかなか〜ない」は有用だが全然より優先度低'),
  'fi-yatto': e('optional', 'optional', 'diagnostic', '達成の表現として自然だが代替（ついに等不要・簡単な言い換え可）'),
  'fi-tsumari': e('enrichment', 'enrichment', 'diagnostic', '整理・言い換えの接続詞。書き言葉寄りで現段階は発展扱い'),
  'fi-sorede': req('会話の接続の核。「それで、どうしましたか」等の相づちにも使う'),
};

/** N3_ROLE_METAの登録漏れ検出用（テストで62語全件を強制） */
export const n3RoleEntryOf = (itemId: string): N3RoleEntry | undefined => N3_ROLE_META[itemId];
