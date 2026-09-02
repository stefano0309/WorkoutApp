import type { UnlockedBadge } from '../../types/badge.types';
import { BADGES } from '../../services/badgeEngine.service';

export function BadgeGrid({ unlocked }: { unlocked: UnlockedBadge[] }) {
  const unlockedIds = new Set(unlocked.map(b => b.badgeId));
  return BADGES.map(badge => ({
    ...badge,
    unlocked: unlockedIds.has(badge.id),
  }));
}

export default BadgeGrid;
