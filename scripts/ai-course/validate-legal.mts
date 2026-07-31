// 法務データの検証（CEO入力後に走らせる唯一のcommand）。
//
//   npm run validate:ai-course-legal
//
// 目的は「CEOが値を入れたあと、公開してよい状態か」を1回で判定すること。
// 秘密の値は扱わない（法務事実は公開情報なので値そのものを出してよい）。
//
// 失敗はfield単位で出す。成功時は短いsummaryだけ。
import { LEGAL_FACTS, pendingLegalFacts, LEGAL_PUBLISH, type LegalFacts } from '../../src/lib/aiLesson/course/legal/legalFacts';
import { buildLegalPages, renderableLegalPage, LEGAL_PAGE_IDS, legalPathFor } from '../../src/lib/aiLesson/course/legal/legalContent';

// --simulate-filled: 値を入れた場合にPASSへ到達できるかを確認する自己診断。
// 実ファイルは変更しない（CEOが入力する前に「検査そのものが機能するか」を見るため）。
const SIMULATE = process.argv.includes('--simulate-filled');
const FILLED: LegalFacts = {
  ...LEGAL_FACTS,
  operatorName: 'サンプル事業者', address: 'on_request', phone: 'on_request',
  priceJpyTaxIncluded: 100000, paymentMethods: ['銀行振込'], paymentTiming: '申込時',
  serviceStartTiming: '決済確認後', refundPolicy: '開始前は全額返金します。',
  retentionPeriod: '受講終了後1年', deletionSlaDays: 30, improvementUseAllowed: false,
  minimumAge: 18, externalAiVendors: ['OpenAI'], governingLaw: '日本法・東京地方裁判所',
};
const f: LegalFacts = SIMULATE ? FILLED : LEGAL_FACTS;
const errors: string[] = [];
const warn: string[] = [];

/** 値の形が正しいか。埋まっている項目だけを見る（未入力は pending 側で扱う） */
const validators: Partial<Record<keyof LegalFacts, (v: unknown) => string | null>> = {
  operatorName: (v) => (typeof v === 'string' && v.trim().length >= 2 ? null : '2文字以上の名称が必要'),
  address: (v) => (v === 'on_request' || (typeof v === 'string' && v.trim().length >= 5)
    ? null : "住所文字列か 'on_request'（請求時開示）が必要"),
  phone: (v) => (v === 'on_request' || (typeof v === 'string' && /[0-9]/.test(String(v)))
    ? null : "電話番号か 'on_request' が必要"),
  priceJpyTaxIncluded: (v) => (typeof v === 'number' && Number.isInteger(v) && v > 0
    ? null : '正の整数（税込・円）が必要'),
  paymentMethods: (v) => (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.trim())
    ? null : '1件以上の支払方法が必要'),
  paymentTiming: (v) => (typeof v === 'string' && v.trim().length >= 2 ? null : '支払時期の記載が必要'),
  serviceStartTiming: (v) => (typeof v === 'string' && v.trim().length >= 2 ? null : '提供時期の記載が必要'),
  refundPolicy: (v) => (typeof v === 'string' && v.trim().length >= 5 ? null : '返金・解約方針の記載が必要'),
  retentionPeriod: (v) => (typeof v === 'string' && v.trim().length >= 2 ? null : '保存期間の記載が必要'),
  deletionSlaDays: (v) => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 180
    ? null : '1〜180の整数（日数）が必要'),
  improvementUseAllowed: (v) => (typeof v === 'boolean' ? null : 'true / false のどちらかが必要'),
  minimumAge: (v) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 30
    ? null : '0〜30の整数（歳）が必要'),
  externalAiVendors: (v) => (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.trim())
    ? null : '1件以上の事業者名が必要'),
  governingLaw: (v) => (typeof v === 'string' && v.trim().length >= 2 ? null : '準拠法・管轄の記載が必要'),
};

const pending = pendingLegalFacts(f);
for (const [k, check] of Object.entries(validators) as [keyof LegalFacts, (v: unknown) => string | null][]) {
  if (f[k] === null) continue;                 // 未入力は pending で報告する
  const msg = check(f[k]);
  if (msg) errors.push(`${k}: ${msg}（現在値の型: ${Array.isArray(f[k]) ? 'array' : typeof f[k]}）`);
}

// 窓口の一貫性
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contactEmail)) errors.push(`contactEmail: メール形式が不正`);
if (f.contactEmail !== 'info@kawabado.com') warn.push(`contactEmail が info@kawabado.com 以外（${f.contactEmail}）`);

// 描画結果に placeholder / 空節が混ざっていないか
const BANNED = /TODO|FIXME|準備中|准备中|coming soon|未定|待定|〇〇|●●|xxx/i;
const routes: string[] = [];
for (const lang of ['ja', 'zh'] as const) {
  for (const page of buildLegalPages(lang, f)) {
    const r = renderableLegalPage(page, f);
    routes.push(legalPathFor(lang, page.id));
    const text = [r.title, r.intro, ...r.sections.flatMap((s) => [s.heading, ...s.body])].join(' ');
    if (BANNED.test(text)) errors.push(`${lang}/${page.id}: placeholder表現が混入している`);
    for (const s of r.sections) {
      if (s.body.some((b) => !b || !String(b).trim())) errors.push(`${lang}/${page.id}/${s.heading}: 空の段落がある`);
    }
    if (r.sections.length === 0) errors.push(`${lang}/${page.id}: 表示できる節が1つも無い`);
  }
}
if (routes.length !== LEGAL_PAGE_IDS.length * 2) errors.push(`route数が想定と違う: ${routes.length}`);

// ── 出力 ─────────────────────────────────────────────
const ok = errors.length === 0 && pending.length === 0;
if (pending.length) {
  console.log(`未入力 ${pending.length} 件:`);
  for (const k of pending) console.log(`  - ${k}`);
}
if (errors.length) {
  console.log(`不正 ${errors.length} 件:`);
  for (const e of errors) console.log(`  - ${e}`);
}
for (const w of warn) console.log(`注意: ${w}`);

console.log('');
const willPublish = SIMULATE ? pending.length === 0 : LEGAL_PUBLISH;
if (SIMULATE) console.log('（--simulate-filled: 仮の値で検査。実ファイルは未変更）');
console.log(`LEGAL_PUBLISH: ${willPublish}（${willPublish ? '8ページ公開・同意チェック有効' : '非公開・同意チェックは出さない'}）`);
console.log(`route対象: ja ${LEGAL_PAGE_IDS.length} + zh ${LEGAL_PAGE_IDS.length} = ${routes.length}`);
console.log(ok ? 'VALIDATE LEGAL: PASS' : 'VALIDATE LEGAL: FAIL');
process.exit(ok ? 0 : 1);
