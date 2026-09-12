/** Map appearance only; never a learner gender or an entitlement. */
export type AdvAvatarStyle = 'flag' | 'male-blue' | 'female-blue';
export const avatarStyleOf = (value: unknown): AdvAvatarStyle =>
  value === 'male-blue' || value === 'female-blue' ? value : 'flag';

const asset = (style: string, pose: string, width: number, height: number) => ({
  webp1x: `/ai-course/map/avatar-${style}-${pose}@1x.webp`,
  webp2x: `/ai-course/map/avatar-${style}-${pose}@2x.webp`,
  width, height,
});
/** Separate poses allow future dialogue artwork without changing saved IDs. */
export const ADV_AVATARS = {
  'male-blue': { ja: '青タオルの旅人・男性', zh: '蓝头巾旅人・男性',
    portrait: asset('male-blue', 'front', 160, 240), map: asset('male-blue', 'back', 32, 48) },
  'female-blue': { ja: '青タオルの旅人・女性', zh: '蓝头巾旅人・女性',
    portrait: asset('female-blue', 'front', 160, 240), map: asset('female-blue', 'back', 32, 48) },
} as const;
