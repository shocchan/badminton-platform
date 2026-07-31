// @vitest-environment jsdom
// ことば vs しくみ 比較UI（Home比較カード・ガイド・入口ヘッダー）のテスト（§15）。
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { aiCourseI18n } from '../../locales/aiCourse';
import { FoundationLabHeader } from './foundation/FoundationLabHeader';
import { VocabularyHubHeader } from './foundation/vocab/VocabularyHubHeader';
import { vocabCanonicalStats } from '../../lib/aiLesson/course/vocabCanonical';
import { FOUNDATION_UNIT_META } from '../../lib/aiLesson/course/foundationRegistry';

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); window.sessionStorage.clear(); });
const t = aiCourseI18n.ja;
const tz = aiCourseI18n.zh;

describe('しくみトップheader（FoundationLabHeader）', () => {
  it('役割・範囲(実単元数)・進捗・例・ソラノ塔関係・工房併記を表示（ja）', () => {
    render(<FoundationLabHeader t={t} unitsTotal={FOUNDATION_UNIT_META.length} unitsDone={2} />);
    expect(screen.getByText(t.hubRoles.labRole)).toBeTruthy();
    expect(screen.getByText(t.hubRoles.labRoleSub)).toBeTruthy();
    expect(screen.getByText(t.hubRoles.labScope(6))).toBeTruthy();
    expect(screen.getByText(t.hubRoles.labProgress(2, 6))).toBeTruthy();
    expect(screen.getByText(new RegExp(t.hubRoles.labExample))).toBeTruthy();
    expect(screen.getByText(t.hubRoles.labVsSorano)).toBeTruthy();
    expect(screen.getByText(t.hubRoles.labAdvanced)).toBeTruthy();
    expect(screen.getByText(new RegExp(t.world.facilities.workshop.name))).toBeTruthy();
  });
  it('zhでも表示され、学習対象の日本語（例文）は日本語のまま', () => {
    render(<FoundationLabHeader t={tz} unitsTotal={6} unitsDone={0} />);
    expect(screen.getByText(tz.hubRoles.labRole)).toBeTruthy();
    expect(screen.getByText(new RegExp('会社で働きます'))).toBeTruthy(); // 例中の日本語は維持
  });
});

describe('ことばトップの役割一文（VocabularyHubHeader）', () => {
  const stats = vocabCanonicalStats();
  const counts = { unseen: stats.total, learning: 0, reviewing: 0, retained_candidate: 0 };
  const completion = { requiredConfirmed: 0, requiredTotal: stats.roles.required, highRiskConfirmed: 0, highRiskTotal: stats.highRisk, requiredUsed: 0, requiredReviewConnected: 0, complete: false };
  it('役割一文＋例＋しくみとの違い1行が既存scopeの上に出る', () => {
    render(<VocabularyHubHeader t={t} stats={stats} stateCounts={counts} completion={completion} tier="beginner" />);
    expect(screen.getByText(t.hubRoles.vocabRole)).toBeTruthy();
    expect(screen.getByText(new RegExp(t.hubRoles.vocabExample))).toBeTruthy();
    expect(screen.getByText(t.vocabScope.scopeTitle)).toBeTruthy(); // 既存scopeは維持
  });
});
