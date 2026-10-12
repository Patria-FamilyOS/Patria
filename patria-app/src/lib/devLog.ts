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

export function describeCaughtError(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object') {
    const rec = error as { code?: unknown; name?: unknown; message?: unknown };
    const code =
      (typeof rec.code === 'string' && rec.code) ||
      (typeof rec.name === 'string' && rec.name) ||
      'unknown';
    const message = typeof rec.message === 'string' ? rec.message : '';
    return { code, message };
  }
  return { code: 'unknown', message: error == null ? '' : String(error) };
}

export function logFailedAction(error: ActionError | unknown | null | undefined): void {
  if (!canLog() || error == null) {
    return;
  }
  const { code, message } = describeCaughtError(error);
  console.warn(`Patria action failed (${code}): ${message}`);
}

export function logKeyStep(step: string, ids?: string): void {
  if (!canLog()) {
    return;
  }
  console.warn(ids ? `Patria keys: ${step} ${ids}` : `Patria keys: ${step}`);
}
