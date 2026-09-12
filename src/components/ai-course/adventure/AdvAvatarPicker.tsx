import { useState } from 'react';
import { ADV_AVATARS, avatarStyleOf, type AdvAvatarStyle } from '../../../lib/aiLesson/course/adventure/advAvatar';

/**
 * 旅人は男性・女性の2択（2026-09-13 CEO指示）。「表示しない（青い旗）」は選べない。
 * 旗は未選択のときの見た目としてだけ残る（古いプロフィール・画像が読めないとき）。
 *
 * mode:
 *   'map'        … 冒険マップの折りたたみ（既定は閉じている）
 *   'onboarding' … 初期設定。見出しは親が出すので、選択肢だけを常に開いて出す
 */
export const AdvAvatarPicker = ({ lang, value, onChange, mode = 'map' }: {
  mode?: 'map' | 'onboarding'; lang: 'ja' | 'zh'; value?: AdvAvatarStyle; onChange: (style: AdvAvatarStyle) => void;
}) => {
  const [open, setOpen] = useState(mode === 'onboarding');
  const selected = avatarStyleOf(value);
  const zh = lang === 'zh';
  return <section className="mt-3 rounded-2xl border border-sky-200 bg-[#FBF5EC] p-3" aria-label={zh ? '选择旅人' : '旅人を選ぶ'}>
    {mode === 'map' && (
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600">
        <span>{zh ? '选择旅人' : '旅人を選ぶ'}</span>
        <span className="text-xs text-slate-600">{selected === 'flag' ? (zh ? '未选择' : '未選択') : ADV_AVATARS[selected][lang]} {open ? '−' : '＋'}</span>
      </button>
    )}
    {open && <div>
      {mode === 'map' && <p className="mb-3 text-xs leading-relaxed text-slate-600">{zh
        ? '选择地图上代表你的外观。与个人性别信息无关，随时可以更换。'
        : '地図で自分を表す見た目を選びます。プロフィールの性別とは関係なく、いつでも変更できます。'}</p>}
      <div className="grid grid-cols-2 gap-3">
        {(['male-blue', 'female-blue'] as const).map(style => {
          const a = ADV_AVATARS[style];
          return <button type="button" key={style} aria-pressed={selected === style} onClick={() => onChange(style)}
            className={`overflow-hidden rounded-xl border-2 bg-[#FBF5EC] text-sm text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600 ${selected === style ? 'border-blue-600' : 'border-transparent'}`}>
            <img src={a.portrait.webp1x} srcSet={`${a.portrait.webp1x} 1x, ${a.portrait.webp2x} 2x`} width={160} height={240} alt="" loading="lazy" decoding="async" className="h-44 w-full object-contain" />
            <span className="flex min-h-11 items-center justify-center px-1">{a[lang]}{selected === style ? ' ✓' : ''}</span>
          </button>;
        })}
      </div>
    </div>}
  </section>;
};
