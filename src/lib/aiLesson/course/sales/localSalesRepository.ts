// 模擬決済用の保存先（ブラウザのローカル保存）。
//
// **模擬決済モードでしか使わない。** 本物の決済（Stripe test / live）では、
// 購入・利用権の書き込みは Edge Function がサーバー側で行う。
// クライアントに利用権を書き込む権限を与えると、いくらでも自分に付与できてしまうため、
// そちらの経路ではこの実装を一切使わない。
//
// ここが存在する理由は1つだけ:
//   Stripe の test 鍵がまだ無い状態でも、CEO が staging で
//   「決済 → 利用権が付く → 学習が始まる」を**自分の手で通して確認できる**ようにするため。

import type { SalesRepository, PurchaseRecord } from './checkoutFlow';
import type { EntitlementGrant } from './entitlement';

const KEY = 'ai_course_sim_sales_v1';

interface Store {
  purchases: Record<string, PurchaseRecord>;
  grants: EntitlementGrant[];
  learners: Record<string, string>;
  seq: number;
}

const empty = (): Store => ({ purchases: {}, grants: [], learners: {}, seq: 0 });

const read = (storage: Storage): Store => {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      purchases: parsed.purchases ?? {},
      grants: parsed.grants ?? [],
      learners: parsed.learners ?? {},
      seq: parsed.seq ?? 0,
    };
  } catch {
    return empty();   // 壊れた保存内容で画面が死なないようにする
  }
};

const write = (storage: Storage, s: Store): void => {
  try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* 容量超過などは無視 */ }
};

/** 模擬決済の記録を全部消す（確認をやり直すとき用） */
export const resetSimulatedSales = (storage: Storage): void => {
  try { storage.removeItem(KEY); } catch { /* noop */ }
};

export const createLocalSalesRepository = (storage: Storage): SalesRepository => ({
  async findPurchase(orderId) {
    return read(storage).purchases[orderId] ?? null;
  },
  async savePurchase(record) {
    const s = read(storage);
    s.purchases[record.orderId] = record;
    write(storage, s);
  },
  async listGrants(learnerId) {
    return read(storage).grants.filter((g) => g.learnerId === learnerId);
  },
  async insertGrant(grant) {
    const s = read(storage);
    // purchaseId が同じものは足さない（アプリ側のべき等判定が抜けてもここで止まる）
    if (!s.grants.some((g) => g.purchaseId === grant.purchaseId)) s.grants.push(grant);
    write(storage, s);
  },
  async findLearnerIdByEmail(email) {
    return read(storage).learners[email] ?? null;
  },
  async createLearner(email) {
    const s = read(storage);
    s.seq += 1;
    const id = `sim_learner_${s.seq}`;
    s.learners[email] = id;
    write(storage, s);
    return id;
  },
});

/** 模擬決済で今持っている利用権（購入完了画面の表示に使う） */
export const readSimulatedGrants = (storage: Storage, learnerId: string): EntitlementGrant[] =>
  read(storage).grants.filter((g) => g.learnerId === learnerId);
