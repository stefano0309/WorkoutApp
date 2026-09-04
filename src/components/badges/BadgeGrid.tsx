import type { ReactNode } from 'react';
import type { UnlockedBadge } from '../../types/badge.types';
import { BADGES } from '../../services/badgeEngine.service';

export type BadgeGridProps = {
  unlocked: UnlockedBadge[];
  renderBadge?: (badge: (typeof BADGES)[number] & { unlocked: boolean }) => ReactNode;
};

export function BadgeGrid({ unlocked, renderBadge }: BadgeGridProps) {
  const unlockedIds = new Set(unlocked.map((badge) => badge.badgeId));

  return (
    <div className="badge-grid" role="list">
      {BADGES.map((badge) => {
        const item = {
          ...badge,
          unlocked: unlockedIds.has(badge.id),
        };

        return (
          <div key={badge.id} role="listitem">
            {renderBadge ? renderBadge(item) : badge.name}
          </div>
        );
      })}
    </div>
  );
}

export default BadgeGrid;
