import { jpegHasGps } from './jpegGps';

function jpegWithGps(): Uint8Array {
  const soi = [0xff, 0xd8];
  const app1 = [0xff, 0xe1, 0x00, 0x0c, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x47, 0x50, 0x53, 0x00];
  const eoi = [0xff, 0xd9];
  return Uint8Array.from([...soi, ...app1, ...eoi]);
}

function jpegPlain(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
}

function jpegWithGpsBytesInImageData(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x00, 0x01, 0x47, 0x50, 0x53, 0x88,
    0x25, 0xff, 0xd9,
  ]);
}

describe('jpeg GPS detection', () => {
  it('finds GPS in EXIF bytes and not in a stripped JPEG', () => {
    expect(jpegHasGps(jpegWithGps())).toBe(true);
    expect(jpegHasGps(jpegPlain())).toBe(false);
    expect(jpegHasGps(jpegWithGpsBytesInImageData())).toBe(false);
  });
});
