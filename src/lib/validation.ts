import { THIS_MONTH_SENTINEL } from "@/components/dashboard/TimeFilter";

export const ALLOWED_DAY_VALUES = [-1, 7, 30, 90, 180] as const;
export type AllowedDays = (typeof ALLOWED_DAY_VALUES)[number];

export function isValidDays(value: number): boolean {
  if (value === THIS_MONTH_SENTINEL) return true;
  // Accept any positive integer (covers custom date ranges)
  if (Number.isInteger(value) && value > 0) return true;
  return ALLOWED_DAY_VALUES.includes(value as AllowedDays);
}
