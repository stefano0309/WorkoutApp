export type BadgeConditionContext = {
  totalRunKm: number;
  consecutiveStepDays: number;
  weeklyWorkoutCount: number;
  totalWorkoutCount: number;
};

export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (context: BadgeConditionContext) => boolean;
};

export type UnlockedBadge = {
  badgeId: string;
  unlockedAt: string;
};
