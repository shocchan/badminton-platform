// 目標レベル別に「冒険マップに出る地域」がどう変わるかを並べる（確認用の使い捨て）
import { generateRoute } from '../../src/lib/aiLesson/course/adventure/advRoute';
import { buildAdventureMap } from '../../src/lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../src/lib/aiLesson/course/adventure/advProfile';
import { unmeasuredDiagnosis } from '../../src/lib/aiLesson/course/adventure/advDiagnosis';

const now = '2026-08-22T00:00:00.000Z';
for (const target of ['N5', 'N4', 'N3', 'N2'] as const) {
  const diagnosis = unmeasuredDiagnosis({ targetJlpt: target, goalType: 'jlpt', nowISO: now });
  const route = generateRoute({
    goalType: 'jlpt', targetJlpt: target, knowledgeBand: diagnosis.knowledgeBand,
    conversationBand: diagnosis.conversationBand, diagnosis, nowISO: now,
  });
  const prof = { ...defaultAdvProfile(now), goalType: 'jlpt' as const, targetJlpt: target, route, diagnosis };
  const map = buildAdventureMap(prof, route, new Set<string>(), 1, 'combined', now);
  console.log(`\n=== ${target} ===  目的地: ${route.destinationLabelJa}  stage数: ${route.stages.length}`);
  console.log('stages:', route.stages.map((s) => s.titleJa).join(' → '));
  const exam = map.regions.filter((r) => r.layer === 'exam');
  const conv = map.regions.filter((r) => r.layer === 'conversation');
  console.log(`地域: 試験${exam.length} / 会話${conv.length}`);
  console.log(exam.map((r) => `${r.nameJa}(${r.chapterJa})`).join(' → '));
}
