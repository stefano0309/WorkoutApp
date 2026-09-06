export type ProgressPhotoDto = {
  id: string;
  date: string;
  weightKg: number | null;
  bodyFat: number | null;
  thumb: string;
};

export type ProgressPhotoInput = {
  id: string;
  date: string;
  weightKg?: number | null;
  bodyFat?: number | null;
  thumb: string;
};

export function normalizeProgressPhoto(input: ProgressPhotoInput): ProgressPhotoDto {
  return {
    id: input.id,
    date: input.date,
    weightKg: input.weightKg ?? null,
    bodyFat: input.bodyFat ?? null,
    thumb: input.thumb,
  };
}
