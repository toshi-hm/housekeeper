export interface PendingLotRemoval {
  lotId: string;
  itemId: string;
  itemName: string;
  units: number;
  openedRemaining: number | null;
  logId: string | null;
}

export const computeCalendarDelta = (
  units: number,
  openedRemaining: number | null,
  contentAmount: number,
): number => {
  if (openedRemaining !== null) {
    return Math.max(0, units - 1) * contentAmount + openedRemaining;
  }
  return units * contentAmount;
};
