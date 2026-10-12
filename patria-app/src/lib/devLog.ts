type ActionError = {
  code?: string;
  message?: string;
};

function canLog(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'production') {
    return false;
  }
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function logFailedAction(error: ActionError | null | undefined): void {
  if (!canLog() || !error) {
    return;
  }
  const code = error.code ?? 'unknown';
  const message = error.message ?? '';
  console.warn(`Patria action failed (${code}): ${message}`);
}

export function logKeyStep(step: string, ids?: string): void {
  if (!canLog()) {
    return;
  }
  console.warn(ids ? `Patria keys: ${step} ${ids}` : `Patria keys: ${step}`);
}
