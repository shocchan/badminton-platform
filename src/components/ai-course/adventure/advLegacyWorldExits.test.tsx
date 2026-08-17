// @vitest-environment jsdom
// V2（今日の冒険）から旧コース（ミナモ列島）へ出ていく導線の封鎖（2026-08-18 監査P1）。
//
// 直したのは5つ:
// ① 「単元のことばを学ぶ」は旧エリア画面ではなく**単元だけ**を開く。
//    旧エリア画面の一番大きい緑ボタンは「次のエリアへ進む」で、押すと旧エリア連鎖 →
//    旧N2文法攻略（ソラノ塔） → 確認なしで即開始する有料AI会話まで到達できた
// ② 単元を最後まで終えたら vocab_new step が完了する（自己申告リンク頼みをやめる）
// ③ 単元画面の戻り・完了の文言が「世界へもどる」「オモイデ庭園で再会します」ではなく、
//    実際に起きること（今日の冒険へもどる／庭園の約束はしない）になる
// ④ AI会話stepの入口から旧世界の地名（ミナモ列島・第9エリア／カタリ港）が消え、
//    戻るボタンの名前が実際の行き先（今日の冒険）と一致する
// ⑤ オンボーディングの「いまはやめておく（従来ホームへ）」を出さない
import { describe, it, expect, vi, afterEach } from 'vitest';
// jsdom環境では import.meta.url が http スキームになり new URL() を fs へ渡せない。
// リポジトリルート相対（vitestの実行ディレクトリ）で読む
import { readFileSync } from 'node:fs';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { aiCourseI18n } from '../../../locales/aiCourse';
import { N3UnitSolo } from '../n3unit/N3UnitSolo';
import { KatariPortIntro } from '../rpg/KatariPortIntro';
import type { StoragePort } from '../../../lib/aiLesson/course/n3unit/unitRuntime';

afterEach(cleanup);

/**
 * コメントを落としたソース。
 * 「なぜ撤去したか」を説明するコメントに語句が残るのは正しいことなので、
 * 検査は**実際のコード**だけを見る（説明を書けなくすると経緯が失われる）。
 */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ADV_SHELL = readFileSync('src/components/ai-course/adventure/AdvShell.tsx', 'utf8');
const ONBOARDING = readFileSync('src/components/ai-course/adventure/AdvOnboarding.tsx', 'utf8');
const PAGE = readFileSync('src/pages/ai-lesson/AiCoursePage.tsx', 'utf8');

/** 旧世界（旧コース）の固有名詞。V2の生徒はどれも一度も見ていない */
const LEGACY_WORDS = ['ミナモ列島', 'オモイデ庭園', 'カタリ港', 'ソラノ塔', '次のエリアへ進む', '世界へもどる'];

const emptyStorage: StoragePort = { load: async () => null, save: async () => ({ ok: true }) };

describe('「単元のことばを学ぶ」は旧エリア画面へ出ていかない', () => {
  it('AdvShellは単元IDを渡す（エリアIDに変換して旧エリア画面を開かない）', () => {
    expect(ADV_SHELL).toMatch(/props\.onOpenUnit\(s\.refIds\[0\]\)/);
    // 旧配線（areaIdへ変換して旧エリア画面へ）が戻っていないこと
    expect(ADV_SHELL).not.toMatch(/onOpenArea/);
    expect(ADV_SHELL).not.toMatch(/AREA_BY_UNIT/);
  });

  it('AiCoursePageの n3unit step は単元パネルだけを描く（N3AreaPanelを使わない）', () => {
    const branch = /if \(step === 'n3unit'[\s\S]{0,900}?\n {2}\}/.exec(PAGE);
    expect(branch, 'n3unit の描画分岐が見つからない').toBeTruthy();
    expect(branch![0]).toMatch(/N3UnitSoloLazy/);
    expect(branch![0]).not.toMatch(/N3AreaPanelLazy/);
    // 戻り先は今日の冒険（V2ホーム）だけ
    expect(branch![0]).toMatch(/setStep\('home'\)/);
    expect(branch![0]).not.toMatch(/openArea/);
  });

  it('**この訪問中に終えたときだけ** vocab_new step が完了する', () => {
    // 単元の保存（unitCompletedLocally）は日付を持たない＝一度でも終えた単元は永久にtrue。
    // 開いた瞬間に消し込む実装だと、翌日その単元が出たとき何もしていないのに✓になる
    // （2026-08-18 検証で差し戻した。今日いちばん時間をかけて直した原則がここで復活していた）
    expect(codeOnly(ADV_SHELL)).toMatch(/wasDoneBefore/);
    expect(codeOnly(ADV_SHELL)).toMatch(/!pending\.wasDoneBefore && unitCompletedLocally\(/);
    // 開くときに「開く前の状態」を控えている
    expect(codeOnly(ADV_SHELL)).toMatch(/unitStepPendingRef\.current = \{/);
  });
});

describe('単元画面（今日の冒険から開いたとき）の文言', () => {
  it('戻り先は「今日の冒険へもどる」で、旧世界の名前は出ない', async () => {
    render(<N3UnitSolo t={aiCourseI18n.ja} unitId="n3u-03-move" onExit={() => {}} storage={emptyStorage} />);
    expect(await screen.findAllByRole('button', { name: /今日の冒険へもどる/ })).not.toHaveLength(0);
    for (const w of LEGACY_WORDS) {
      expect(document.body.textContent ?? '', `旧世界の語「${w}」が出ている`).not.toContain(w);
    }
  });

  it('zhでも同じ（旧世界の名前を出さない）', async () => {
    render(<N3UnitSolo t={aiCourseI18n.zh} unitId="n3u-03-move" onExit={() => {}} storage={emptyStorage} />);
    expect(await screen.findAllByRole('button', { name: /回到今天的冒险/ })).not.toHaveLength(0);
    for (const w of LEGACY_WORDS) {
      expect(document.body.textContent ?? '', `旧世界の語「${w}」が出ている`).not.toContain(w);
    }
  });

  it('存在しない単元IDでも行き止まりにしない（今日の冒険へ戻れる）', () => {
    const onExit = vi.fn();
    render(<N3UnitSolo t={aiCourseI18n.ja} unitId="n3u-does-not-exist" onExit={onExit} storage={emptyStorage} />);
    fireEvent.click(screen.getByRole('button', { name: /今日の冒険へもどる/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('「オモイデ庭園で再会します」をV2では出さない（庭園に到達する経路が無い）', () => {
    const src = readFileSync('src/components/ai-course/n3unit/N3UnitPanel.tsx', 'utf8');
    expect(src).toMatch(/!questMode && summary\.reviewScheduledCount > 0/);
  });
});

describe('AI会話stepの入口（今日の冒険から開いたとき）', () => {
  const baseProps = {
    purposeJa: '以前と今の変化を説明する',
    targetExpression: '〜ようになりました',
    estimatedMinutes: 3,
    remainingToday: 5,
    onStartVoice: () => {},
    onStartText: () => {},
  };

  it('旧世界の地名バッジを出さず、戻るの名前が実際の行き先と一致する', () => {
    const onBack = vi.fn();
    render(<KatariPortIntro t={aiCourseI18n.ja} {...baseProps} onBack={onBack} questMode />);
    for (const w of LEGACY_WORDS) {
      expect(document.body.textContent ?? '', `旧世界の語「${w}」が出ている`).not.toContain(w);
    }
    fireEvent.click(screen.getByRole('button', { name: /今日の冒険へもどる/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('旧コースの生徒には従来どおりカタリ港のまま（questModeを立てない）', () => {
    render(<KatariPortIntro t={aiCourseI18n.ja} {...baseProps} onBack={() => {}} />);
    expect(screen.getByText('カタリ港（会話の港）')).toBeTruthy();
  });

  it('AiCoursePageはV2の生徒にだけ questMode を渡す', () => {
    expect(PAGE).toMatch(/questMode=\{advOn\}/);
  });
});

describe('旧コースのホームへ落とす出口を残さない', () => {
  it('オンボーディングの「いまはやめておく（従来ホームへ）」が無い', () => {
    expect(codeOnly(ONBOARDING)).not.toMatch(/従来ホームへ/);
    expect(codeOnly(ONBOARDING)).not.toMatch(/暂时不用（回到原来的主页）/);
    // 判定に使えない条件（V2のAI会話1回でも増える progress）で出し分けていない
    expect(codeOnly(ADV_SHELL)).not.toMatch(/canCancelToLegacy=/);
  });

  it('AdvShellに旧ホームへ戻す配線（onExitV2）が無い', () => {
    expect(codeOnly(ADV_SHELL)).not.toMatch(/props\.onExitV2/);
    expect(codeOnly(PAGE)).not.toMatch(/onExitV2=/);
  });
});
