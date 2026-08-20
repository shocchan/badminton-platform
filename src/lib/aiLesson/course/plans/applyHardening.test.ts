// 申込フォームのbot対策・返金自動処理の受入テスト（2026-08-20）。
//
// 実体は Edge Function（Deno）なので、ここでは「守るべき性質が実装から
// 失われていないこと」をソース走査で固定する。消えると静かに穴が開くため。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fnSrc = (rel: string) =>
  readFileSync(join(__dirname, '../../../../../supabase/functions', rel), 'utf8');
const src = (rel: string) => readFileSync(join(__dirname, '../../../..', rel), 'utf8');

describe('申込フォームのbot対策', () => {
  const apply = fnSrc('ai-course-apply/index.ts');

  it('**Turnstileの検証がサーバー側にある**（画面のチェックだけに頼らない）', () => {
    expect(apply).toMatch(/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
    expect(apply).toMatch(/if \(turnstileSecret\)/); // 鍵があるときは必須
    expect(apply).toMatch(/captcha_failed/);
  });

  it('検証できないときは通さない（フェイルオープンにしない）', () => {
    // catch節が false を返している＝Cloudflareに繋がらないときは拒否
    expect(apply).toMatch(/catch \(e\) \{[\s\S]*?return false;/);
  });

  it('**入力検証をサーバー側でも行う**（画面の検証は回避できる）', () => {
    expect(apply).toMatch(/name_required/);
    expect(apply).toMatch(/email_invalid/);
    expect(apply).toMatch(/consent_required/);
    expect(apply).toMatch(/invalid_plan/);
  });

  it('保存できなかったら成功と言わない', () => {
    expect(apply).toMatch(/store_failed/);
    expect(apply).not.toMatch(/ok: true[\s\S]{0,80}insRes\.ok === false/);
  });

  it('クライアントは匿名キーで直接テーブルへ書かない（Edge Function経由）', () => {
    const repo = src('lib/aiLesson/course/plans/planApplicationRepository.ts');
    expect(repo).toMatch(/functions\/v1\/ai-course-apply/);
    expect(repo, '直接insertが残っている').not.toMatch(/\.from\(['"]ai_plan_applications['"]\)/);
    expect(repo).not.toMatch(/\.from\(['"]ai_terms_consents['"]\)/);
  });

  it('サイトキーが無い環境ではウィジェットを出さない（環境で壊れない）', () => {
    const w = src('components/ai-course/TurnstileWidget.tsx');
    expect(w).toMatch(/if \(!SITE_KEY\) return null;/);
    expect(w).toMatch(/export const turnstileEnabled/);
  });
});

describe('返金の自動処理', () => {
  const webhook = fnSrc('ai-course-stripe-webhook/index.ts');

  it('**全額返金のときだけ**受講権を終了する（一部返金では止めない）', () => {
    expect(webhook).toMatch(/charge\.amount_refunded >= charge\.amount/);
    expect(webhook).toMatch(/status: "refunded"/);
  });

  it('その購入で付けた受講権だけを対象にする（上位プランを消さない）', () => {
    expect(webhook).toMatch(/ai_course_access\?user_id=eq\.\$\{target\.user_id\}&purchase_id=eq\.\$\{target\.id\}/);
  });

  it('チャージバックは自動で止めず通知にとどめる（正規の生徒を締め出さない）', () => {
    expect(webhook).toMatch(/charge\.dispute\.created/);
    expect(webhook).toMatch(/自動では利用を止めていません/);
  });

  it('学習記録は消さない', () => {
    expect(webhook).not.toMatch(/delete[\s\S]{0,40}ai_learners/i);
    expect(webhook).not.toMatch(/delete[\s\S]{0,40}ai_learning_sessions/i);
  });
});
