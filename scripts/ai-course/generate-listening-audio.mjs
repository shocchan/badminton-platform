// 聴解の音声asset生成pipeline（COMPLETION §7）。
//
// 方式: macOS 内蔵の日本語TTS（say -v Kyoko）→ AIFF → afconvert で m4a(AAC)。
//   - ブラウザ依存の不安定TTSに頼らず、**生成済みassetをリポジトリへ置く**
//   - 生成は決定的（同じ原稿なら同じ音声）。CIのない環境でも再現できる
//   - 失敗した set は manifest に載せない → runtime が出題しない（HOLD）
//
// 実行:
//   node scripts/ai-course/generate-listening-audio.mjs           … 未生成分のみ作る
//   node scripts/ai-course/generate-listening-audio.mjs --force   … 全部作り直す
//   node scripts/ai-course/generate-listening-audio.mjs --verify  … 生成せず実在と長さだけ検査
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'public/audio/ai-course';
const MANIFEST = 'docs/ai-course/adventure-v2/generated/audio-manifest.json';
const VOICE = 'Kyoko';       // ja_JP。全setで統一（読み手の差で難易度が変わらないように）
const RATE = 175;            // words per minute 相当。JLPT聴解に近い自然な速さ
const FORCE = process.argv.includes('--force');
const VERIFY_ONLY = process.argv.includes('--verify');

/**
 * TTSが誤読する表記だけを、**読み上げ用テキストでのみ**置き換える。
 * 画面に出す原稿（transcriptJa）は自然な日本語表記のまま残す。
 *
 * 実測（say -v Kyoko の出力ハッシュで確認）:
 *   十分 → じゅうぶん（「10分」の意図なのに"充分"と読まれる）
 *   一日 → ついたち  （「いちにち」の意図なのに"1日(月初)"と読まれる）
 *   一行 → いっこう  （「いちぎょう」の意図なのに"一行(いっこう)"と読まれる）
 *
 * 前に数字・漢数字が付く「三十分」「十一日」は正しく読まれるので置換しない。
 */
const READING_FIXES = [
  [/(?<![0-9０-９一二三四五六七八九十百千])十分/g, 'じゅっぷん'],
  [/(?<![0-9０-９十一二三四五六七八九])一日/g, 'いちにち'],
  [/(?<![0-9０-９])一行/g, 'いちぎょう'],
];

/**
 * transcript から読み上げ用テキストを作る。話者記号は読ませない。
 *
 * 話者ラベルの取りこぼしがあると、片方の話者にだけ「きょういん」「かちょう」が
 * 音声へ混入して不自然になる（Pilotサンプル監査 L-P0-3）。
 * 「〜「」の形をとる語はすべて話者として扱う。
 */
const SPEAKERS = [
  '男', '女', '先生', '店員', '客', '係', '上司', '部下', '学生', '店長',
  '教員', '担当', '課長', '部長', '先輩', '後輩', '相談員', '社員', '職員',
  '医師', '看護師', '受付', '窓口', '案内', '講師', '司会', '母', '父', '友人',
];
const toSpeech = (transcript) => transcript
  .replace(/男１|女１/g, '')
  .replace(/男２|女２/g, '')
  .replace(/学生１|学生２/g, '')
  .replace(new RegExp(`(${SPEAKERS.join('|')})「`, 'g'), '。')
  .replace(/」/g, '。')
  .replace(/。+/g, '。')
  .replace(READING_FIXES[0][0], READING_FIXES[0][1])
  .replace(READING_FIXES[1][0], READING_FIXES[1][1])
  .replace(READING_FIXES[2][0], READING_FIXES[2][1])
  .trim();

const durationOf = (file) => {
  try {
    const out = execFileSync('afinfo', [file], { encoding: 'utf8' });
    const m = out.match(/estimated duration:\s*([\d.]+)\s*sec/);
    return m ? Math.round(parseFloat(m[1]) * 10) / 10 : 0;
  } catch { return 0; }
};

const loadSets = async () => {
  // TSデータは vite-node 経由でJSONへ落としたものを使う（このscriptは素のnodeで動かす）
  const dump = 'docs/ai-course/adventure-v2/generated/listening-sets.json';
  if (!existsSync(dump)) {
    console.error(`missing ${dump}. run: ./node_modules/.bin/vite-node scripts/ai-course/dump-listening-sets.ts`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(dump, 'utf8'));
};

const run = async () => {
  const sets = await loadSets();
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });

  const entries = [];
  const failures = [];
  for (const s of sets) {
    const m4a = join(OUT_DIR, `${s.setId}.m4a`);
    const needsBuild = FORCE || !existsSync(m4a);
    if (VERIFY_ONLY) {
      if (!existsSync(m4a)) { failures.push({ setId: s.setId, reason: 'missing_asset' }); continue; }
    } else if (needsBuild) {
      const aiff = join(OUT_DIR, `${s.setId}.aiff`);
      try {
        execFileSync('say', ['-v', VOICE, '-r', String(RATE), '-o', aiff, toSpeech(s.transcriptJa)]);
        execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', aiff, m4a]);
        rmSync(aiff, { force: true });
      } catch (e) {
        failures.push({ setId: s.setId, reason: `tts_failed: ${String(e).slice(0, 80)}` });
        continue;
      }
    }
    const bytes = existsSync(m4a) ? statSync(m4a).size : 0;
    const duration = durationOf(m4a);
    // 極端に短い＝読み上げ失敗の疑い（発音smokeの一部）。
    // 即時応答は一文だけなので下限を別に持つ（他の型と同じ閾値だと正常な音声を落としてしまう）
    const minSec = s.listeningType === 'quickResponse' ? 1.0 : 5.0;
    // 文字数に対して極端に短い場合も読み上げ失敗を疑う（1文字0.06秒未満）
    const tooFastForText = duration < s.transcriptJa.length * 0.06;
    if (bytes < 3000 || duration < minSec || tooFastForText) {
      failures.push({ setId: s.setId, reason: `too_short bytes=${bytes} dur=${duration} chars=${s.transcriptJa.length}` });
      continue;
    }
    entries.push({
      setId: s.setId,
      level: s.sourceLevel,
      listeningType: s.listeningType,
      path: `/audio/ai-course/${s.setId}.m4a`,
      bytes,
      durationSeconds: duration,
      voice: VOICE,
      rate: RATE,
      charCount: s.transcriptJa.length,
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    voice: VOICE, rate: RATE, format: 'm4a/aac 64kbps',
    total: sets.length,
    available: entries.length,
    failures,
    pass: failures.length === 0,
    entries,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`sets=${sets.length} audio=${entries.length} failures=${failures.length}`);
  if (failures.length > 0) console.error(failures.slice(0, 10));
  const totalSec = entries.reduce((n, e) => n + e.durationSeconds, 0);
  console.log(`total audio ${Math.round(totalSec)}s / avg ${(totalSec / Math.max(1, entries.length)).toFixed(1)}s`);
  console.log(`result: ${manifest.pass ? 'PASS' : 'FAIL'}`);
  if (!manifest.pass) process.exit(1);
};

void run();
