import { useEffect } from 'react';
import type { Badge, UnlockedBadge } from '../../types/badge.types';
import './badge-unlock.css';

export type BadgeUnlockFeedbackProps = {
  badge: Badge | null;
  unlocked: UnlockedBadge | null;
  onDismiss?: () => void;
  durationMs?: number;
};

/** Non-blocking celebration for a newly unlocked badge. */
export function BadgeUnlockFeedback({
  badge,
  unlocked,
  onDismiss,
  durationMs = 4200,
}: BadgeUnlockFeedbackProps) {
  useEffect(() => {
    if (!badge || !unlocked) return undefined;
    const timer = window.setTimeout(() => onDismiss?.(), durationMs);
    return () => window.clearTimeout(timer);
  }, [badge, unlocked, durationMs, onDismiss]);

  useEffect(() => {
    if (!badge || !unlocked || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(18);
  }, [badge, unlocked]);

  if (!badge || !unlocked) return null;

  return (
    <div
      className="badge-unlock-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-badge-id={badge.id}
    >
      <span className="badge-unlock-feedback__icon" aria-hidden="true">
        <i className={`bi ${badge.icon}`} />
      </span>
      <div className="badge-unlock-feedback__content">
        <strong>Badge sbloccato</strong>
        <span>{badge.name}</span>
        <small>{badge.description}</small>
      </div>
      <button
        type="button"
        className="badge-unlock-feedback__close"
        aria-label="Chiudi notifica badge"
        onClick={onDismiss}
      >
        <i className="bi bi-x-lg" aria-hidden="true" />
      </button>
    </div>
  );
}

export default BadgeUnlockFeedback;
