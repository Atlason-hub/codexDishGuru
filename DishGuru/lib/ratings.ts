export const scoreToStars = (score?: number | null) => {
  if (score === null || score === undefined || Number.isNaN(score)) return 0;
  const raw = score <= 5 ? score : score / 20;
  const rounded = Math.round(raw * 2) / 2;
  return Math.max(0, Math.min(5, rounded));
};

export const starsToScore = (stars: number) => {
  const clamped = Math.max(0, Math.min(5, stars));
  return Math.round(clamped * 20);
};

export const formatStars = (stars: number) =>
  stars % 1 === 0 ? stars.toFixed(0) : stars.toFixed(1);

export const getStarStates = (stars: number) => {
  const list: Array<'full' | 'half' | 'empty'> = [];
  for (let i = 1; i <= 5; i += 1) {
    if (stars >= i) list.push('full');
    else if (stars >= i - 0.5) list.push('half');
    else list.push('empty');
  }
  return list;
};

export { RATING_IMAGES } from './ratingIcons';

export const getSelectedEmojiIndex = (stars: number) => {
  if (!Number.isFinite(stars) || stars <= 0) return null;
  const rounded = Math.round(stars);
  const clamped = Math.max(1, Math.min(5, rounded));
  return clamped - 1;
};
