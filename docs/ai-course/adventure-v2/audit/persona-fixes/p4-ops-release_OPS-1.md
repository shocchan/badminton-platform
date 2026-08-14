# p4-ops-release:OPS-1 (P1)

## Evidence
courseRepository.ts:177-192 updateLearner は LSキャッシュ更新後 `await supabase.from('ai_learners').update(row).eq('user_id', u.user.id);` の戻り値を捨てており error 未検知。PendingOp の kind は 'progress'|'session'|'utterances'|'feedback'|'usage' のみ（同:68-72）で settings 非対象。flushPending（同:389-411）にも learner 再送なし。呼出側は AiCoursePage.tsx:300/531/1032/1068/1084/1118/1152/1238 の8箇所すべて void で握りつぶし。getLearner（同:147-155）は DB成功時に LS を上書きするため、書込失敗後に別端末/再ログインすると進捗が巻き戻る。なお AiCoursePage.tsx:309-310 で flushPending → getLearner の順に呼ばれるため、pending キュー方式なら次回起動時に先に再送→読込となり整合する。

## FixSpec
対象: /Users/shocchan/badminton-aicourse/src/lib/aiLesson/course/courseRepository.ts（＋PILOT_OPERATIONS.md 1行）。方針: 失敗時に「LSキャッシュの現在値を再送するマーカー」を pending に1件だけ積む（patch自体を積むと古いpatchの再送で新しい状態を巻き戻すため。LSキャッシュは常に最新なのでマーカー方式が最小で安全）。楽観ロック(updated_at比較)は3名Pilotには過剰なので実装しない。

【編集1】PendingOp の kind に 'learner' を追加。
旧:
interface PendingOp {
  kind: 'progress' | 'session' | 'utterances' | 'feedback' | 'usage';
  payload: unknown;
  at: string;
}
新:
interface PendingOp {
  kind: 'progress' | 'session' | 'utterances' | 'feedback' | 'usage' | 'learner';
  payload: unknown;
  at: string;
}

【編集2】updateLearner 末尾（旧: `await supabase.from('ai_learners').update(row).eq('user_id', u.user.id);`）を置換:
    const { error } = await supabase.from('ai_learners').update(row).eq('user_id', u.user.id);
    if (error) {
      // 学習データの書込失敗を握りつぶさない（監査OPS-1）。
      // LSキャッシュが常に最新のローカル状態なので、再送は「キャッシュの現在値を送り直す」マーカー1件でよい
      // （patchを積むと、後続の成功後に古いpatchが再送され進捗を巻き戻すため）
      const q = (readLS<PendingOp[]>(LS.pending) ?? []).filter((op) => op.kind !== 'learner');
      q.push({ kind: 'learner', payload: { userId: u.user.id }, at: new Date().toISOString() });
      writeLS(LS.pending, q.slice(-100));
    }

【編集3】flushPending のループ内、`} else if (op.kind === 'usage') { ... }` ブロックの直後に追加:
        } else if (op.kind === 'learner') {
          const { userId } = op.payload as { userId: string };
          const { data: u } = await supabase.auth.getUser();
          const cached = readLS<Learner>(LS.learner);
          if (u.user && u.user.id === userId && cached && cached.userId === userId) {
            // LSキャッシュ（常に最新のローカル状態）から学習データを送り直す。
            // 学習者クライアントが書くのは settings と displayName のみ（difficulty等はadmin側の管轄なので触らない）
            const { error } = await supabase.from('ai_learners').update({
              display_name: cached.displayName, settings: cached.settings,
              updated_at: new Date().toISOString(),
            }).eq('user_id', userId);
            if (error) remaining.push(op);
          }
          // ユーザー不一致・キャッシュ消失時は適用せず破棄（他人のrowへ書かない）

【編集4（運用）】docs/ai-course/PILOT_OPERATIONS.md §10 の表（「| 学習が進まない | ...」行の下）に1行追加:
| 端末を変えたら今日の進捗が消えている | 前の端末でアプリを一度開いてもらう（未送信の記録が自動で再送される）。学習は普段使う1台で行うよう案内する（複数端末を同時に併用すると、古い端末の保存が新しい進捗を上書きすることがある） |
