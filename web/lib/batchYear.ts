/** Only a stored four-digit graduation year can be shown as a batch. */
export function graduationBatchYear(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 2000 && value <= 2100 ? value : null;
}
