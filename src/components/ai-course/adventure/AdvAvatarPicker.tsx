import { useState } from 'react';
import { Flag } from 'lucide-react';
import { ADV_AVATARS, avatarStyleOf, type AdvAvatarStyle } from '../../../lib/aiLesson/course/adventure/advAvatar';

export const AdvAvatarPicker = ({ lang, value, onChange, defaultOpen = false }: {
  defaultOpen?: boolean; lang: 'ja' | 'zh'; value?: AdvAvatarStyle; onChange: (style: AdvAvatarStyle) => void;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const selected = avatarStyleOf(value);
  const zh = lang === 'zh';
  return <section className="mt-3 rounded-2xl border border-sky-200 bg-[#FBF5EC] p-3" aria-label={zh ? '选择旅人' : '旅人を選ぶ'}>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600">
      <span>{zh ? '选择旅人' : '旅人を選ぶ'}</span>
      <span className="text-xs text-slate-600">{selected === 'flag' ? (zh ? '蓝旗' : '青い旗') : ADV_AVATARS[selected][lang]} {open ? '−' : '＋'}</span>
    </button>
    {open && <div>
      <p className="mb-3 text-xs leading-relaxed text-slate-600">{zh
        ? '选择地图上代表你的外观。与个人性别信息无关，随时可以更换。'
        : '地図で自分を表す見た目を選びます。プロフィールの性別とは関係なく、いつでも変更できます。'}</p>
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
      <button type="button" aria-pressed={selected === 'flag'} onClick={() => onChange('flag')}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600">
        <Flag className="h-4 w-4 text-blue-600" aria-hidden />
        {zh ? '不显示角色（使用蓝旗）' : 'キャラクターを表示しない（青い旗）'}{selected === 'flag' ? ' ✓' : ''}
      </button>
    </div>}
  </section>;
};
