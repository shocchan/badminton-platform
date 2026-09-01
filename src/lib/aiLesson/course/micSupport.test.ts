// マイクが使える環境かの判定（2026-09-01）。
//
// 600円の体験の中心はAI音声会話で、マイクが使えないと何も起きない。
// これまでは会話画面に入って初めて分かる作りで、そのときには
// 既に「体験を始める」を押していて7日の時計が動いていた。
// **時計を動かす前に**気づけるようにした。
//
// ここで守るのは2つ:
//   ① 使えない人をちゃんと止める
//   ② 使える人を止めない（名前で決めつけない・判定できないときは通す）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { micSupportOf } from './micSupport';

describe('マイクが使えるかの判定', () => {
  it('HTTPSでマイクの窓口があれば使える', () => {
    expect(micSupportOf({ secure: true, hasMediaDevices: true, hasGetUserMedia: true })).toBe('ok');
  });

  it('HTTPSでなければ使えない（ブラウザが仕様上渡さない）', () => {
    expect(micSupportOf({ secure: false, hasMediaDevices: true, hasGetUserMedia: true }))
      .toBe('insecure');
  });

  it('mediaDevices が無ければ使えない（古いブラウザ・アプリ内ブラウザ）', () => {
    expect(micSupportOf({ secure: true, hasMediaDevices: false, hasGetUserMedia: false }))
      .toBe('unsupported');
  });

  it('mediaDevices はあるが getUserMedia が無い場合も使えない', () => {
    expect(micSupportOf({ secure: true, hasMediaDevices: true, hasGetUserMedia: false }))
      .toBe('unsupported');
  });

  it('HTTPSでないほうを先に言う（そちらが根本原因なので）', () => {
    expect(micSupportOf({ secure: false, hasMediaDevices: false, hasGetUserMedia: false }))
      .toBe('insecure');
  });
});

describe('ブラウザの名前で決めつけない', () => {
  const SRC = readFileSync('src/lib/aiLesson/course/micSupport.ts', 'utf8');

  it('判定に UserAgent を使っていない', () => {
    // 調べた結果、WeChat内蔵ブラウザでもマイクが使えることがある。
    // 名前で決めると、使える人にまで警告を出して離脱させる
    const fn = /export const micSupportOf[\s\S]*?\n\};/.exec(SRC);
    expect(fn, 'micSupportOf が見つからない').toBeTruthy();
    expect(fn![1 - 1]).not.toMatch(/userAgent|MicroMessenger/);
  });

  it('UserAgent は「何をすればいいか」を言うためだけに使う', () => {
    // 「右上の…からブラウザで開く」はアプリ内ブラウザにしか無い操作
    expect(SRC).toMatch(/export const inAppBrowser/);
    expect(SRC).toContain('MicroMessenger');
  });

  it('許可ダイアログを出さない（まだ会話を始めていない人を驚かせない）', () => {
    const fn = /export const micSupport = \(\)[\s\S]*?\n\};/.exec(SRC)![0];
    expect(fn).not.toContain('getUserMedia(');
  });

  it('参照できないときは使える側に倒す', () => {
    expect(SRC).toMatch(/catch \{\s*return 'ok';/);
  });
});

describe('時計が動く前に伝える', () => {
  const SCREEN = readFileSync('src/components/ai-course/TrialStartScreen.tsx', 'utf8');

  it('開始画面でマイク環境を見ている', () => {
    expect(SCREEN).toContain("from '../../lib/aiLesson/course/micSupport'");
    expect(SCREEN).toMatch(/const mic = micSupport\(\);/);
  });

  it('使えないときは開始ボタンの手前で警告する', () => {
    expect(SCREEN).toMatch(/\{mic !== 'ok' && \([\s\S]{0,1200}?role="alert"/);
    expect(SCREEN).toContain('この画面ではマイクが使えません');
    expect(SCREEN).toContain('这个画面无法使用麦克风');
  });

  it('何をすればいいかを、アプリ内かどうかで出し分ける', () => {
    expect(SCREEN).toContain('在浏览器中打开');
    expect(SCREEN).toContain('ブラウザで開く');
    expect(SCREEN).toContain('Chrome / Safari');
  });

  it('体験期間を無駄にすると明言する（軽い警告で終わらせない）', () => {
    expect(SCREEN).toContain('話せないまま期間を使ってしまいます');
    expect(SCREEN).toContain('白白用掉体验期间');
  });

  it('ここで止まった人を数える（案内をもっと手前へ出すか判断するため）', () => {
    expect(SCREEN).toMatch(/logCourseEvent\('error_occurred', \{ where: 'mic_check'/);
  });

  it('開始そのものは止めない（判定が外れたときに買った人を締め出さない）', () => {
    // 警告は出すが disabled にはしない。判定は完璧ではないため
    expect(SCREEN).toMatch(/onClick=\{\(\) => void begin\(\)\} disabled=\{busy\}/);
  });
});

describe('判定が1か所にまとまっている', () => {
  it('同じ正規表現を各画面が持たない', () => {
    for (const f of [
      'src/components/ai-course/CourseVoiceLesson.tsx',
      'src/components/ai-lesson/VoiceLessonChat.tsx',
    ]) {
      const s = readFileSync(f, 'utf8');
      expect(s, `${f} が自前で UserAgent を見ている`)
        .not.toMatch(/\/MicroMessenger\/i\.test\(navigator\.userAgent\)/);
      expect(s).toContain("from '../../lib/aiLesson/course/micSupport'");
    }
  });
});
