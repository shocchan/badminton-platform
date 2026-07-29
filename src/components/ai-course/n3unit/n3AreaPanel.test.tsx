// @vitest-environment jsdom
// エリア画面のUIテスト（FOREST FIRST §7-§8）。
// World Map→エリア→単元→戻る、完了→次エリア、冒険入口を検証する。
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { aiCourseI18n } from '../../../locales/aiCourse';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { N3AreaPanel } from './N3AreaPanel';
import { areaById } from '../../../lib/aiLesson/course/rpg/worldAtlas';
import { localUnitStorageKey } from '../../../lib/aiLesson/course/n3unit/localUnitStorage';
import { emptyRunState } from '../../../lib/aiLesson/course/n3unit/unitRuntime';

afterEach(cleanup);
beforeEach(() => { window.localStorage.clear(); });

const noop = () => {};
const baseProps = { onExit: noop, onOpenArea: noop, onOpenReview: noop };

describe('N3AreaPanel（エリア共通ループ）', () => {
  it('エリアIntroに役割・学習テーマ・人物・実用ミッション・単元一覧を表示する', () => {
    const area = areaById('area05-yukari')!;
    render(<N3AreaPanel t={aiCourseI18n.ja} {...baseProps} area={area} />);
    expect(screen.getByText(area.nameJa)).toBeTruthy();
    expect(screen.getByText(area.storyPurposeJa)).toBeTruthy();
    expect(screen.getByText(area.learningThemeJa)).toBeTruthy();
    expect(screen.getByText(area.characterJa)).toBeTruthy();
    expect(screen.getByText(area.practicalMissionJa)).toBeTruthy();
    expect(screen.getByText('気持ちと様子')).toBeTruthy();
    expect(screen.getByText('人と関係')).toBeTruthy();
  });

  it('単元を開くとN3UnitPanelへ進み、エリアへ戻れる（行き止まりなし）', async () => {
    const area = areaById('area03-toorimichi')!;
    render(<N3AreaPanel t={aiCourseI18n.ja} {...baseProps} area={area} />);
    fireEvent.click(screen.getByText('移動と場所'));
    // 単元画面（storage.load解決後にintroが出る）
    expect(await screen.findByText('この単元について')).toBeTruthy();
    // WorldFrame内にエリア名＋単元名が維持される
    expect(screen.getByText(`${area.nameJa}・移動と場所`)).toBeTruthy();
  });

  it('全単元完了で「霧は晴れました」＋次のエリアへ進める（§8: Area Complete→World change→次Area）', () => {
    const area = areaById('area03-toorimichi')!;
    for (const unitId of area.unitIds) {
      const done = { ...emptyRunState(unitId, 1), phase: 'result' as const, completedAtMs: 2 };
      window.localStorage.setItem(localUnitStorageKey(unitId), JSON.stringify(done));
    }
    const onOpenArea = vi.fn();
    render(<N3AreaPanel t={aiCourseI18n.ja} {...baseProps} area={area} onOpenArea={onOpenArea} />);
    expect(screen.getByText('このエリアの霧は晴れました')).toBeTruthy();
    fireEvent.click(screen.getByText('次のエリアへ進む'));
    expect(onOpenArea).toHaveBeenCalledWith(area.nextAreaId);
  });

  it('完了エリアからオモイデ庭園（復習）へ行ける', () => {
    const area = areaById('area04-ichiba')!;
    for (const unitId of area.unitIds) {
      const done = { ...emptyRunState(unitId, 1), phase: 'result' as const, completedAtMs: 2 };
      window.localStorage.setItem(localUnitStorageKey(unitId), JSON.stringify(done));
    }
    const onOpenReview = vi.fn();
    render(<N3AreaPanel t={aiCourseI18n.ja} {...baseProps} area={area} onOpenReview={onOpenReview} />);
    fireEvent.click(screen.getByText('オモイデ庭園で復習する'));
    expect(onOpenReview).toHaveBeenCalledTimes(1);
  });

  it('エリア1だけ冒険（Chapter 1）の入口があり、押すとonOpenAdventure', () => {
    const area1 = areaById('area01-minato')!;
    const onAdv = vi.fn();
    render(<N3AreaPanel t={aiCourseI18n.ja} {...baseProps} area={area1} onOpenAdventure={onAdv} />);
    fireEvent.click(screen.getByText('第1章「霧の港町」を進める'));
    expect(onAdv).toHaveBeenCalledTimes(1);
    cleanup();
    // 冒険を持たないエリアには入口が出ない
    const area2 = areaById('area02-hinode')!;
    render(<N3AreaPanel t={aiCourseI18n.ja} {...baseProps} area={area2} onOpenAdventure={onAdv} />);
    expect(screen.queryByText('第1章「霧の港町」を進める')).toBeNull();
  });

  it('learner向け画面に開発ラベルを出さない', () => {
    const area = areaById('area02-hinode')!;
    const { container } = render(<N3AreaPanel t={aiCourseI18n.ja} {...baseProps} area={area} />);
    for (const banned of ['準備中', 'coming soon', '試作', 'sandbox', '検証用']) {
      expect(container.textContent?.includes(banned), banned).toBe(false);
    }
  });
});
