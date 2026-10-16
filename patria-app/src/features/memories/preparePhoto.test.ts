import { manipulateAsync } from 'expo-image-manipulator';

import { jpegHasGps } from './jpegGps';
import { preparePhoto, resizeForLongEdge, takenAtFromExif } from './preparePhoto';

const manipulate = manipulateAsync as jest.MockedFunction<typeof manipulateAsync>;

describe('preparePhoto', () => {
  it('keeps date taken from EXIF and resizes the long edge', () => {
    const taken = takenAtFromExif({ DateTimeOriginal: '2024:05:01 08:30:00' }, new Date('2026-01-01'));
    expect(taken.toISOString()).toBe('2024-05-01T08:30:00.000Z');
    expect(resizeForLongEdge(4000, 2000, 2048)).toEqual({ width: 2048, height: 1024 });
  });

  it('re-encodes JPEG so uploaded bytes have no GPS', async () => {
    const stripped = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    globalThis.fetch = jest.fn(async () => ({
      arrayBuffer: async () => stripped.buffer,
    })) as unknown as typeof fetch;
    manipulate.mockImplementation(async (uri: string) => ({
      uri: `${uri}-out`,
      width: 800,
      height: 600,
    }));
    const prepared = await preparePhoto({
      uri: 'file://photo.jpg',
      width: 3000,
      height: 2000,
      exif: { GPSLatitude: 51.5, DateTimeOriginal: '2024:05:01 08:30:00' },
    });
    expect(jpegHasGps(prepared.fullBytes)).toBe(false);
    expect(manipulate).toHaveBeenCalled();
  });

  it('uses bundled HTTP sample bytes without the native manipulator', async () => {
    const stripped = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    globalThis.fetch = jest.fn(async () => ({
      arrayBuffer: async () => stripped.buffer,
    })) as unknown as typeof fetch;
    manipulate.mockClear();
    const prepared = await preparePhoto({
      uri: 'http://127.0.0.1:8081/assets/sample1.jpg',
      width: 640,
      height: 480,
      exif: null,
    });
    expect(manipulate).not.toHaveBeenCalled();
    expect(prepared.fullUri).toContain('sample1.jpg');
    expect(prepared.width).toBe(640);
  });
});
