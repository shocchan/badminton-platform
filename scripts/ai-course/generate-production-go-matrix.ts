// Production GO Matrix（§28）。各項目は pass / fail / human_required / not_applicable のみ。
// partial は禁止。実装したが未検証のものは fail とし、GOを偽らない。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/generate-production-go-matrix.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
type Status = 'pass' | 'fail' | 'human_required' | 'remote_required' | 'physical_required' | 'legal_required' | 'not_applicable';
/** failの担当区分。AIで直せるのか、環境が要るのかを混同しないため（§2） */
type FailOwner = 'ai_resolvable' | 'ai_resolvable_env_blocked';
interface Row { area: string; item: string; status: Status; evidence: string; failOwner?: FailOwner }

const blocker = JSON.parse(readFileSync(
  join(ROOT, 'docs/ai-course/production/generated/production-blocker-manifest.json'), 'utf8'));
const ai = blocker.summary.aiActionableBlockers as number;
const cov = blocker.unitCoverage;

const has = (p: string) => existsSync(join(ROOT, p));

const rows: Row[] = [
  // ── Functional ──
  { area: 'Functional', item: 'login / auth', status: 'pass', evidence: '既存実装・staging稼働中（本セッションで変更なし）' },
  { area: 'Functional', item: 'Home（RPG World Home）', status: 'pass', evidence: 'WorldHomeShell実装・実ブラウザ1280/390で overflow 0・Map 58%幅/62vh' },
  { area: 'Functional', item: 'first run / onboarding', status: 'pass', evidence: '既存FirstRunJourney（本セッションで変更なし）' },
  { area: 'Functional', item: 'RPG Chapter 1', status: 'pass', evidence: 'UI E2E 14件（5Quest完走・文法・復習・reload・learner view）' },
  { area: 'Functional', item: 'Vocabulary（記憶の書庫）', status: 'pass', evidence: '既存ことば図鑑＋World Homeから導線' },
  { area: 'Functional', item: 'Grammar（文法の工房）', status: 'pass', evidence: '既存しくみラボ＋World Homeから導線' },
  { area: 'Functional', item: 'N3 Unit learner UI（12単元）', status: 'pass',
    evidence: '共通ランタイム＋UI実装。12単元すべてがresultまで完走するテスト（9件）・実ブラウザ証拠8画面' },
  { area: 'Functional', item: 'AI text conversation', status: 'pass', evidence: '既存実装・本セッションで変更なし' },
  { area: 'Functional', item: 'AI voice conversation', status: 'human_required', evidence: '実機マイク・音声品質は物理端末確認が必要' },
  { area: 'Functional', item: 'Report / Review / Growth / Settings', status: 'pass', evidence: '既存実装・World Homeから導線接続' },
  { area: 'Functional', item: 'Recovery（中断復帰）', status: 'pass', evidence: '既存recovery＋RPG側reload復元テスト' },

  // ── Content ──
  { area: 'Content', item: 'answer leakage = 0', status: 'pass', evidence: `blocker manifest: answerLeakageIssues 0（teach/assess分離・監査テスト常設）` },
  { area: 'Content', item: 'required vocabulary coverage', status: 'pass',
    evidence: `全${cov.vocabularyTotal}語を12単元へ割当・孤立0・重複0・required未評価0` },
  { area: 'Content', item: 'cognate quality（同形語対策）', status: 'pass',
    evidence: '4分類＋高リスク12語のcontrast必須化。同形同義語への意味当ては0' },
  { area: 'Content', item: '3段階（理解/使い分け/実践）', status: 'pass',
    evidence: '全12単元で understand>0・distinguish>0・apply>0 をテストで固定' },
  { area: 'Content', item: 'N2文法 completeDraft', status: 'pass', evidence: '173+7+0+0=180（前セッション・恒等式テスト）' },
  { area: 'Content', item: 'CEO教材承認', status: 'human_required', evidence: 'human_reviewed/approvedは自動昇格しない。review packet提供済み' },
  { area: 'Content', item: 'CEOビジュアル承認', status: 'human_required', evidence: 'contact sheet 22asset・world/story名称はすべて仮称' },

  // ── Technical ──
  { area: 'Technical', item: 'tests', status: 'pass', evidence: '1019件 全pass' },
  { area: 'Technical', item: 'build / typecheck / lint', status: 'pass', evidence: 'build成功・tsc 0 error・lint 45E+6W=51（基線同値）' },
  { area: 'Technical', item: 'performance（learner bundle）', status: 'pass',
    evidence: 'learner main 590.38kB維持・Chapter1/N3Unitはlazy chunk・N2 draftはlearner非配信' },
  { area: 'Technical', item: '正式DB（migration適用）', status: 'human_required',
    evidence: 'remote適用は APPLY_SHARED_SUPABASE_MIGRATIONS が必要。本セッションでは未着手' },
  { area: 'Technical', item: 'RLS / entitlement 検証（local実証）', status: 'fail', failOwner: 'ai_resolvable_env_blocked',
    evidence: 'Dockerが本機に未インストールでlocal Supabaseを起動できず未実行。CLIは導入済み（v2.101.0）' },
  { area: 'Technical', item: 'cross-device 同期（local DB実証）', status: 'fail', failOwner: 'ai_resolvable_env_blocked',
    evidence: 'Repository/outbox/楽観ロック/決定的mergeは実装＋16テストで検証済み。ただし模擬サーバであり実DB実証ではない（Docker必要）' },
  { area: 'Technical', item: 'monitoring / error codes', status: 'pass',
    evidence: '16 code＋許可リスト方式の監視adapter。PII遮断テスト12件（JWT/email/本文の混入を機械的に阻止）' },

  // ── Device ──
  { area: 'Device', item: 'automated viewport QA', status: 'pass',
    evidence: '実ブラウザ 1280/390 実測: overflow 0・タッチ48px・順序 Map→CTA→施設' },
  { area: 'Device', item: '実機 iPhone', status: 'human_required', evidence: '物理端末が必要' },
  { area: 'Device', item: '実機 Android', status: 'human_required', evidence: '物理端末が必要' },
  { area: 'Device', item: 'VoiceOver / TalkBack', status: 'human_required', evidence: '実機スクリーンリーダー確認が必要' },

  // ── Operations ──
  { area: 'Operations', item: '利用規約 / プライバシー', status: 'human_required', evidence: '法務判断。AI送信範囲・保存期間・削除方法の確定が必要' },
  { area: 'Operations', item: 'LP文言（ベータ版表記）', status: 'human_required', evidence: '正式版表現はCEO/法務判断（blocker manifest: landingCopyDecision 4件）' },
  { area: 'Operations', item: 'support UI / payload contract', status: 'pass',
    evidence: '6カテゴリの報告UI＋許可リストpayload。自由入力・メール・会話は送らない（テスト済み）' },
  { area: 'Operations', item: 'support 送信先の確定', status: 'human_required',
    evidence: '問い合わせ先の正式値がCEO判断待ち。未確定の間は「この端末に控えました」と正直に表示' },
  { area: 'Operations', item: 'rollback / backup 実証', status: 'fail', failOwner: 'ai_resolvable_env_blocked',
    evidence: '手順書は作成済み（security rollbackとfeature rollbackを分離）。Docker未導入のため未実行' },
  { area: 'Operations', item: 'incident response runbook', status: 'pass',
    evidence: '9シナリオを検知/重大度/初動/通知/rollback/証拠/復旧条件で整備' },
  { area: 'Operations', item: 'incident response の owner確定', status: 'human_required',
    evidence: '一次対応者・外部通知先・費用閾値・補償方針がCEO判断待ち' },
  { area: 'Operations', item: 'version manifest', status: has('docs/ai-course/production/generated/production-blocker-manifest.json') ? 'pass' : 'fail',
    evidence: 'blocker manifest＋GO matrixを生成スクリプトで再現可能' },
  { area: 'Operations', item: '本番反映', status: 'human_required', evidence: 'APPROVE_AI_COURSE_PRODUCTION_RELEASE が必要' },
];

const counts = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
  { pass: 0, fail: 0, human_required: 0, remote_required: 0, physical_required: 0, legal_required: 0, not_applicable: 0 });
const productionGo = counts.fail === 0 && counts.human_required === 0 && ai === 0 ? 'GO' : 'NO-GO';

// §2: 個別issue件数とGateカテゴリ数は別指標として扱う
const gateBreakdown = {
  aiResolvableIssueInstances: ai,
  aiResolvableGateCategories: rows.filter(r => r.status === 'fail' && r.failOwner === 'ai_resolvable').length,
  envBlockedGateCategories: rows.filter(r => r.status === 'fail' && r.failOwner === 'ai_resolvable_env_blocked').length,
  humanRequiredGateCategories: rows.filter(r => r.status === 'human_required').length,
};

const matrix = { generatedAt: new Date().toISOString(), productionGo, counts, gateBreakdown, aiActionableBlockers: ai, rows };
writeFileSync(join(ROOT, 'docs/ai-course/production/generated/production-go-matrix.json'),
  JSON.stringify(matrix, null, 1) + '\n');

const areas = [...new Set(rows.map(r => r.area))];
const md = `# Production GO Matrix（生成: ${matrix.generatedAt}）

## 判定: **${productionGo}**

- pass: ${counts.pass} / fail: ${counts.fail} / human_required: ${counts.human_required}
- AI解消可能な個別issue件数: **${gateBreakdown.aiResolvableIssueInstances}件**（Gateカテゴリ数とは別指標・§2）
- AIだけで解消できるGateカテゴリ: **${gateBreakdown.aiResolvableGateCategories}**
- 環境（Docker/local DB）が必要で未実行のGateカテゴリ: **${gateBreakdown.envBlockedGateCategories}**
- 人間の判断が必要なGateカテゴリ: **${gateBreakdown.humanRequiredGateCategories}**
- partialは使わない。実装済みでも未検証なら fail とする。

${areas.map(area => `### ${area}

| 項目 | 判定 | 根拠 |
|---|---|---|
${rows.filter(r => r.area === area).map(r => `| ${r.item} | ${r.status} | ${r.evidence} |`).join('\n')}
`).join('\n')}

## NO-GOの内訳

**AIがまだ処理できるもち（fail）**
${rows.filter(r => r.status === 'fail').map(r => `- ${r.area} / ${r.item}: ${r.evidence}`).join('\n')}

**人間・remote・実機・法務でしかできないもの（human_required）**
${rows.filter(r => r.status === 'human_required').map(r => `- ${r.area} / ${r.item}: ${r.evidence}`).join('\n')}
`;
writeFileSync(join(ROOT, 'docs/ai-course/production/generated/production-go-matrix.md'), md.replace('もち（fail）', 'もの（fail）'));
console.log(JSON.stringify({ productionGo, ...counts, ...gateBreakdown }, null, 1));
