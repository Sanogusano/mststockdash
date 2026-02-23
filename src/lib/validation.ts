import { THIS_MONTH_SENTINEL } from "@/components/dashboard/TimeFilter";

export const ALLOWED_DAY_VALUES = [-1, 7, 30, 90, 180] as const;
export type AllowedDays = (typeof ALLOWED_DAY_VALUES)[number];

export function isValidDays(value: number): value is AllowedDays {
  if (value === THIS_MONTH_SENTINEL) return true;
  return ALLOWED_DAY_VALUES.includes(value as AllowedDays);
}
