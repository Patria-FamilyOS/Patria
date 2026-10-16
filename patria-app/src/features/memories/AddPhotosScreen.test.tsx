import { fireEvent, waitFor } from '@testing-library/react-native';

import { copy } from '../../lib/copy';
import { renderScreen } from '../../test/renderScreen';
import { AddPhotosScreen } from './AddPhotosScreen';
import { fetchUploaderCircles } from './memoryApi';
import { pickPhotos } from './pickPhotos';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, loading: false }),
}));

jest.mock('../../lib/currentFamily', () => ({
  readCurrentFamilyId: jest.fn(async () => 's1'),
}));

jest.mock('./pickPhotos', () => ({
  pickPhotos: jest.fn(async () => [
    { uri: 'file://a.jpg', width: 100, height: 80, exif: null },
    { uri: 'file://b.jpg', width: 100, height: 80, exif: null },
  ]),
}));

jest.mock('./memoryApi', () => ({
  fetchUploaderCircles: jest.fn(async () => [
    { id: 'hh', name: 'Household', kind: 'household' },
    { id: 'ext', name: 'Extended Family', kind: 'extended_family' },
    { id: 'me', name: 'Only Me', kind: 'only_me' },
  ]),
  uploadPreparedPhoto: jest.fn(async () => 'item'),
}));

jest.mock('./preparePhoto', () => ({
  preparePhoto: jest.fn(async () => ({
    fullUri: 'file://full.jpg',
    thumbUri: 'file://thumb.jpg',
    width: 100,
    height: 80,
    takenAt: '2024-05-01T08:30:00.000Z',
    fullBytes: new Uint8Array([0xff, 0xd8]),
  })),
}));

describe('Add photos', () => {
  it('selects Household by default and explains the circle in plain words', async () => {
    const { findByTestId } = renderScreen(<AddPhotosScreen />);
    expect(pickPhotos).toHaveBeenCalled();
    expect(await findByTestId('circle-household-selected')).toBeTruthy();
    expect(await findByTestId('circle-explanation')).toBeTruthy();
    await waitFor(() => {
      expect(fetchUploaderCircles).toHaveBeenCalled();
    });
  });

  it('offers Share after photos are picked', async () => {
    const { findByText } = renderScreen(<AddPhotosScreen />);
    const share = await findByText(copy.memories.share);
    fireEvent.press(share);
    await waitFor(() => {
      expect(share).toBeTruthy();
    });
  });
});
