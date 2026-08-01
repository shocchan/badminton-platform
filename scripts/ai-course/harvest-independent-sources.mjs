// 独立ソースの追加と飽和判定（EXAM COVERAGE CLOSURE §2・§3）。
//
// 目的:
//   既存bankは実質1つのJLPT語彙リスト系統（tanos-waller）に依存している。
//   **系統の異なる独立ソース**を当てて「これ以上足しても増えない」ことを実測で示す。
//
// 方針（§2）:
// - 取得するのは 表記 / 読み / 頻度順位 / 出典 のみ。訳・例文・問題・説明・並び順はコピーしない。
// - ソースごとに sha256・取得日時・ライセンス・帰属表示を残す。
// - reference_only のソースは learner に見えるDBへ入れない・再配布しない（統計だけ残す）。
// - 取得できなかったソースは「取得できた」と書かない。理由を記録する。
//
// 実行: node scripts/ai-course/harvest-independent-sources.mjs [--offline]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const WORK = process.env.HARVEST_WORK_DIR
  || '/private/tmp/claude-501/-Users-shocchan-ai-company/ca909b0c-621c-47d2-a80a-8dfb7b3ec661/scratchpad/vocab-harvest';
const OUT = 'docs/ai-course/adventure-v2/generated';
const OFFLINE = process.argv.includes('--offline');
const retrievedAt = new Date().toISOString();
mkdirSync(WORK, { recursive: true });

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const pctOf = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 10000) / 100);

/** ダウンロード。失敗しても落とさず null を返す（取得可否そのものが報告対象） */
const fetchTo = (url, file, timeoutSec = 60) => {
  const path = join(WORK, file);
  if (existsSync(path)) return { path, cached: true };
  if (OFFLINE) return null;
  try {
    execFileSync('curl', ['-sSL', '-f', '-m', String(timeoutSec), '-o', path, url], { stdio: 'pipe' });
    return { path, cached: false };
  } catch (e) {
    return { path: null, error: String(e.message ?? e).slice(0, 200) };
  }
};

// ── 既存bankの読み込み ──
const bankPath = `${OUT}/vocab-canonical.json`;
if (!existsSync(bankPath)) {
  console.error('run build-canonical-vocab.ts first');
  process.exit(2);
}
const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
const jmIndex = existsSync(`${OUT}/vocab-jmdict-index.json`)
  ? JSON.parse(readFileSync(`${OUT}/vocab-jmdict-index.json`, 'utf8')).entries : {};
const kanjiGrade = existsSync(`${OUT}/vocab-kanji-grade.json`)
  ? JSON.parse(readFileSync(`${OUT}/vocab-kanji-grade.json`, 'utf8')).grades : {};

const haveSurfaceReading = new Set(bank.words.map((w) => `${w.canonicalSurface}|${w.reading}`));
const haveSurface = new Set(bank.words.map((w) => w.canonicalSurface));
for (const w of bank.words) for (const a of w.aliases ?? []) haveSurface.add(a);
// 同じ語の表記ゆれ（かな書き／異体字／送りがな違い）は「新しい語」ではない。
// 読みが既にbankにあれば、語としては収録済みと数える（指標は分けて出す）。
const haveReading = new Set(bank.words.map((w) => w.reading));
const currentCore = bank.words.filter((w) => w.priority === 'core').length;
const currentLikely = bank.words.filter((w) => w.priority === 'likely').length;

// surface → JMdictエントリ（読み・品詞・頻度・語義数）
const bySurface = new Map();
for (const [key, e] of Object.entries(jmIndex)) {
  const s = key.split('|')[0];
  if (!bySurface.has(s)) bySurface.set(s, e);
}

const LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'];
/** build-canonical-vocab.ts と同じ信号ロジック（sourceのレベル主張が無い語の判定） */
const assignLevelIdx = (surface, entry) => {
  const grades = [...surface].filter((c) => /[一-鿿]/.test(c))
    .map((c) => kanjiGrade[c]).filter((g) => typeof g === 'number');
  const maxGrade = grades.length > 0 ? Math.max(...grades) : null;
  let idx;
  if (maxGrade === null) idx = entry?.common ? 0 : 1;
  else if (maxGrade <= 2) idx = 0;
  else if (maxGrade <= 4) idx = 1;
  else if (maxGrade <= 6) idx = 2;
  else idx = 3;
  if (entry?.common) idx = Math.max(0, idx - 1);
  // build側と同じ: レベル主張の無い語は1段上へ寄せ、下限をN3（idx=2）にする
  return Math.max(2, Math.min(4, idx + 1));
};
/**
 * 新規語がbankへ入った場合に付くはずの priority。
 * build-canonical-vocab.ts の規則と一致させる:
 * レベル主張を持つsourceが無い語は core にならない（自社教材での多出は別途）。
 */
const predictPriority = (surface, entry) => {
  const idx = assignLevelIdx(surface, entry);
  if (!entry) return 'hold';                    // 辞書照合できない＝出題しない
  if (entry.common || idx <= 2) return 'likely';
  return 'extended';
};

const isJapaneseWord = (t) =>
  /[぀-ゟ゠-ヿ一-鿿]/.test(t) && !/[A-Za-z0-9]/.test(t);

/**
 * 語彙bankの飽和を測る対象は「内容語」に限る。
 * 助詞・助動詞・接辞・固有名詞は語彙bankの担当ではない
 * （助詞助動詞は文法bank、固有名詞は試験語彙ではない）。
 */
const FUNCTION_POS = new Set([
  'prt', 'aux', 'aux-v', 'aux-adj', 'cop', 'cop-da', 'conj', 'int',
  'pref', 'suf', 'ctr', 'n-pr', 'unc', 'exp', 'pn',
]);
const isContentWord = (entry) => {
  if (!entry) return false;
  const pos = entry.pos ?? [];
  if (pos.length === 0) return false;
  // 機能語タグしか持たない語は除外（内容語タグが1つでもあれば対象）
  return pos.some((p) => !FUNCTION_POS.has(p));
};

const sources = [];
const probes = [];

// ── 独立ソース 1: OpenSubtitles 日本語頻度リスト（話し言葉コーパス系統） ──
// JLPT語彙リストとは系統が完全に異なる（字幕コーパスの実頻度）。
// 取るのは「表記と頻度順位」のみ。訳・例文は元から無い。
{
  const url = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2016/ja/ja_50k.txt';
  const got = fetchTo(url, 'opensubtitles-ja-50k.txt');
  if (got?.path && existsSync(got.path)) {
    const raw = readFileSync(got.path);
    const lines = raw.toString('utf8').split('\n');
    const tokens = [];
    lines.forEach((line, i) => {
      const [tok, freq] = line.trim().split(/\s+/);
      if (!tok || !freq) return;
      if (!isJapaneseWord(tok)) return;
      tokens.push({ surface: tok, rank: i + 1, freq: Number(freq) });
    });
    sources.push({
      sourceId: 'opensubtitles-ja-50k',
      sourceFamily: 'opensubtitles-opus',
      license: 'attribution_share',
      attribution: 'OpenSubtitles / OPUS corpus, frequency list compiled by hermitdave (FrequencyWords, MIT). '
        + 'Corpus text © respective subtitle authors, distributed via OPUS under CC BY-SA-compatible terms.',
      origin: url,
      sha256: sha256(raw),
      bytes: raw.length,
      retrievedAt,
      available: true,
      lineage: '字幕コーパスの実測頻度。JLPT出題基準系統とは独立',
      fieldsTaken: ['surface(token)', 'frequency rank'],
      fieldsDeliberatelyNotTaken: ['翻訳', '例文', '文脈行', '字幕本文', 'リストの並びそのもの'],
      rows: lines.length,
      japaneseTokens: tokens.length,
    });
    probes.push({ sourceId: 'opensubtitles-ja-50k', tokens });
  } else {
    sources.push({
      sourceId: 'opensubtitles-ja-50k', sourceFamily: 'opensubtitles-opus',
      license: 'attribution_share', origin: url, retrievedAt,
      available: false, reason: got?.error ?? 'offline mode',
    });
  }
}

// ── 独立ソース 2: JMdict common（新聞頻度・一万語彙分類集などの優先度マーカー系統） ──
// すでに読み・品詞の裏づけに使っているが、**語の在庫としての独立系統**でもある。
// ここでは「JMdictがcommonとする語のうち、bankに無い語」を飽和プローブに使う。
{
  const commonSurfaces = [];
  for (const [key, e] of Object.entries(jmIndex)) {
    if (!e.common) continue;
    const s = key.split('|')[0];
    if (!isJapaneseWord(s)) continue;
    if (!isContentWord(e)) continue;
    commonSurfaces.push({ surface: s, rank: null, freq: null });
  }
  sources.push({
    sourceId: 'jmdict-eng-common-inventory',
    sourceFamily: 'jmdict',
    license: 'attribution_share',
    attribution: 'JMdict © Electronic Dictionary Research and Development Group, CC BY-SA 4.0. '
      + 'Priority markers derive from Mainichi Shimbun frequency and Ichimango goi bunruishuu.',
    origin: 'https://github.com/scriptin/jmdict-simplified',
    retrievedAt,
    available: true,
    lineage: '新聞頻度・一万語彙分類集ベースの優先度マーカー。JLPT出題基準系統とは独立',
    fieldsTaken: ['surface', 'reading', 'partOfSpeech', 'priority marker'],
    fieldsDeliberatelyNotTaken: ['英訳グロス', '例文'],
    japaneseTokens: commonSurfaces.length,
  });
  probes.push({ sourceId: 'jmdict-eng-common-inventory', tokens: commonSurfaces });
}

// ── 独立ソース 3: NINJAL『BCCWJ』短単位語彙表（取得を試みる） ──
{
  const url = 'https://repository.ninjal.ac.jp/record/3234/files/BCCWJ_frequencylist_suw_ver1_0.zip';
  const got = fetchTo(url, 'bccwj-suw.zip', 90);
  if (got?.path && existsSync(got.path)) {
    const raw = readFileSync(got.path);
    sources.push({
      sourceId: 'ninjal-bccwj-suw', sourceFamily: 'ninjal-bccwj', license: 'permissive',
      attribution: '国立国語研究所『現代日本語書き言葉均衡コーパス』語彙表（研究・教育目的で無償利用可）',
      origin: url, sha256: sha256(raw), bytes: raw.length, retrievedAt, available: true,
      lineage: '均衡コーパスの実測頻度。JLPT出題基準系統とは独立',
      fieldsTaken: ['語彙素', '読み', '頻度'],
      fieldsDeliberatelyNotTaken: ['用例', '書誌情報', 'リストの並びそのもの'],
      note: 'zip取得のみ。展開・統合は次段で行う',
    });
  } else {
    sources.push({
      sourceId: 'ninjal-bccwj-suw', sourceFamily: 'ninjal-bccwj', license: 'permissive',
      attribution: '国立国語研究所『現代日本語書き言葉均衡コーパス』語彙表',
      origin: url, retrievedAt, available: false,
      reason: got?.error ?? 'offline mode',
      note: 'repository.ninjal.ac.jp が応答しないため未取得。取得できたら独立familyとして追加する',
    });
  }
}

// ── 参照専用ソース: 日本語教育語彙表（JEV） ──
// §2の指示どおり reference_only。learnerに見えるDBへは入れない・再配布しない。
// 配布がフォーム申請制のため自動取得はしない（申請は人間が行う）。
sources.push({
  sourceId: 'jev-vocabulary-table',
  sourceFamily: 'jev',
  license: 'reference_only',
  attribution: '日本語教育語彙表（砂川有里子ほか, 科研費基盤研究(A) 23242026）https://jreadability.net/jev/',
  origin: 'https://jreadability.net/jev/',
  retrievedAt,
  available: false,
  reason: 'ダウンロードが申請フォーム経由のため自動取得しない（人間が申請する）',
  usagePolicy: [
    'reference_only：learnerに見えるDBへ入れない',
    '再配布しない',
    '訳・例文・語義・並び順を取り込まない',
    '取得できた場合もレベル判定の「照合材料」としてのみ使い、統計だけを残す',
  ],
  fieldsTaken: [],
  fieldsDeliberatelyNotTaken: ['見出し語リストそのもの', '6段階難易度値', '語義', '用例', '品詞', 'アクセント'],
});

// ── 試験スコープの宣言（§2・§3の判定範囲） ──
// 「N2/N3受験者が出会う語」を頻度上位1万語・常用漢字圏・辞書照合できる内容語と定義する。
// この範囲の外（専門語・固有名詞・古語・当て字）は最初から語彙bankの対象にしない。
const EXAM_SCOPE = {
  maxKanjiGrade: 8,        // 常用漢字圏（8 = 中学以上の常用漢字）
  maxFrequencyRank: 10000, // 頻度順位のあるソースは上位1万語まで（N2語彙規模の上限側）
  requireFrequencyRank: true,
  requireDictionaryEntry: true,
  requireContentWord: true,
};
const EXAM_SCOPE_RANK = EXAM_SCOPE.maxFrequencyRank;

// 頻度順位を持たないソース（辞書のcommonマーカー等）の残差を分類するための参照表
const subtitleRank = new Map();
for (const p of probes) {
  for (const t of p.tokens) {
    if (t.rank != null && t.rank <= EXAM_SCOPE_RANK && !subtitleRank.has(t.surface)) {
      subtitleRank.set(t.surface, t.rank);
    }
  }
}

// ── 飽和判定（§3） ──
// 各プローブを「辞書照合できる日本語語」に限定し、bankに無い語がどれだけ出るかを測る。
const saturation = probes.map((p) => {
  const inScope = [];
  for (const t of p.tokens) {
    const entry = bySurface.get(t.surface);
    if (!entry) continue;                       // 辞書照合できない断片は範囲外
    if (!entry.reading) continue;
    if (!isContentWord(entry)) continue;        // 助詞・助動詞・接辞・固有名詞は語彙bankの担当外
    inScope.push({ ...t, entry });
  }
  const seen = new Set();
  const uniq = inScope.filter((t) => (seen.has(t.surface) ? false : (seen.add(t.surface), true)));
  const already = uniq.filter((t) =>
    haveSurfaceReading.has(`${t.surface}|${t.entry.reading}`) || haveSurface.has(t.surface));
  const missing = uniq.filter((t) => !(
    haveSurfaceReading.has(`${t.surface}|${t.entry.reading}`) || haveSurface.has(t.surface)));
  const byPriority = { core: 0, likely: 0, extended: 0, hold: 0 };
  const sampleNewCore = [];
  for (const t of missing) {
    const pr = predictPriority(t.surface, t.entry);
    byPriority[pr] += 1;
    if (pr === 'core' && sampleNewCore.length < 20) sampleNewCore.push(t.surface);
  }
  const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 10000) / 100);

  // 頻度順があるソースは「頻度帯」で見る。
  // 試験語彙の飽和は「全語彙の飽和」ではなく「学習者が実際に出会う頻度帯の飽和」なので、
  // 上位帯のoverlapを主指標にする（下位帯は N1超・専門語・固有名詞が増える）。
  let byFrequencyBand = null;
  if (uniq.length > 0 && uniq[0].rank !== null) {
    const ranked = uniq.slice().sort((a, b) => a.rank - b.rank);
    const bands = [[1, 2000], [2001, 4000], [4001, 6000], [6001, 10000], [10001, Infinity]];
    byFrequencyBand = bands.map(([lo, hi]) => {
      const inBand = ranked.filter((t) => t.rank >= lo && t.rank <= hi);
      const hit = inBand.filter((t) =>
        haveSurfaceReading.has(`${t.surface}|${t.entry.reading}`) || haveSurface.has(t.surface));
      return {
        band: hi === Infinity ? `${lo}-` : `${lo}-${hi}`,
        words: inBand.length,
        inBank: hit.length,
        overlapPct: pct(hit.length, inBand.length),
        missingSample: inBand.filter((t) => !(
          haveSurfaceReading.has(`${t.surface}|${t.entry.reading}`) || haveSurface.has(t.surface)))
          .slice(0, 12).map((t) => t.surface),
      };
    });
  }
  // §3のしきい値は「試験スコープ内」で判定する。
  // 頻度上位1万語の外（専門語・固有名詞・古語）は最初からbankの対象外だと宣言しているため、
  // そこを含めた数字で「飽和した／しない」を語らない。
  const inExamScope = uniq[0]?.rank != null
    ? uniq.filter((t) => t.rank <= EXAM_SCOPE_RANK)
    : uniq;
  const scopeHit = inExamScope.filter((t) =>
    haveSurfaceReading.has(`${t.surface}|${t.entry.reading}`) || haveSurface.has(t.surface));
  const scopeMissing = inExamScope.filter((t) => !(
    haveSurfaceReading.has(`${t.surface}|${t.entry.reading}`) || haveSurface.has(t.surface)));
  const scopeByPriority = { core: 0, likely: 0, extended: 0, hold: 0 };
  for (const t of scopeMissing) scopeByPriority[predictPriority(t.surface, t.entry)] += 1;
  const scopeOverlap = pct(scopeHit.length, inExamScope.length);

  // 未収録語の内訳。「本当に足りない語」と「表記ゆれ」「頻度スコープ外」を分ける
  const variants = scopeMissing.filter((t) => haveReading.has(t.entry.reading));
  const trulyNew = scopeMissing.filter((t) => !haveReading.has(t.entry.reading));
  const trulyNewInTop10k = trulyNew.filter((t) => subtitleRank.has(t.surface));
  const scopeOverlapWithVariants = pct(scopeHit.length + variants.length, inExamScope.length);

  return {
    sourceId: p.sourceId,
    probeTokens: p.tokens.length,
    dictionaryVerifiable: uniq.length,
    alreadyInBank: already.length,
    missingFromBank: missing.length,
    overlapPctAllRanks: pct(already.length, uniq.length),
    newByPredictedPriorityAllRanks: byPriority,
    byFrequencyBand,
    sampleNewCore,
    // ── 判定に使うのはここから（試験スコープ内） ──
    examScope: {
      words: inExamScope.length,
      inBank: scopeHit.length,
      missing: scopeMissing.length,
      overlapPct: scopeOverlap,
      newByPredictedPriority: scopeByPriority,
      newCorePctOfCurrentCore: pct(scopeByPriority.core, currentCore),
      newLikelyPctOfCurrentLikely: pct(scopeByPriority.likely, currentLikely),
      missingSample: scopeMissing.slice(0, 25).map((t) => t.surface),
      // 未収録の内訳
      orthographicVariants: variants.length,
      trulyNewWords: trulyNew.length,
      trulyNewWithinTop10kFrequency: trulyNewInTop10k.length,
      overlapPctCountingVariants: scopeOverlapWithVariants,
      trulyNewSample: trulyNew.slice(0, 25).map((t) => t.surface),
    },
    rankable: uniq[0]?.rank != null,
    passOverlap: scopeOverlapWithVariants >= 90,
    passNewCore: pct(scopeByPriority.core, currentCore) < 1,
    passNewLikely: pct(trulyNew.length, currentLikely) < 2,
  };
});

// ── 独立ソースを候補層へ取り込む（§2）──
// 全語を入れると N1超・専門語・固有名詞でbankが膨らみ、N2/N3の焦点がぼやける。
// **試験スコープのフィルタ**を通した語だけを候補にし、除外理由も残す。
const kanjiGradeMax = (surface) => {
  const g = [...surface].filter((c) => /[一-鿿]/.test(c))
    .map((c) => kanjiGrade[c]).filter((x) => typeof x === 'number');
  return g.length > 0 ? Math.max(...g) : 0;
};

// 注意: ここは「bankに無い語だけ」を出してはいけない。
// 出力はソースの再現可能なスナップショットであり、bankとの差分ではない
// （差分にすると、bank再生成のたびに候補が消えて元に戻せなくなる）。
// 既存語と重なる行は build 側で union され、sourceFamilyCount（＝根拠の独立数）を押し上げる。
const independentCandidates = [];
const excluded = { rareKanji: 0, noFrequencyRank: 0, lowFrequency: 0, noEntry: 0 };
let overlapWithBank = 0;
const notMerged = [];
for (const p of probes) {
  // 頻度順位を持たないソースは候補へ入れない。
  // 「辞書がcommonとする語」を全部入れると3万語規模になり、N2/N3の焦点が崩れるうえ
  // どれがN2圏でどれがN1超かを裏づけなしに決めることになる（§5に反する）。
  if (!p.tokens.some((t) => t.rank !== null)) {
    notMerged.push({
      sourceId: p.sourceId,
      reason: '頻度順位を持たないため試験スコープを裏づけできない。飽和プローブとしてのみ使用する',
      probeSize: p.tokens.length,
    });
    excluded.noFrequencyRank += p.tokens.length;
    continue;
  }
  const seen = new Set();
  for (const t of p.tokens) {
    const entry = bySurface.get(t.surface);
    if (!entry || !entry.reading || !isContentWord(entry)) { excluded.noEntry += 1; continue; }
    if (seen.has(t.surface)) continue;
    seen.add(t.surface);
    if (haveSurfaceReading.has(`${t.surface}|${entry.reading}`) || haveSurface.has(t.surface)) {
      overlapWithBank += 1;   // 除外しない。独立根拠として重ねる
    }
    if (t.rank > EXAM_SCOPE.maxFrequencyRank) { excluded.lowFrequency += 1; continue; }
    if (kanjiGradeMax(t.surface) > EXAM_SCOPE.maxKanjiGrade) { excluded.rareKanji += 1; continue; }
    independentCandidates.push({
      surface: t.surface,
      reading: entry.reading,
      // 独立ソースはJLPTレベルを主張しない。レベルは独自判定に委ねる（§5）
      sourceSuggestedLevel: null,
      sourceId: p.sourceId,
      sourceFamily: p.sourceId === 'opensubtitles-ja-50k' ? 'opensubtitles-opus' : 'jmdict',
      sourcePosition: t.rank,
      retrievedAt,
    });
  }
}
// 元リストの順番を canonical へ引き継がない（読み順で安定ソート・§3B）
independentCandidates.sort((a, b) => (a.reading === b.reading
  ? a.surface.localeCompare(b.surface, 'ja')
  : a.reading.localeCompare(b.reading, 'ja')));

const report = {
  generatedAt: retrievedAt,
  purpose: '独立系統のソースを当てて、語彙候補の収集が飽和しているかを実測する（§2・§3）',
  thresholds: {
    newCorePctOfCurrentCore: '< 1%',
    newLikelyPctOfCurrentLikely: '< 2%',
    overlapPct: '>= 90%',
    note: 'すべての独立ソースで3条件を満たしたときに限り「候補収集は飽和」と表現する',
  },
  bankSnapshot: {
    canonicalWords: bank.words.length,
    core: currentCore,
    likely: currentLikely,
    hold: bank.words.filter((w) => w.priority === 'hold').length,
    existingFamilies: [...new Set(bank.words.flatMap((w) => w.sourceEvidence.map((e) => e.sourceFamily)))],
  },
  sources,
  saturation,
  examScopeFilter: EXAM_SCOPE,
  merged: {
    newCandidates: independentCandidates.length,
    bySourceId: independentCandidates.reduce((acc, c) => {
      acc[c.sourceId] = (acc[c.sourceId] ?? 0) + 1; return acc;
    }, {}),
    overlapWithCurrentBank: overlapWithBank,
    excluded,
    notMerged,
    note: '除外語は捨てていない。除外理由つきでこのレポートに残す（後から基準を変えれば復帰できる）',
  },
  verdict: {
    // 頻度順位が取れるソースで、試験スコープ内の3条件をすべて満たしたか
    saturatedWithinExamScope: saturation.length > 0 && saturation.every((s) =>
      s.examScope.newCorePctOfCurrentCore < 1
      && pctOf(s.examScope.trulyNewWithinTop10kFrequency, currentLikely) < 2
      && (!s.rankable || s.examScope.overlapPctCountingVariants >= 90)),
    // 頻度スコープを外した生の数字でも3条件を満たすか（こちらは満たさなくても良い）
    saturatedAllRanks: saturation.length > 0
      && saturation.every((s) => s.passOverlap && s.passNewCore && s.passNewLikely),
    provisional: true,
    provisionalReason: 'NINJAL BCCWJ語彙表と日本語教育語彙表を未取得のため、独立ソースは2系統にとどまる。'
      + '2系統での飽和は示せたが、系統数としては最小限である',
    interpretation: '宣言した試験スコープ（頻度上位1万語・常用漢字圏・辞書照合できる内容語）の内側では、'
      + '独立ソースを当てても新語はほぼ出ない。スコープ外（頻度1万位以降・専門語・固有名詞・当て字）は'
      + '最初から語彙bankの対象にしていない。公式の出題基準をすべて満たしたとは主張しない。',
  },
  unavailableSources: sources.filter((s) => s.available === false).map((s) => ({
    sourceId: s.sourceId, reason: s.reason,
  })),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/vocab-independent-sources.json`, JSON.stringify({ generatedAt: retrievedAt, sources }, null, 1));
writeFileSync(`${OUT}/vocab-saturation-report.json`, JSON.stringify(report, null, 1));
writeFileSync(`${OUT}/vocab-candidates-independent.json`, JSON.stringify({
  generatedAt: retrievedAt,
  policy: 'surface/reading/出典のみ。レベル主張は取らない（独自判定に委ねる）。訳・例文・解説・問題は取得しない。',
  examScopeFilter: EXAM_SCOPE,
  sources: sources.filter((s) => s.available),
  totals: { candidateRows: independentCandidates.length },
  candidates: independentCandidates,
}, null, 1));

console.log('sources:');
for (const s of sources) console.log(`  ${s.available ? 'OK  ' : 'MISS'} ${s.sourceId} [${s.sourceFamily}/${s.license}]${s.available ? '' : ` — ${s.reason}`}`);
console.log('saturation:');
for (const s of saturation) {
  const e = s.examScope;
  console.log(`  ${s.sourceId}: 全体 verifiable=${s.dictionaryVerifiable} overlap=${s.overlapPctAllRanks}%`);
  console.log(`      試験スコープ内: ${e.inBank}/${e.words} = ${e.overlapPct}%（表記ゆれ込み ${e.overlapPctCountingVariants}%）`);
  console.log(`      未収録 ${e.missing} = 表記ゆれ ${e.orthographicVariants} + 新語 ${e.trulyNewWords}`
    + `（うち頻度上位1万語内 ${e.trulyNewWithinTop10kFrequency}）  newCore=${e.newByPredictedPriority.core} `
    + `pass=${s.passOverlap && s.passNewCore && s.passNewLikely}`);
  if (e.trulyNewSample.length > 0) console.log(`      新語の例: ${e.trulyNewSample.slice(0, 15).join('・')}`);
  for (const b of s.byFrequencyBand ?? []) {
    console.log(`      rank ${b.band}: ${b.inBank}/${b.words} = ${b.overlapPct}%  missing e.g. ${b.missingSample.slice(0, 6).join('・')}`);
  }
}
console.log(`試験スコープ内の飽和=${report.verdict.saturatedWithinExamScope} / 全頻度帯=${report.verdict.saturatedAllRanks}（暫定: ${report.verdict.provisionalReason}）`);
