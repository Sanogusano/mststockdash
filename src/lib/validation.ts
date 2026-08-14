import { THIS_MONTH_SENTINEL, PREV_MONTH_SENTINEL, YESTERDAY_SENTINEL } from "@/components/dashboard/TimeFilter";

export const ALLOWED_DAY_VALUES = [THIS_MONTH_SENTINEL, PREV_MONTH_SENTINEL, YESTERDAY_SENTINEL, 7, 30, 90, 120, 180] as const;
export type AllowedDays = (typeof ALLOWED_DAY_VALUES)[number];

export function isValidDays(value: number): boolean {
  if (value === THIS_MONTH_SENTINEL || value === PREV_MONTH_SENTINEL || value === YESTERDAY_SENTINEL) return true;
  // Accept any positive integer (covers custom date ranges y 15 días)
  if (Number.isInteger(value) && value >= 0) return true;
  return ALLOWED_DAY_VALUES.includes(value as AllowedDays);
}
