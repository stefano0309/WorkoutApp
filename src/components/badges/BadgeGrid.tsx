import type { ReactNode } from 'react';
import type { BadgeConditionContext, UnlockedBadge } from '../../types/badge.types';
import { getBadgeState } from '../../services/badgeEngine.service';
import './badge-grid.css';

export type BadgeGridProps = {
  context: BadgeConditionContext;
  unlocked: UnlockedBadge[];
  renderBadge?: (badge: ReturnType<typeof getBadgeState>[number]) => ReactNode;
};

export function BadgeGrid({ context, unlocked, renderBadge }: BadgeGridProps) {
  const badges = getBadgeState(context, unlocked);
  const unlockedCount = badges.filter((badge) => badge.unlocked).length;

  return (
    <section className="badge-grid-section" aria-labelledby="badge-grid-title">
      <div className="badge-grid-header">
        <div>
          <h2 id="badge-grid-title">Badge</h2>
          <p className="badge-grid-summary" aria-live="polite">
            {unlockedCount} di {badges.length} sbloccati
          </p>
        </div>
      </div>

      <div className="badge-grid" role="list" aria-label="Progressione badge">
        {badges.map((badge) => {
          const stateLabel = badge.unlocked ? 'Sbloccato' : 'Bloccato';
          const descriptionId = `badge-${badge.id}-description`;
          const statusId = `badge-${badge.id}-status`;

          return (
            <article
              key={badge.id}
              className={`badge-grid-card${badge.unlocked ? ' is-unlocked' : ' is-locked'}`}
              role="listitem"
              aria-describedby={`${descriptionId} ${statusId}`}
              data-unlocked={badge.unlocked ? 'true' : 'false'}
            >
              <div className="badge-grid-icon" aria-hidden="true">
                <i className={`bi ${badge.icon}`} />
              </div>

              <div className="badge-grid-content">
                <h3>{badge.name}</h3>
                <p id={descriptionId}>{badge.description}</p>
                <span id={statusId} className="badge-grid-status">
                  {stateLabel}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default BadgeGrid;
