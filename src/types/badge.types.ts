export type BadgeConditionContext = {
  totalRunKm: number;
  consecutiveStepDays: number;
  /** Number of completed workouts in each of the last four calendar weeks, oldest first. */
  weeklyWorkoutCounts: number[];
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
