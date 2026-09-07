import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_HEIC_BYTES,
  VersionOwner,
  baseName,
  hasHeicSignature,
  isPng,
  validateHeicFile,
  validateImageDimensions,
} from '../src/heic-core.js';

function ftyp(...brands) {
  const bytes = new Uint8Array(8 + brands.length * 4);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  brands.forEach((brand, index) => bytes.set(new TextEncoder().encode(brand), 8 + index * 4));
  return bytes;
}

test('HEIC signature accepts supported major and compatible brands only', () => {
  assert.equal(hasHeicSignature(ftyp('heic', 'mif1')), true);
  assert.equal(hasHeicSignature(ftyp('avif', 'hevs')), true);
  assert.equal(hasHeicSignature(ftyp('avif', 'avis')), false);
  assert.equal(hasHeicSignature(new Uint8Array(11)), false);
});

test('HEIC input limits are 20 MiB, 10000 edge, and 30 MP', () => {
  assert.equal(MAX_HEIC_BYTES, 20 * 1024 * 1024);
  assert.doesNotThrow(() => validateHeicFile({ size: MAX_HEIC_BYTES }));
  assert.throws(() => validateHeicFile({ size: MAX_HEIC_BYTES + 1 }), /20 MiB/);
  assert.doesNotThrow(() => validateImageDimensions(6000, 5000));
  assert.throws(() => validateImageDimensions(10001, 1), /10000/);
  assert.throws(() => validateImageDimensions(6001, 5000), /3000 万/);
});

test('converted adapter output must be a verified PNG', () => {
  const signature = new Uint8Array([137,80,78,71,13,10,26,10]);
  assert.equal(isPng('image/png', signature), true);
  assert.equal(isPng('image/jpeg', signature), false);
  assert.equal(isPng('image/png', new Uint8Array(8)), false);
});

test('selection ownership rejects stale asynchronous work', () => {
  const owner = new VersionOwner();
  const first = owner.next();
  const second = owner.next();
  assert.equal(owner.isCurrent(first), false);
  assert.equal(owner.isCurrent(second), true);
  assert.equal(baseName('identity.card.HEIC'), 'identity.card');
});
