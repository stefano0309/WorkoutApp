export type ProgressPhoto = {
  id: string;
  date: string;
  weightKg?: number | null;
  bodyFat?: number | null;
  thumb: string;
};

export function getComparisonPair(photos: ProgressPhoto[]) {
  return [...photos].sort((a, b) => a.date.localeCompare(b.date)).slice(-2);
}

export function comparisonMeta(photo: ProgressPhoto) {
  return `${new Date(photo.date).toLocaleDateString('it-IT')} · ${photo.weightKg ?? '—'} kg · BF ${photo.bodyFat ?? '—'}%`;
}
