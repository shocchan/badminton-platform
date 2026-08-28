// 法務3ページの回帰テスト。
// 狙いは「文言が綺麗か」ではなく、**法令上載せる必要がある項目が抜けないこと**と、
// **事実が未確定のまま公開されないこと**の2点を機械で固定すること。
import { describe, it, expect } from 'vitest';
import {
  KAWABADO_LEGAL_FACTS,
  KAWABADO_LEGAL_PUBLISH,
  pendingKawabadoLegalFacts,
  isKawabadoLegalPreview,
  type KawabadoLegalFacts,
} from './kawabadoLegalFacts';
import {
  buildKawabadoLegalPages,
  renderableKawabadoLegalPage,
  kawabadoLegalPath,
} from './kawabadoLegalContent';

const LANGS = ['ja', 'zh'] as const;

describe('公開ゲート（未確定の事実を公開しない）', () => {
  it('未確定の事実がゼロのときだけ公開される', () => {
    expect(pendingKawabadoLegalFacts()).toEqual([]);
    expect(KAWABADO_LEGAL_PUBLISH).toBe(true);
  });

  it('事実がnullになると未確定として検出され、公開判定が落ちる', () => {
    const broken: KawabadoLegalFacts = { ...KAWABADO_LEGAL_FACTS, refundPolicy: null };
    expect(pendingKawabadoLegalFacts(broken)).toContain('refundPolicy');
  });

  it('支払方法が空配列でも未確定として検出される', () => {
    const broken: KawabadoLegalFacts = { ...KAWABADO_LEGAL_FACTS, paymentMethods: [] };
    expect(pendingKawabadoLegalFacts(broken)).toContain('paymentMethods');
  });

  it('プレビュー指定は ?legal=preview のときだけ有効', () => {
    expect(isKawabadoLegalPreview('?legal=preview')).toBe(true);
    expect(isKawabadoLegalPreview('?legal=1')).toBe(false);
    expect(isKawabadoLegalPreview('')).toBe(false);
  });
});

describe('特定商取引法に基づく表記（掲示義務項目）', () => {
  // 通信販売で表示が求められる項目。1つでも欠けると表記として不備になる
  const REQUIRED_JA = [
    '販売事業者', '運営統括責任者', '所在地', '電話番号', 'メールアドレス',
    '販売価格', '商品代金以外の必要料金', 'お支払い方法', 'お支払い時期',
    'サービスの提供時期', 'キャンセル・返金について',
  ];

  it('必須項目がすべて見出しとして存在する', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'tokushoho')!;
    const headings = page.sections.map((s) => s.heading);
    for (const req of REQUIRED_JA) {
      expect(headings, `特商法表記に「${req}」が無い`).toContain(req);
    }
  });

  it('住所・電話を on_request にしたときは「請求があれば開示する」旨が出る', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'tokushoho')!;
    const addr = page.sections.find((s) => s.heading === '所在地')!.body.join('');
    expect(addr).toMatch(/請求/);
    expect(addr).toMatch(/開示/);
  });

  it('支払方法は実装されている3種（カード・PayPay・WeChat Pay/Alipay）と一致する', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'tokushoho')!;
    const pay = page.sections.find((s) => s.heading === 'お支払い方法')!.body.join('');
    expect(pay).toMatch(/クレジットカード/);
    expect(pay).toMatch(/PayPay/);
    expect(pay).toMatch(/WeChat Pay/);
    expect(pay).toMatch(/Alipay/);
    // 銀行振込は2026-08-28に廃止。表記に残っていたら実装との食い違いになる
    expect(pay).not.toMatch(/銀行振込/);
  });

  it('返金の記載が実装（クレカは10%手数料）と食い違っていない', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'tokushoho')!;
    const refund = page.sections.find((s) => s.heading === 'キャンセル・返金について')!.body.join('');
    expect(refund).toMatch(/10%/);
  });
});

describe('プライバシーポリシー', () => {
  it('個人情報保護法まわりで載せるべき項目が揃っている', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'privacy')!;
    const headings = page.sections.map((s) => s.heading);
    for (const req of ['取得する情報', '利用目的', 'ご案内の配信停止', '第三者への提供・委託', '保管方法と保存期間', '開示・訂正・削除のご請求', 'お問い合わせ窓口']) {
      expect(headings, `プライバシーポリシーに「${req}」が無い`).toContain(req);
    }
  });

  it('今後の告知・お知らせの送付が利用目的に含まれている', () => {
    // ここが抜けると、次回大会の案内メールが目的外利用になってしまう
    const purpose = KAWABADO_LEGAL_FACTS.personalDataPurpose!.ja;
    expect(purpose).toMatch(/ご案内|お知らせ/);
  });

  it('利用目的を自ら狭めすぎていない（告知を送れなくなる書き方をしない）', () => {
    // 「これら以外の目的には利用しません」と言い切ると、後から告知を足せなくなる
    const purpose = KAWABADO_LEGAL_FACTS.personalDataPurpose!.ja;
    expect(purpose).not.toMatch(/これら以外の目的には利用しません/);
    // ただし無制限にもしない。関連性の範囲を超えるときは同意を取る旨が要る
    expect(purpose).toMatch(/同意/);
  });

  it('配信停止の方法が書かれている（特定電子メール法）', () => {
    const optOut = KAWABADO_LEGAL_FACTS.optOut!.ja;
    expect(optOut).toMatch(/停止/);
    // 配信停止しても申込済みイベントの連絡は届くことを明示（利用者の不利益を防ぐ）
    expect(optOut).toMatch(/変更|中止/);
  });

  it('実際に収集している項目（氏名・メール・電話）が明記されている', () => {
    const items = KAWABADO_LEGAL_FACTS.personalDataItems!.ja;
    expect(items).toMatch(/お名前/);
    expect(items).toMatch(/メールアドレス/);
    expect(items).toMatch(/電話番号/);
  });

  it('カード番号を自社で保持しないことが明記されている', () => {
    expect(KAWABADO_LEGAL_FACTS.personalDataItems!.ja).toMatch(/クレジットカード番号.*(取得|保存)/);
  });

  it('実際に使っている委託先が漏れなく書かれている', () => {
    const third = KAWABADO_LEGAL_FACTS.thirdParties!.ja;
    for (const vendor of ['Stripe', 'Supabase', 'Resend']) {
      expect(third, `委託先 ${vendor} の記載が無い`).toMatch(vendor);
    }
  });

  it('参加者名を公開表示している事実が隠されていない', () => {
    // 通常活動の申込一覧は氏名が公開される仕様。書いていないと不意打ちになる
    expect(KAWABADO_LEGAL_FACTS.thirdParties!.ja).toMatch(/参加者一覧|表示/);
  });
});

describe('利用規約', () => {
  it('9条すべてが並んでいる', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'terms')!;
    expect(page.sections).toHaveLength(9);
    page.sections.forEach((s, i) => {
      expect(s.heading, `第${i + 1}条の見出しが崩れている`).toMatch(new RegExp(`^第${i + 1}条`));
    });
  });

  it('免責条項に「故意または重大な過失」の除外がある（消費者契約法で全部免責は無効）', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'terms')!;
    const body = page.sections.map((s) => s.body.join('')).join('');
    expect(body).toMatch(/故意|重大な過失/);
  });

  it('当会都合の中止では全額返金すると明記している', () => {
    const page = buildKawabadoLegalPages('ja').find((p) => p.id === 'terms')!;
    const body = page.sections.map((s) => s.body.join('')).join('');
    expect(body).toMatch(/中止/);
    expect(body).toMatch(/全額返金/);
  });
});

describe('日本語・中国語の対応', () => {
  it.each(LANGS)('%s の全ページに空のセクションが無い', (lang) => {
    for (const page of buildKawabadoLegalPages(lang)) {
      const rendered = renderableKawabadoLegalPage(page);
      expect(rendered.sections.length, `${page.id} のセクションが空`).toBeGreaterThan(0);
      for (const s of rendered.sections) {
        expect(s.heading.trim()).not.toBe('');
        expect(s.body.join('').trim(), `${page.id} / ${s.heading} の本文が空`).not.toBe('');
      }
    }
  });

  it('中国語ページに日本語の条文がそのまま出ていない', () => {
    for (const page of buildKawabadoLegalPages('zh')) {
      const body = page.sections.map((s) => s.body.join('')).join('');
      // ひらがな・カタカナが混ざっていたら日本語文が漏れている（PayPay等の固有名詞は英字なので安全）
      expect(body, `${page.id} の中国語ページに日本語が混ざっている`).not.toMatch(/[ぁ-んァ-ヶ]/);
    }
  });

  it('ja と zh で同じページ構成になっている', () => {
    const ja = buildKawabadoLegalPages('ja');
    const zh = buildKawabadoLegalPages('zh');
    expect(zh.map((p) => p.id)).toEqual(ja.map((p) => p.id));
    ja.forEach((p, i) => {
      expect(zh[i].sections).toHaveLength(p.sections.length);
    });
  });
});

describe('氏名の露出範囲（CEO指示: 特商法以外は屋号のみ）', () => {
  // 特定商取引法は個人事業主に「氏名」の表示を求めるため特商法ページには本名が要る。
  // 一方、プライバシーポリシー・利用規約には表示義務が無いので本名を出さない。
  const REAL_NAME = '安田翔';

  it('特商法ページには氏名が載っている（法令要件）', () => {
    for (const lang of LANGS) {
      const page = buildKawabadoLegalPages(lang).find((p) => p.id === 'tokushoho')!;
      const text = page.sections.map((s) => s.body.join('')).join('');
      expect(text, `${lang}: 特商法表記から氏名が消えている`).toMatch(REAL_NAME);
    }
  });

  it('プライバシーポリシー・利用規約には氏名を出さない', () => {
    for (const lang of LANGS) {
      for (const id of ['privacy', 'terms'] as const) {
        const page = buildKawabadoLegalPages(lang).find((p) => p.id === id)!;
        const text = page.intro + page.sections.map((s) => s.body.join('')).join('');
        expect(text, `${lang}/${id} に氏名が漏れている`).not.toMatch(REAL_NAME);
        expect(text, `${lang}/${id} に屋号が無い`).toMatch(KAWABADO_LEGAL_FACTS.displayName);
      }
    }
  });
});

describe('URL', () => {
  it('言語ごとのパスを組み立てる', () => {
    expect(kawabadoLegalPath('ja', 'tokushoho')).toBe('/ja/tokushoho');
    expect(kawabadoLegalPath('zh', 'privacy')).toBe('/zh/privacy');
    expect(kawabadoLegalPath('ja', 'terms')).toBe('/ja/terms');
  });
});
