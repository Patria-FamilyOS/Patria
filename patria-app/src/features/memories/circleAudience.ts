export function moveNeedsConfirm(currentMemberIds: string[], nextMemberIds: string[]): boolean {
  const current = new Set(currentMemberIds);
  return nextMemberIds.some((id) => id.length > 0 && !current.has(id));
}

export function defaultMemoryCircleId(
  circles: { id: string; kind: string }[],
): string | null {
  const household = circles.find((item) => item.kind === 'household');
  if (household) {
    return household.id;
  }
  const shared = circles.find((item) => item.kind !== 'only_me');
  if (shared) {
    return shared.id;
  }
  return circles[0]?.id ?? null;
}

export function circleExplanation(kind: string): string {
  if (kind === 'household') {
    return 'Household is the people who live together. Only they will see this unless you pick another circle.';
  }
  if (kind === 'extended_family') {
    return 'Extended Family is the wider family, including the household.';
  }
  if (kind === 'close_friends') {
    return 'Close Friends is the people you have named as friends of the family.';
  }
  if (kind === 'only_me') {
    return 'Only you will see this. Nobody else in the family can open it.';
  }
  return 'Only people in this circle will see this.';
}
