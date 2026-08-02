// Secure Adventure Runtime 実ブラウザE2E。
//
// 対象: wrangler dev（本物のWorker + local R2 + staging build）。remote不接触は
// helpers.blockRemote が機械的に保証する（127.0.0.1:8787 以外は全遮断）。
//
// Journey A（メガジャーニー・1テストで直列に実行）:
//   料金 → 模擬決済（アカウント設定・模擬OTP含む） → 利用権付与 →
//   V2有効化 → 未開始ゲート → 24時間開始 → 診断12問（サーバー採点） →
//   ルート提示 → 今日の冒険 → ミニ模試（サーバー構成・一括採点・音声トークン再生） →
//   reload/resume → 残り10分アップセル → 使い切り → 期限切れ
//
// 個別テスト: セキュリティ（401/403）・review page・responsive/a11y。
import { test, expect, type Page } from '@playwright/test';
import {
  blockRemote, seedAuth, seedLearner, seedTrial, collectConsoleErrors,
  assertNoHorizontalOverflow, mintJwt,
} from './helpers';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `e2e-results/steps/${name}.png`, fullPage: true });

test.describe('Secure Adventure Runtime', () => {

  test('Journey A: 購入 → 開始 → 診断 → 冒険 → 模試 → resume → アップセル → 使い切り → 期限切れ', async ({ page }) => {
    test.setTimeout(420_000);
    const errors = collectConsoleErrors(page);
    await blockRemote(page);
    await seedAuth(page);
    await seedLearner(page);

    // ── 1. 料金ページ ──
    await page.goto('/ja/ai-course/plans?checkout=sim');
    await expect(page.getByText('60分', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, '01-plans');

    // 60分パスの購入導線へ
    await page.goto('/ja/ai-course/plans/ai-hour-pass?checkout=sim');
    await shot(page, '02-purchase-entry');

    // ── 2. アカウント設定（模擬OTP: 画面に出たコードを入力する） ──
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 20_000 });
    await emailInput.fill('e2e@example.com');
    await page.getByRole('button', { name: '確認コードを送る' }).click();
    // 模擬OTPコードは画面に表示される（実メールを送らない設計）
    const codeText = await page.getByText(/確認コード: \d{6}/).textContent({ timeout: 10_000 });
    const code = codeText?.match(/\d{6}/)?.[0] ?? '';
    expect(code).toMatch(/^\d{6}$/);
    await page.locator('input:not([type="email"])').last().fill(code);
    await shot(page, '03-account-otp');
    await page.getByRole('button', { name: '確認して続ける' }).click();

    // ── 3. 模擬決済（メール → 成功カード → 規約同意 → 支払いに進む） ──
    await page.getByLabel('支払いが成功する').check({ timeout: 15_000 });
    await page.locator('input[type="email"]').first().fill('e2e@example.com');
    const terms = page.getByLabel('規約に同意する');
    if (!await terms.isChecked()) await terms.check();
    await shot(page, '04-checkout-form');
    await page.getByRole('button', { name: '支払いに進む' }).click();

    // 完了画面（利用権付与）
    await expect(page.getByText(/始められます|開始|購入.*完了|ありがとう/).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, '05-purchase-complete');

    // ランタイム利用権ストアへ橋渡しされたこと（今回の修正点）
    const trialStore = await page.evaluate(() => window.localStorage.getItem('ai_course_trial_grants_v1'));
    expect(trialStore, '購入がruntime利用権ストアへ接続されていること').toContain('ai-hour-pass');

    // ── 4. V2 有効化 → 未開始ゲート ──
    await page.goto('/ja/ai-course?v2=1');
    // 起動は blocked-supabase のリトライ待ちで遅くなる。invite を明示的に待つ
    const startV2 = page.getByRole('button', { name: '冒険を始める' });
    await startV2.waitFor({ state: 'visible', timeout: 60_000 });
    await startV2.click();
    await expect(page.getByText('60分パスを開始しますか')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText('開始の期限')).toBeVisible();
    await shot(page, '06-gate-unstarted');

    // ── 5. 24時間体験を開始 ──
    await page.getByRole('button').filter({ hasText: '体験を始める' }).click();

    // ── 6. onboarding → 診断（12問・サーバー採点） ──
    await expect(page.getByText('冒険の目的を選んでください')).toBeVisible({ timeout: 20_000 });
    await shot(page, '07-onboarding-goal');
    await page.getByRole('button').filter({ hasText: /JLPT|合格/ }).first().click();
    await page.getByRole('button', { name: 'つぎへ' }).click();
    await page.getByRole('button', { name: 'N3', exact: false }).first().click();
    await page.getByRole('button', { name: 'つぎへ' }).click();
    // 受験日は未定のまま
    await page.getByRole('button').filter({ hasText: /未定のまま|つぎへ/ }).first().click();
    await page.getByRole('button', { name: 'つぎへ' }).click();           // 学習スケジュール（既定のまま）
    await page.getByRole('button', { name: 'つぎへ' }).click();           // 先生（既定）
    await page.getByRole('button').filter({ hasText: '現在地診断' }).click(); // 相棒（既定）→診断へ
    await expect(page.getByRole('button', { name: '診断を始める' })).toBeEnabled({ timeout: 20_000 });
    await shot(page, '08-diag-intro');
    await page.getByRole('button', { name: '診断を始める' }).click();

    // 12問: 毎回最初の選択肢を選ぶ（正誤はサーバーが判定・画面には出さない）
    for (let i = 0; i < 12; i++) {
      await expect(page.getByText(`${i + 1} / 12`)).toBeVisible({ timeout: 15_000 });
      await page.locator('button.w-full.min-h-\\[44px\\]').first().click();
    }
    // 会話サンプルはスキップ（未判定になる）
    await page.getByRole('button').filter({ hasText: '書くのはスキップ' }).click();
    await expect(page.getByText('あなたの攻略ルート')).toBeVisible({ timeout: 20_000 });
    await shot(page, '09-route-reveal');
    await page.getByRole('button', { name: '今日の冒険を始める' }).click();

    // ── 7. 今日の冒険（home）: 現在地・次目的地・残り時間チップ ──
    await expect(page.getByText('今日の冒険').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('現在地', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/残り\d+分/).first()).toBeVisible();
    await shot(page, '10-home');

    // ── 8. ミニ模試（サーバー構成 → 全問回答 → サーバー一括採点） ──
    await page.getByRole('button').filter({ hasText: 'ほかの学習を見る' }).click();
    await page.getByRole('button').filter({ hasText: /ミニ模試/ }).click();
    await page.getByRole('button').filter({ hasText: '短時間版' }).click();

    // セクションを順に完走する（構成はサーバー任せ。あるだけ回す）
    for (let sec = 0; sec < 5; sec++) {
      const intro = page.getByRole('button', { name: 'このセクションを始める' });
      // isVisible は待たない（即時判定）。サーバー構成を待つので waitFor を使う
      const introShown = await intro.waitFor({ state: 'visible', timeout: 30_000 })
        .then(() => true).catch(() => false);
      if (!introShown) break;
      await intro.click();
      if (sec === 0) await shot(page, '11-mock-answering');
      // 問題を順に回答（音声があれば実トークンURLで再生する）
      for (let q = 0; q < 40; q++) {
        const play = page.getByRole('button').filter({ hasText: '音声を再生する' }).first();
        if (await play.isVisible().catch(() => false)) {
          await play.click().catch(() => { /* 自動再生制限は無視 */ });
        }
        await page.locator('div.space-y-2 > button').first().click();
        const next = page.getByRole('button', { name: '次へ', exact: true });
        if (await next.isVisible().catch(() => false)) { await next.click(); continue; }
        break;
      }
      await page.getByRole('button', { name: 'このセクションを終える' }).click();
      // 未回答警告が出たらそのまま終える
      const force = page.getByRole('button', { name: 'このまま終える' });
      if (await force.isVisible({ timeout: 2_000 }).catch(() => false)) await force.click();
      const nextSection = page.getByRole('button').filter({ hasText: /次のセクションへ|採点する/ }).first();
      const label = await nextSection.textContent();
      await nextSection.click();
      if (label?.includes('採点')) break;
    }
    // サーバー一括採点の結果（X／Y と科目別）
    await expect(page.getByText(/\d+／\d+/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('試験科目別')).toBeVisible();
    await shot(page, '12-mock-result');
    await page.getByRole('button', { name: '冒険にもどる' }).click();

    // ── 9. reload / resume ──
    await page.reload();
    await expect(page.getByText('今日の冒険').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, '13-resume-after-reload');

    // ── 10. 残り10分以下 → activeアップセル ──
    await page.evaluate(() => window.localStorage.setItem('ai_course_active_seconds_v1', '3100')); // 残り約8分
    await page.reload();
    await expect(page.getByText('残り時間が少なくなりました')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('1か月プランの準備状況を見る')).toBeVisible(); // 価格未確定の表現
    await expect(page.getByText('60分を追加する')).toBeVisible();
    await shot(page, '14-active-upsell');
    // 「今はしない」→ 同一セッションでは再表示されない（冷却期間の記録）
    await page.getByRole('button').filter({ hasText: /今はしない/ }).click();
    await expect(page.getByText('残り時間が少なくなりました')).toBeHidden();
    await page.reload();
    await expect(page.getByText('今日の冒険').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('残り時間が少なくなりました')).toBeHidden();
    await shot(page, '15-upsell-dismissed');

    // ── 11. 使い切り（3600秒消費） ──
    await page.evaluate(() => window.localStorage.setItem('ai_course_active_seconds_v1', '3600'));
    await page.reload();
    await expect(page.getByText('60分を使い切りました')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/すべて残って|そのまま/).first()).toBeVisible(); // 進捗保持の明示
    await expect(page.getByRole('link', { name: 'もう一度購入する（進捗はそのまま）' })).toBeVisible();
    await shot(page, '16-consumed');

    // ── 12. 期限切れ（activation + 24時間経過） ──
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('ai_course_trial_grants_v1');
      if (!raw) return;
      const store = JSON.parse(raw);
      const g = store.grants[0];
      g.activation = {
        grantId: g.id, learnerId: g.learnerId,
        activatedAtMs: Date.now() - 25 * 3600_000,
        expiresAtMs: Date.now() - 3600_000,
      };
      window.localStorage.setItem('ai_course_trial_grants_v1', JSON.stringify(store));
      window.localStorage.setItem('ai_course_active_seconds_v1', '600'); // 使い切りではなく期限切れで落ちること
    });
    await page.reload();
    await expect(page.getByText('24時間の利用期限が終わりました')).toBeVisible({ timeout: 20_000 });
    await shot(page, '17-expired');

    expect(errors, `console errors: ${errors.join(' / ')}`).toEqual([]);
  });

  test('セキュリティ: 未認証401・改ざん403・音声401（ブラウザからの実HTTP）', async ({ page }) => {
    await blockRemote(page);
    await page.goto('/ja/ai-course/plans');
    const jwt = mintJwt();
    const results = await page.evaluate(async (token) => {
      const post = async (body: unknown, auth?: string) => {
        const r = await fetch('/api/ai-course/activity/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
          body: JSON.stringify(body),
        });
        return r.status;
      };
      const issue = await fetch('/api/ai-course/session/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          level: 'n3', hasPeriodAccess: false, consumedActiveSeconds: 0,
          allowedTargetIds: ['n3u-01-self'],
          trial: {
            id: 't', learnerId: 'e2e-user-a', purchaseId: 'p', planId: 'ai-hour-pass', planVersion: 1,
            purchasedAtMs: Date.now() - 3600_000, startDeadlineMs: Date.now() + 86_400_000,
            includedActiveSeconds: 3600,
            activation: { grantId: 't', learnerId: 'e2e-user-a', activatedAtMs: Date.now() - 60_000, expiresAtMs: Date.now() + 23 * 3600_000 },
          },
        }),
      });
      const { sessionToken } = await issue.json();
      return {
        noAuth: await post({ activity: 'reading', sessionToken }),
        tampered: await post({ activity: 'reading', sessionToken: `${sessionToken}x` }, token),
        lockedBattle: await post({ activity: 'battle', tier: 'normal', targetIds: ['n3u-05-adjpair'], sessionToken }, token),
        lockedConversation: await post({ activity: 'conversation', missionId: 'w05m3', sessionToken }, token),
        okBattle: await post({ activity: 'battle', tier: 'normal', targetIds: ['n3u-01-self'], sessionToken }, token),
        audioNoToken: (await fetch('/api/ai-course/audio')).status,
        oldAudioUrl: (await fetch('/audio/ai-course/n3l-task-01.m4a')).status,
      };
    }, jwt);
    expect(results.noAuth).toBe(401);
    expect(results.tampered).toBe(403);
    expect(results.lockedBattle).toBe(403);
    expect(results.lockedConversation).toBe(403);
    expect(results.okBattle).toBe(200);
    expect(results.audioNoToken).toBe(401);
    expect(results.oldAudioUrl).toBe(404);
  });

  test('review page: ja/zh・fixtureバトル・mobile幅で横スクロールなし', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await blockRemote(page);
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/ja/ai-course/review');
    await expect(page.getByText('状態確認')).toBeVisible({ timeout: 20_000 });
    await shot(page, '20-review-ja-mobile');
    expect(await assertNoHorizontalOverflow(page), '横スクロールなし(ja)').toBe(true);

    // fixtureバトル: 問題payloadに正解が無い形のまま、回答→採点応答で解説が出る
    await page.getByRole('button').filter({ hasText: /問題（サーバー採点/ }).click();
    await page.getByRole('button').filter({ hasText: 'fixtureバトルを開始' }).click();
    await expect(page.getByText('ことになっています').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('div.space-y-2 > button').first().click();
    await expect(page.getByText('正解！')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('ほかの選択肢が違う理由')).toBeVisible();
    await shot(page, '21-review-fixture-battle-graded');

    // 主要状態の表示確認
    for (const label of ['使い切り', '二重タブ', '拒否文言']) {
      await page.getByRole('button').filter({ hasText: label }).first().click();
      expect(await assertNoHorizontalOverflow(page), `横スクロールなし(${label})`).toBe(true);
    }
    await shot(page, '22-review-states');

    await page.goto('/zh/ai-course/review');
    await expect(page.getByText('状態確認').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, '23-review-zh');
    expect(await assertNoHorizontalOverflow(page), '横スクロールなし(zh)').toBe(true);

    // a11y: ボタンに読み上げ名がある（空ボタン0）
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((b) =>
        !(b.textContent ?? '').trim() && !b.getAttribute('aria-label')).length);
    expect(unnamed, '読み上げ名のないボタン').toBe(0);

    expect(errors, `console errors: ${errors.join(' / ')}`).toEqual([]);
  });
});
