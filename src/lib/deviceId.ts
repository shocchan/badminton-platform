// ゲスト端末の識別ID。localStorageに保存し、ゲームのプレイ記録・当選情報を
// この端末に紐付ける。会員登録時（フェーズ③）にアカウントへ引き継ぐ。

const STORAGE_KEY = 'kawabado_device_uuid';

export function getDeviceUuid(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const uuid = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, uuid);
    return uuid;
  } catch {
    // プライベートモード等でlocalStorageが使えない場合はセッション限りのID
    return 'no-storage-' + Math.random().toString(36).slice(2, 18);
  }
}
