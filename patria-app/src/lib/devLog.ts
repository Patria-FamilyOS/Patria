type ActionError = {
  code?: string;
  message?: string;
};

export function logFailedAction(error: ActionError | null | undefined): void {
  if (!__DEV__ || !error) {
    return;
  }
  const code = error.code ?? 'unknown';
  const message = error.message ?? '';
  console.warn(`Patria action failed (${code}): ${message}`);
}
