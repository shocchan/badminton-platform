// 教材レベルの決め方（2026-08-23 実生徒監査）。
//
// 実測: 会話目標・基礎帯のテスト生徒に、おかわり語彙バトルで N2 の文字語彙
// （「教頭」「願書」）が出た。原因は各所に散っていた
// `targetJlpt === 'N3' ? 'N3' : 'N2'` で、**targetJlpt が null の会話目標が全員 N2 に丸められていた**。
// 決め方を1か所に集約し、「測っていない人へ上の帯を出さない」を固定する。
import { describe, it, expect } from 'vitest';
import { effectiveContentLevel, strictDeclaredLevelOnly } from './advProfile';

describe('effectiveContentLevel', () => {
  it('試験目標は選んだレベルがそのまま（N5/N4/N3/N2）', () => {
    expect(effectiveContentLevel({ goalType: 'jlpt', targetJlpt: 'N5', declaredJlpt: null })).toBe('N5');
    expect(effectiveContentLevel({ goalType: 'jlpt', targetJlpt: 'N4', declaredJlpt: null })).toBe('N4');
    expect(effectiveContentLevel({ goalType: 'jlpt', targetJlpt: 'N3', declaredJlpt: null })).toBe('N3');
    expect(effectiveContentLevel({ goalType: 'jlpt', targetJlpt: 'N2', declaredJlpt: null })).toBe('N2');
  });

  it('**会話目標で申告が無ければ N3**（測っていない人に N2 語彙を出さない）', () => {
    expect(effectiveContentLevel({ goalType: 'conversation', targetJlpt: null, declaredJlpt: null })).toBe('N3');
  });

  /*
   * 2026-09-09 CEO報告: N1を持っていると申告したsijiaさんに、単語も模試もN2が出ていた。
   * 会話目標のときだけ N1→N2 に丸めていたのが原因（「会話にN1文法は要らない」という理由。
   * だが語彙まで一緒に落ちていて、N1保持者には易しすぎた）。申告どおり出す。
   */
  it('会話目標は申告した級で決まる（**N1申告ならN1**・N2→N2・N3→N3）', () => {
    expect(effectiveContentLevel({ goalType: 'conversation', targetJlpt: null, declaredJlpt: 'N1' })).toBe('N1');
    expect(effectiveContentLevel({ goalType: 'conversation', targetJlpt: null, declaredJlpt: 'N2' })).toBe('N2');
    expect(effectiveContentLevel({ goalType: 'conversation', targetJlpt: null, declaredJlpt: 'N3' })).toBe('N3');
  });

  it('**会話目標では古い targetJlpt より申告レベルが勝つ**（目的を切り替えた人の実測ケース）', () => {
    // 実測: 会話目標に切り替えたあとも targetJlpt='N3' が残っていた
    expect(effectiveContentLevel({ goalType: 'conversation', targetJlpt: 'N3', declaredJlpt: 'N1' })).toBe('N1');
    expect(effectiveContentLevel({ goalType: 'conversation', targetJlpt: 'N2', declaredJlpt: 'N3' })).toBe('N3');
    // 試験目標では従来どおり目標レベルが正
    expect(effectiveContentLevel({ goalType: 'jlpt', targetJlpt: 'N3', declaredJlpt: 'N1' })).toBe('N3');
  });

  it('プロファイルが無くても落ちない（既定は N3）', () => {
    expect(effectiveContentLevel(null)).toBe('N3');
    expect(effectiveContentLevel(undefined)).toBe('N3');
  });

  it('AdvShell が古い丸め方（targetJlpt === N3 ? N3 : N2）を持ち込み直していない', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../../../components/ai-course/adventure/AdvShell.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/targetJlpt === 'N3' \? 'N3' : 'N2'/);
    expect(src).not.toMatch(/profile\.targetJlpt === 'N5' \? 'N5'/);
  });
});

/*
 * その級を「持っている」人には、その級だけを出す（2026-09-09 CEO指示）。
 * 「sijiaさんはN1完全に取ってる人だからN1のみ出るようにしておこう」
 *
 * 区別しているのは **持っている級（declaredJlpt）** と **目指す級（targetJlpt）**。
 * 目標N1（未取得）は下の級も出す＝JLPTの出題範囲がそうなっているため。
 */
describe('strictDeclaredLevelOnly', () => {
  it('N1を持っている会話目標の人（sijiaさん・eliさん）はN1だけ', () => {
    expect(strictDeclaredLevelOnly({ goalType: 'conversation', targetJlpt: null, declaredJlpt: 'N1' })).toBe(true);
  });

  it('**N1を目指している人（未取得）は下の級も出す**（試験範囲を削らない）', () => {
    expect(strictDeclaredLevelOnly({ goalType: 'jlpt', targetJlpt: 'N1', declaredJlpt: null })).toBe(false);
  });

  it('申告と実効レベルがずれるときは絞らない（N3申告でN2目標＝積み上げが要る）', () => {
    expect(strictDeclaredLevelOnly({ goalType: 'jlpt', targetJlpt: 'N2', declaredJlpt: 'N3' })).toBe(false);
  });

  it('申告が無ければ絞らない（測っていない人を狭い帯に閉じ込めない）', () => {
    expect(strictDeclaredLevelOnly({ goalType: 'conversation', targetJlpt: null, declaredJlpt: null })).toBe(false);
    expect(strictDeclaredLevelOnly(null)).toBe(false);
  });

  it('N2を持っている会話目標の人はN2だけ', () => {
    expect(strictDeclaredLevelOnly({ goalType: 'conversation', targetJlpt: null, declaredJlpt: 'N2' })).toBe(true);
  });
});
