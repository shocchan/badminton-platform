// ログイン後の初期ステップ判定（純関数・テスト対象）。
// 新規（learner未作成）は8問ヒアリングへ、既存learnerはヒアリングを飛ばす。

import type { Learner } from './types';

/**
 * ログイン済みユーザーのlearner有無から、8問ヒアリングを出すか決める。
 * 型ガードにして、早期returnの後で learner が非nullに絞られるようにする。
 */
export const needsHearing = (learner: Learner | null): learner is null => learner === null;
