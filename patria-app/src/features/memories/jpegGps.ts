const GPS_ASCII = new TextEncoder().encode('GPS');
const GPS_IFD_BE = new Uint8Array([0x88, 0x25]);
const GPS_IFD_LE = new Uint8Array([0x25, 0x88]);

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || haystack.length < needle.length) {
    return false;
  }
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

function segmentHasGps(payload: Uint8Array): boolean {
  return contains(payload, GPS_ASCII) || contains(payload, GPS_IFD_BE) || contains(payload, GPS_IFD_LE);
}

export function jpegHasGps(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      return false;
    }
    while (i < bytes.length && bytes[i] === 0xff) {
      i += 1;
    }
    if (i >= bytes.length) {
      return false;
    }
    const marker = bytes[i];
    i += 1;
    if (marker === 0xda || marker === 0xd9) {
      return false;
    }
    if (marker >= 0xd0 && marker <= 0xd8) {
      continue;
    }
    if (i + 1 >= bytes.length) {
      return false;
    }
    const len = (bytes[i] << 8) | bytes[i + 1];
    if (len < 2 || i + len > bytes.length) {
      return false;
    }
    const payload = bytes.subarray(i + 2, i + len);
    if (marker === 0xe1 && segmentHasGps(payload)) {
      return true;
    }
    i += len;
  }
  return false;
}
