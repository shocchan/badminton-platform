// A層: 公開データからの語彙候補収集（HARVESTING POLICY §1A・§2・§3）。
//
// 方針:
// - 取るのは **surface / reading / sourceSuggestedLevel / 出典情報** のみ。
//   訳・例文・解説・問題は取らない（層Cは独自作成する）。
// - 同一原典から派生した複数repositoryを独立根拠として数えないため sourceFamily で束ねる。
// - 元リストの順番は sourcePosition に記録するだけで、canonical の並びには使わない。
// - 生データはリポジトリへ入れない（scratchpadで処理し、派生物のみ保存する）。
//
// 実行: node scripts/ai-course/harvest-vocab-candidates.mjs [--offline]
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const WORK = process.env.HARVEST_WORK_DIR
  || '/private/tmp/claude-501/-Users-shocchan-ai-company/ca909b0c-621c-47d2-a80a-8dfb7b3ec661/scratchpad/vocab-harvest';
const OUT = 'docs/ai-course/adventure-v2/generated';
const OFFLINE = process.argv.includes('--offline');
const retrievedAt = new Date().toISOString();

mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const fetchTo = (url, file) => {
  const path = join(WORK, file);
  if (existsSync(path)) return path;
  if (OFFLINE) return null;
  execFileSync('curl', ['-sSL', '-m', '120', '-o', path, url]);
  return path;
};

const sources = [];
const candidates = [];
const add = (surface, reading, level, sourceId, sourceFamily, pos) => {
  if (!surface || !reading) return;
  candidates.push({
    surface: surface.trim(), reading: reading.trim(),
    sourceSuggestedLevel: level, sourceId, sourceFamily,
    sourcePosition: pos, retrievedAt,
  });
};

// ── source family 1: 一般に流通するJLPT語彙リスト（多数の派生repoの代表1件） ──
// MITの編集物。**表記・読み・レベルのみ**を取り、meaning列は取らない。
const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];
for (const lv of LEVELS) {
  const p = fetchTo(
    `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/${lv}.csv`,
    `jlpt-${lv}.csv`,
  );
  if (!p) continue;
  const rows = readFileSync(p, 'utf8').split('\n').slice(1);
  rows.forEach((line, i) => {
    if (!line.trim()) return;
    // CSV: expression,reading,meaning,tags,guid  → meaning以降は読み捨てる
    const m = line.match(/^([^,]*),([^,]*),/);
    if (!m) return;
    add(m[1], m[2] || m[1], lv.toUpperCase(), `openanki-jlpt-${lv}`, 'tanos-waller', i);
  });
  sources.push({
    sourceId: `openanki-jlpt-${lv}`, sourceFamily: 'tanos-waller', license: 'permissive',
    origin: `https://github.com/jamsinclair/open-anki-jlpt-decks/blob/main/src/${lv}.csv`,
    retrievedAt,
    fieldsTaken: ['expression(surface)', 'reading', 'level(tag)'],
    fieldsDeliberatelyNotTaken: ['meaning', 'tags(guid)', 'card ordering', 'deck arrangement'],
    note: '一般に流通するJLPT語彙リストの派生。sourceFamilyで1根拠として扱う（§2）',
  });
}

// ── source family 2: JMdict（EDRDG・CC BY-SA）──
// 読み・品詞・語義数・頻度マーカー。**英訳文そのものは保存しない**（語義の数と品詞のみ使う）
const jmTgz = fetchTo(
  'https://github.com/scriptin/jmdict-simplified/releases/latest/download/jmdict-eng-common-3.6.2+20260727141257.json.tgz',
  'jmdict-common.json.tgz',
);
let jmdict = null;
if (jmTgz) {
  const jsonPath = join(WORK, 'jmdict-common.json');
  if (!existsSync(jsonPath)) {
    execFileSync('tar', ['-xzf', jmTgz, '-C', WORK]);
    const listed = execFileSync('sh', ['-c', `ls ${WORK}/jmdict-eng-common*.json 2>/dev/null | head -1`], { encoding: 'utf8' }).trim();
    if (listed) execFileSync('mv', [listed, jsonPath]);
  }
  if (existsSync(jsonPath)) {
    jmdict = JSON.parse(readFileSync(jsonPath, 'utf8'));
    sources.push({
      sourceId: 'jmdict-eng-common', sourceFamily: 'jmdict', license: 'attribution_share',
      origin: 'https://github.com/scriptin/jmdict-simplified (JMdict © EDRDG, CC BY-SA 4.0)',
      retrievedAt,
      fieldsTaken: ['kanji surface', 'kana reading', 'partOfSpeech', 'sense count', 'priority markers'],
      fieldsDeliberatelyNotTaken: ['English glosses (訳文)', 'example sentences'],
      note: '読み・品詞・語義分離・頻度の裏づけに使う。訳文は保存しない',
    });
  }
}

// ── source family 3: KANJIDIC2（EDRDG・CC BY-SA）──
const kdTgz = fetchTo(
  'https://github.com/scriptin/jmdict-simplified/releases/latest/download/kanjidic2-en-3.6.2+20260727141257.json.tgz',
  'kanjidic2.json.tgz',
);
let kanjidic = null;
if (kdTgz) {
  const jsonPath = join(WORK, 'kanjidic2.json');
  if (!existsSync(jsonPath)) {
    execFileSync('tar', ['-xzf', kdTgz, '-C', WORK]);
    const listed = execFileSync('sh', ['-c', `ls ${WORK}/kanjidic2-en*.json 2>/dev/null | head -1`], { encoding: 'utf8' }).trim();
    if (listed) execFileSync('mv', [listed, jsonPath]);
  }
  if (existsSync(jsonPath)) {
    kanjidic = JSON.parse(readFileSync(jsonPath, 'utf8'));
    sources.push({
      sourceId: 'kanjidic2-en', sourceFamily: 'kanjidic2', license: 'attribution_share',
      origin: 'https://github.com/scriptin/jmdict-simplified (KANJIDIC2 © EDRDG, CC BY-SA 4.0)',
      retrievedAt,
      fieldsTaken: ['kanji character', 'grade', 'stroke count', 'frequency'],
      fieldsDeliberatelyNotTaken: ['English meanings', 'reading lists'],
      note: '漢字難易度（学年）を独自レベル判定の材料にする',
    });
  }
}

// ── 出力 ──
// canonicalの並びに元リスト順を引き継がないため、読み順で安定ソートしてから保存する（§3B）
candidates.sort((a, b) => (a.reading === b.reading
  ? a.surface.localeCompare(b.surface, 'ja')
  : a.reading.localeCompare(b.reading, 'ja')));

const byFamily = {};
for (const c of candidates) byFamily[c.sourceFamily] = (byFamily[c.sourceFamily] ?? 0) + 1;

writeFileSync(join(OUT, 'vocab-candidates.json'), JSON.stringify({
  generatedAt: retrievedAt,
  policy: 'surface/reading/levelのみ収集。訳・例文・解説・問題は取得しない。元リストの順番はcanonicalへ引き継がない。',
  sources,
  totals: {
    candidateRows: candidates.length,
    byFamily,
    uniqueSurface: new Set(candidates.map((c) => c.surface)).size,
    uniqueSurfaceReading: new Set(candidates.map((c) => `${c.surface}|${c.reading}`)).size,
  },
  candidates,
}, null, 1));

// JMdict / KANJIDIC2 は巨大なので、必要な最小限だけ派生ファイルへ落とす
if (jmdict) {
  const idx = {};
  for (const w of jmdict.words) {
    const kanji = (w.kanji ?? []).filter((k) => !k.tags?.includes('rK'));
    const kana = w.kana ?? [];
    const surfaces = kanji.length > 0 ? kanji.map((k) => k.text) : kana.map((k) => k.text);
    const reading = kana[0]?.text ?? '';
    const pos = [...new Set((w.sense ?? []).flatMap((s) => s.partOfSpeech ?? []))];
    const senseCount = (w.sense ?? []).length;
    const common = [...kanji, ...kana].some((e) => (e.common === true) || (e.tags ?? []).some((t) => /^(news|ichi|spec|gai)/.test(t)));
    for (const s of surfaces) {
      const key = `${s}|${reading}`;
      if (!idx[key]) idx[key] = { surface: s, reading, pos, senseCount, common, aliases: surfaces.filter((x) => x !== s) };
    }
  }
  writeFileSync(join(OUT, 'vocab-jmdict-index.json'), JSON.stringify({
    generatedAt: retrievedAt,
    note: 'JMdict由来の読み・品詞・語義数・頻度のみ。英訳文は含まない（CC BY-SA / © EDRDG）',
    entries: idx,
  }));
}
if (kanjidic) {
  const grades = {};
  for (const c of kanjidic.characters ?? []) {
    if (c.misc?.grade != null) grades[c.literal] = c.misc.grade;
  }
  writeFileSync(join(OUT, 'vocab-kanji-grade.json'), JSON.stringify({
    generatedAt: retrievedAt,
    note: 'KANJIDIC2の学年配当のみ（CC BY-SA / © EDRDG）',
    grades,
  }));
}

console.log(`candidates=${candidates.length} uniqueSurfaceReading=${new Set(candidates.map((c) => `${c.surface}|${c.reading}`)).size}`);
console.log('byFamily', byFamily);
console.log(`sources=${sources.length}`, sources.map((s) => s.sourceId).join(', '));
console.log(`jmdict=${jmdict ? Object.keys(jmdict.words).length : 'skipped'} kanjidic=${kanjidic ? (kanjidic.characters ?? []).length : 'skipped'}`);
