import type { Badge, BadgeConditionContext, UnlockedBadge } from '../types/badge.types';

export const BADGES: Badge[] = [
  { id: 'first-5k', name: 'Prima 5K di Corsa', description: 'Completa almeno 5 km di corsa.', icon: 'bi-trophy', condition: c => c.totalRunKm >= 5 },
  { id: 'steps-7-days', name: '10.000 passi × 7 giorni', description: 'Raggiungi 10.000 passi per 7 giorni consecutivi.', icon: 'bi-footsteps', condition: c => c.consecutiveStepDays >= 7 },
  { id: 'consistency-master', name: 'Master della Costanza', description: 'Completa 4 allenamenti a settimana per un mese.', icon: 'bi-fire', condition: c => c.weeklyWorkoutCount >= 16 },
];

export function evaluateBadges(context: BadgeConditionContext, unlocked: UnlockedBadge[] = []) {
  const now = new Set(unlocked.map(b => b.badgeId));
  const newlyUnlocked: UnlockedBadge[] = [];
  for (const badge of BADGES) {
    if (!now.has(badge.id) && badge.condition(context)) newlyUnlocked.push({ badgeId: badge.id, unlockedAt: new Date().toISOString() });
  }
  return newlyUnlocked;
}
