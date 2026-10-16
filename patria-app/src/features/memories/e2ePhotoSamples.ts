type E2ePhotoModule = {
  loadE2ePickedPhotos?: () => unknown;
};

export function assertE2ePhotoSamplesGated(): void {
  if (process.env.EXPO_PUBLIC_E2E === '1') {
    return;
  }
  let loaded: E2ePhotoModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('./e2ePhotoSamples.bundle') as E2ePhotoModule;
  } catch {
    return;
  }
  let samples: unknown;
  try {
    samples = loaded.loadE2ePickedPhotos?.();
  } catch {
    return;
  }
  if (samples) {
    throw new Error('E2E photo samples are reachable in a non-e2e build.');
  }
}
