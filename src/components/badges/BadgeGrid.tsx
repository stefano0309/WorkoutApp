import type { ReactNode } from 'react';
import type { BadgeConditionContext, UnlockedBadge } from '../../types/badge.types';
import { getBadgeState } from '../../services/badgeEngine.service';

export type BadgeGridProps = {
  context: BadgeConditionContext;
  unlocked: UnlockedBadge[];
  renderBadge?: (badge: ReturnType<typeof getBadgeState>[number]) => ReactNode;
};

export function BadgeGrid({ context, unlocked, renderBadge }: BadgeGridProps) {
  const badges = getBadgeState(context, unlocked);

  return (
    <div className="badge-grid" role="list">
      {badges.map((badge) => (
        <div key={badge.id} role="listitem">
          {renderBadge ? renderBadge(badge) : badge.name}
        </div>
      ))}
    </div>
  );
}

export default BadgeGrid;
