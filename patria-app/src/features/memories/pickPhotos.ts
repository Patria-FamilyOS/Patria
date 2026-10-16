import * as ImagePicker from 'expo-image-picker';

import type { PickedPhoto } from './preparePhoto';

export async function pickPhotos(): Promise<PickedPhoto[] | 'cancelled'> {
  if (process.env.EXPO_PUBLIC_E2E === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadE2ePickedPhotos } = require('./e2ePhotoSamples.bundle') as typeof import('./e2ePhotoSamples.bundle');
    return loadE2ePickedPhotos();
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    exif: true,
    quality: 1,
  });
  if (result.canceled) {
    return 'cancelled';
  }
  return result.assets.map((asset) => ({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    exif: asset.exif ?? null,
  }));
}
