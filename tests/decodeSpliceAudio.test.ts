import { describe, it, expect } from 'vitest';
import { decodeSpliceAudio } from '../src/splice/decoder';

describe('decodeSpliceAudio', () => {
  it('should return a Uint8Array of same length for trivial scrambled data', () => {
    // Minimal synthetic scrambled buffer: 2 bytes + size(8) + key(18) + payload
    const payload = new Uint8Array([1,2,3,4,5,6,7,8,9,10]);
    const data = new Uint8Array(2 + 8 + 18 + payload.length);
    data.set([0,0], 0);
    // size little-endian written reversed by algorithm; use payload.length repeated
    const sizeBytes = new Array(8).fill(0);
    sizeBytes[0] = payload.length;
    data.set(sizeBytes, 2);
    // fill key (18 bytes)
    const key = new Array(18).fill(0x2a); // '*'
    data.set(key, 10);
    // copy payload
    data.set(payload, 28);

    const out = decodeSpliceAudio(data);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(payload.length);
  });
});


