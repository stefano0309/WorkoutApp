import { useId, useState } from 'react';
import type { ProgressPhotoDto } from '../../types/progress-photo.types';
import './photo-comparison.css';

export type ProgressPhoto = ProgressPhotoDto;
export type ComparableProgressPhoto = ProgressPhoto & {
  session?: string | null;
};

export type PhotoComparisonProps = {
  before: ComparableProgressPhoto | null;
  after: ComparableProgressPhoto | null;
  initialPosition?: number;
  title?: string;
};

export function getComparisonPair(photos: ProgressPhoto[]) {
  return [...photos].sort((a, b) => a.date.localeCompare(b.date)).slice(-2);
}

export function comparisonMeta(photo: ProgressPhoto) {
  return `${new Date(photo.date).toLocaleDateString('it-IT')} · ${photo.weightKg ?? '—'} kg · BF ${photo.bodyFat ?? '—'}%`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('it-IT');
}

function formatContext(photo: ComparableProgressPhoto) {
  const details = [
    formatDate(photo.date),
    photo.session?.trim(),
  ].filter(Boolean);

  return details.join(' · ');
}

function PhotoPane({
  photo,
  label,
  onError,
}: {
  photo: ComparableProgressPhoto | null;
  label: string;
  onError: () => void;
}) {
  const hasSource = Boolean(photo?.thumb);

  return (
    <div className="photo-comparison__pane" aria-label={label}>
      <div className="photo-comparison__pane-label">{label}</div>
      {hasSource ? (
        <img
          className="photo-comparison__image"
          src={photo?.thumb}
          alt={`${label} — ${photo ? formatContext(photo) : 'foto non disponibile'}`}
          loading="lazy"
          decoding="async"
          onError={onError}
        />
      ) : (
        <div className="photo-comparison__placeholder" role="status">
          Foto non disponibile
        </div>
      )}
    </div>
  );
}

export function PhotoComparison({
  before,
  after,
  initialPosition = 50,
  title = 'Confronto foto progressi',
}: PhotoComparisonProps) {
  const sliderId = useId();
  const [position, setPosition] = useState(() => Math.min(100, Math.max(0, initialPosition)));
  const [beforeError, setBeforeError] = useState(false);
  const [afterError, setAfterError] = useState(false);
  const hasPair = Boolean(before?.thumb && after?.thumb);

  if (!before && !after) {
    return (
      <section className="photo-comparison" aria-labelledby={`${sliderId}-title`}>
        <h2 id={`${sliderId}-title`} className="photo-comparison__title">{title}</h2>
        <div className="photo-comparison__empty" role="status">
          Aggiungi due foto di progresso per iniziare il confronto.
        </div>
      </section>
    );
  }

  const clipRight = `${100 - position}%`;

  return (
    <section className="photo-comparison" aria-labelledby={`${sliderId}-title`}>
      <div className="photo-comparison__header">
        <h2 id={`${sliderId}-title`} className="photo-comparison__title">{title}</h2>
        <p className="photo-comparison__hint">Sposta il cursore per confrontare le due foto.</p>
      </div>

      <div className="photo-comparison__viewport">
        <PhotoPane
          photo={afterError ? null : after}
          label="Dopo"
          onError={() => setAfterError(true)}
        />
        <div
          className="photo-comparison__before-layer"
          style={{ clipPath: `inset(0 ${clipRight} 0 0)` }}
          aria-hidden="true"
        >
          <PhotoPane
            photo={beforeError ? null : before}
            label="Prima"
            onError={() => setBeforeError(true)}
          />
        </div>
        {hasPair ? (
          <div className="photo-comparison__divider" style={{ left: `${position}%` }} aria-hidden="true" />
        ) : null}
      </div>

      <div className="photo-comparison__metadata" aria-label="Metadati delle foto">
        <div>
          <strong>Prima</strong>
          <span>{before ? formatContext(before) : 'Non disponibile'}</span>
        </div>
        <div>
          <strong>Dopo</strong>
          <span>{after ? formatContext(after) : 'Non disponibile'}</span>
        </div>
      </div>

      <label className="photo-comparison__control" htmlFor={sliderId}>
        Posizione confronto
      </label>
      <input
        id={sliderId}
        className="photo-comparison__slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value={position}
        disabled={!hasPair}
        aria-label="Posizione confronto tra prima e dopo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position}
        onChange={(event) => setPosition(Number(event.currentTarget.value))}
      />

      <div className="photo-comparison__sr-status" role="status" aria-live="polite">
        Mostrata la foto Prima al {position}%.
      </div>
    </section>
  );
}

export default PhotoComparison;
