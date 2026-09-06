import type { ProgressPhotoDto } from '../../types/progress-photo.types';

export type ProgressPhoto = ProgressPhotoDto;

export function getComparisonPair(photos: ProgressPhoto[]) {
  return [...photos].sort((a, b) => a.date.localeCompare(b.date)).slice(-2);
}

export function comparisonMeta(photo: ProgressPhoto) {
  return `${new Date(photo.date).toLocaleDateString('it-IT')} · ${photo.weightKg ?? '—'} kg · BF ${photo.bodyFat ?? '—'}%`;
}
