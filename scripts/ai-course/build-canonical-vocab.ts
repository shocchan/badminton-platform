// B層: 候補 → kawabado独自の正準語彙bank（HARVESTING POLICY §1B・§4・§5・§6）。
//
// 鉄則:
// - sourceSuggestedLevel をそのまま canonical level にしない。複数材料から独自に再判定する。
// - 同一原典の派生を独立根拠として数えない（sourceFamilyCount）。
// - 元リストの順番を引き継がない（読み順で安定ソート）。
// - 検証できない語は hold にして active 出題へ回さない。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/build-canonical-vocab.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';
import { N3_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n3GrammarDrafts';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../../src/lib/aiLesson/course/n2GrammarDraftChunks';
import { ALL_READING_SETS } from '../../src/lib/aiLesson/course/adventure/reading/readingBank';
import { ALL_LISTENING_SETS } from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';
import type {
  CanonicalVocabWord, JlptLevelTag, SourceEvidence, VocabPriority, VocabSense,
} from '../../src/lib/aiLesson/course/adventure/vocab/vocabTypes';

const OUT = 'docs/ai-course/adventure-v2/generated';
const LEVEL_ORDER: JlptLevelTag[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
const levelIdx = (l: JlptLevelTag) => LEVEL_ORDER.indexOf(l);

interface RawCandidate {
  surface: string; reading: string;
  sourceSuggestedLevel: JlptLevelTag | null;
  sourceId: string; sourceFamily: string; sourcePosition: number | null; retrievedAt: string;
}
interface JmEntry { surface: string; reading: string; pos: string[]; senseCount: number; common: boolean; aliases: string[] }

const run = async () => {
  const candPath = `${OUT}/vocab-candidates.json`;
  if (!existsSync(candPath)) {
    console.error('run harvest-vocab-candidates.mjs first'); process.exit(2);
  }
  const cand = JSON.parse(readFileSync(candPath, 'utf8')) as { candidates: RawCandidate[] };
  // 独立ソース（字幕コーパス頻度ほか・§2）。無ければ従来どおり動く
  const indepPath = `${OUT}/vocab-candidates-independent.json`;
  const independent: RawCandidate[] = existsSync(indepPath)
    ? (JSON.parse(readFileSync(indepPath, 'utf8')) as { candidates: RawCandidate[] }).candidates
    : [];
  const jm: Record<string, JmEntry> = existsSync(`${OUT}/vocab-jmdict-index.json`)
    ? JSON.parse(readFileSync(`${OUT}/vocab-jmdict-index.json`, 'utf8')).entries : {};
  const kanjiGrade: Record<string, number> = existsSync(`${OUT}/vocab-kanji-grade.json`)
    ? JSON.parse(readFileSync(`${OUT}/vocab-kanji-grade.json`, 'utf8')).grades : {};

  // ── 自社教材のテキストを集めて出現回数を数える（独自レベル判定の材料・§5） ──
  const internalTexts: string[] = [];
  for (const v of allVocabularyItems() as unknown as Record<string, unknown>[]) {
    internalTexts.push(String(v.lemma ?? ''), String(v.exampleJa ?? ''));
  }
  const n2: Record<string, unknown>[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) n2.push(...(await loadN2DraftUnitFile(no)) as unknown as Record<string, unknown>[]);
  for (const d of [...(N3_GRAMMAR_DRAFTS as unknown as Record<string, unknown>[]), ...n2]) {
    internalTexts.push(...((d.examplesJa as string[]) ?? []));
  }
  for (const r of ALL_READING_SETS) internalTexts.push(r.passageJa, r.questionJa, ...r.choices.map((c) => c.textJa));
  for (const l of ALL_LISTENING_SETS) internalTexts.push(l.transcriptJa, l.questionJa, ...l.choices.map((c) => c.textJa));
  const internalBlob = internalTexts.join('\n');
  const existingVocabSurfaces = new Set(
    (allVocabularyItems() as unknown as Record<string, unknown>[]).map((v) => String(v.lemma ?? '')),
  );

  // ── 候補を surface|reading で統合（union）──
  const merged = new Map<string, { surface: string; reading: string; ev: SourceEvidence[]; positions: number[] }>();
  for (const c of [...cand.candidates, ...independent]) {
    const key = `${c.surface}|${c.reading}`;
    const cur = merged.get(key) ?? { surface: c.surface, reading: c.reading, ev: [], positions: [] };
    cur.ev.push({ sourceId: c.sourceId, sourceFamily: c.sourceFamily as SourceEvidence['sourceFamily'], suggestedLevel: c.sourceSuggestedLevel });
    if (c.sourcePosition != null) cur.positions.push(c.sourcePosition);
    merged.set(key, cur);
  }

  // 自社教材にしか無い語も候補へ入れる（§4: 教材内語彙も収集対象）
  for (const v of allVocabularyItems() as unknown as Record<string, unknown>[]) {
    const surface = String(v.lemma ?? ''); const reading = String(v.readingKana ?? '');
    if (!surface || !reading) continue;
    const key = `${surface}|${reading}`;
    if (!merged.has(key)) {
      merged.set(key, {
        surface, reading,
        ev: [{ sourceId: 'kawabado-vocab-140', sourceFamily: 'kawabado-internal', suggestedLevel: null }],
        positions: [],
      });
    } else {
      merged.get(key)!.ev.push({ sourceId: 'kawabado-vocab-140', sourceFamily: 'kawabado-internal', suggestedLevel: null });
    }
  }

  const words: CanonicalVocabWord[] = [];
  const stats = {
    total: 0, byLevel: {} as Record<string, number>, byPriority: {} as Record<string, number>,
    levelConflicts: 0, multiFamily: 0, noJmdict: 0, missingReading: 0, holds: 0,
  };

  let seq = 0;
  for (const [key, m] of merged) {
    seq += 1;
    const jmEntry = jm[key] ?? jm[`${m.surface}|${m.reading}`];
    const kanjiChars = [...m.surface].filter((ch) => /[一-鿿]/.test(ch));
    const grades = kanjiChars.map((ch) => kanjiGrade[ch]).filter((g): g is number => typeof g === 'number');
    const maxKanjiGrade = grades.length > 0 ? Math.max(...grades) : null;
    // 1文字語の部分一致は他語の内部にも当たるため、既存語彙の見出しに一致する場合のみ数える
    const internalOccurrences = m.surface.length >= 2
      ? (internalBlob.split(m.surface).length - 1)
      : (existingVocabSurfaces.has(m.surface) ? 1 : 0);

    // ── レベル根拠 ──
    const suggested = m.ev.map((e) => e.suggestedLevel).filter((l): l is JlptLevelTag => !!l);
    const families = new Set(m.ev.map((e) => e.sourceFamily));
    const sourceFamilyCount = families.size;
    const uniqueSuggested = [...new Set(suggested)];

    // 信号からの推定（sourceに依存しない材料）
    // 漢字学年 1-2=易 / 3-4=中 / 5-6=やや難 / 7+(中学以上)=難、頻度commonは1段易しく寄せる
    let signalIdx: number;
    if (maxKanjiGrade === null) signalIdx = jmEntry?.common ? 0 : 1;          // かな語
    else if (maxKanjiGrade <= 2) signalIdx = 0;
    else if (maxKanjiGrade <= 4) signalIdx = 1;
    else if (maxKanjiGrade <= 6) signalIdx = 2;
    else signalIdx = 3;
    if (jmEntry?.common) signalIdx = Math.max(0, signalIdx - 1);
    if (internalOccurrences >= 3) signalIdx = Math.max(0, signalIdx - 1);

    // sourceの主張（最も易しいレベル＝最初に必要になるレベル）
    const sourceIdx = uniqueSuggested.length > 0
      ? Math.min(...uniqueSuggested.map(levelIdx))
      : null;

    // 独自判定: sourceがあれば source と signal の平均へ寄せる（sourceを鵜呑みにしない）
    // sourceを鵜呑みにしないが、2段以上ずらすと別レベルの語をN2圏へ引き込んでしまう。
    // 独自判定は source から ±1段までに制限する（sourceは根拠であって権威ではない・§5）
    // レベル主張を持つsourceが1つも無い語（独立頻度ソースのみで拾った語）は
    // 「標準的なN5/N4語彙リストに載っていない」ことが判明している語である。
    // それをN5/N4へ落とすと根拠と矛盾するため、下限をN3（idx=2）にする。
    const rawAssigned = sourceIdx === null
      ? Math.min(4, signalIdx + 1)
      : Math.round((sourceIdx * 2 + signalIdx) / 3);
    // ただし自社教材に出ている語は「学習者が実際に出会う語」なので下限を課さない
    const assignedIdx = sourceIdx === null
      ? (internalOccurrences > 0 ? rawAssigned : Math.max(2, rawAssigned))
      : Math.max(sourceIdx - 1, Math.min(sourceIdx + 1, rawAssigned));
    const independentlyAssignedLevel = LEVEL_ORDER[Math.max(0, Math.min(4, assignedIdx))];

    // conflict: sourceが複数レベルを主張、または source と独自判定が2段以上ずれる
    const conflictSources = uniqueSuggested.length > 1 ? uniqueSuggested : [];
    const bigGap = sourceIdx !== null && Math.abs(sourceIdx - assignedIdx) >= 2;
    const levelConflict = (conflictSources.length > 0 || bigGap)
      ? {
        sources: uniqueSuggested,
        alsoRequiredFor: uniqueSuggested.filter((l) => levelIdx(l) > assignedIdx),
      }
      : null;
    if (levelConflict) stats.levelConflicts += 1;
    if (sourceFamilyCount >= 2) stats.multiFamily += 1;
    if (!jmEntry) stats.noJmdict += 1;

    // 信頼度: 複数family一致=high / 単一familyだが信号と一致=medium / 矛盾=low
    const levelConfidence: CanonicalVocabWord['levelConfidence'] =
      sourceFamilyCount >= 2 && !levelConflict ? 'high'
        : (sourceIdx !== null && Math.abs(sourceIdx - signalIdx) <= 1) ? 'medium'
          : 'low';

    // ── 語義（§6）──
    const senseCount = jmEntry?.senseCount ?? 0;
    const senses: VocabSense[] = senseCount > 0
      ? Array.from({ length: Math.min(senseCount, 4) }, (_, i) => ({
        senseId: `${m.surface}-${m.reading}-s${i + 1}`,
        partOfSpeech: jmEntry?.pos ?? [],
        distinguisherJa: i === 0 ? '主要な意味' : `別の意味 ${i + 1}（学習コンテンツは未作成）`,
        hasOriginalContent: false,
      }))
      : [];

    // ── priority（§5）──
    const cumulativeLevel = LEVEL_ORDER.filter((l) => levelIdx(l) >= assignedIdx);
    let priority: VocabPriority;
    const verified = !!jmEntry || internalOccurrences > 0;
    // core は「必ず先に押さえる語」に絞る。部分一致1回だけでcoreにしない
    const strongInternal = m.surface.length >= 2 ? internalOccurrences >= 2 : internalOccurrences >= 1;
    // core は「先に必ず押さえる語」。頻度コーパスだけで拾った語（レベル主張なし）は
    // 自社教材に何度も出ていない限り core にしない＝JLPT語彙リスト由来の語を優先する
    if (!m.reading || !verified) priority = 'hold';
    else if (strongInternal || (sourceIdx !== null && jmEntry?.common && assignedIdx <= 1)) priority = 'core';
    else if (jmEntry?.common || assignedIdx <= 2) priority = 'likely';
    else priority = 'extended';
    if (!m.reading) stats.missingReading += 1;
    if (priority === 'hold') stats.holds += 1;

    const inclusionReason = internalOccurrences > 0
      ? '自社教材（語彙・文法例文・読解本文・聴解原稿）に出現する'
      : jmEntry?.common ? '複数の公開語彙候補にあり、辞書上も頻出語である'
        : jmEntry ? '公開語彙候補にあり、辞書で読み・品詞を確認できた'
          : '公開語彙候補にあるが辞書照合できていない（hold）';

    words.push({
      wordId: `kv-${String(seq).padStart(5, '0')}`,
      canonicalSurface: m.surface,
      aliases: jmEntry?.aliases ?? [],
      reading: m.reading,
      senses,
      independentlyAssignedLevel,
      levelConfidence,
      priority,
      cumulativeLevel,
      sourceEvidence: m.ev,
      sourceFamilyCount,
      inclusionReason,
      levelConflict,
      frequencyRank: jmEntry?.common ? 'common' : jmEntry ? 'uncommon' : 'unknown',
      maxKanjiGrade,
      internalOccurrences,
      reviewState: priority === 'hold' ? 'hold' : 'canonical_draft',
    });
    stats.total += 1;
    stats.byLevel[independentlyAssignedLevel] = (stats.byLevel[independentlyAssignedLevel] ?? 0) + 1;
    stats.byPriority[priority] = (stats.byPriority[priority] ?? 0) + 1;
  }

  // 元リストの順番を引き継がない（読み → 表記の安定ソート）
  words.sort((a, b) => (a.reading === b.reading
    ? a.canonicalSurface.localeCompare(b.canonicalSurface, 'ja')
    : a.reading.localeCompare(b.reading, 'ja')));
  words.forEach((w, i) => { w.wordId = `kv-${String(i + 1).padStart(5, '0')}`; });

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/vocab-canonical.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    description: '複数の主要公開語彙データを統合し、重複・意味・レベルを独自に再整理したN2／N3累積語彙バンク',
    stats,
    words,
  }));

  console.log(`canonical words=${stats.total}`);
  console.log('byLevel', stats.byLevel);
  console.log('byPriority', stats.byPriority);
  console.log(`levelConflicts=${stats.levelConflicts} multiFamily=${stats.multiFamily} noJmdict=${stats.noJmdict} hold=${stats.holds}`);
};

void run();
