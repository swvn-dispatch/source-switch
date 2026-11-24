import test from 'node:test';
import assert from 'node:assert/strict';
import { audioFields, audioSummary, audioTracks, compactResolution, duration, finiteNumber } from './streamStats.js';

test('uses the first detected track rather than the best summary', () => {
  const stats = { audio_codec: 'ac3', audio_streams: [null, { audio_language: 'eng', audio_codec: 'aac', audio_channels: 'stereo' }, { audio_codec: 'ac3' }] };
  assert.equal(audioSummary(audioTracks(stats)[0]), 'ENG stereo AAC');
  assert.equal(audioTracks(stats).length, 2);
  assert.deepEqual(audioTracks({ audio_streams: 'invalid' }), []);
  assert.equal(audioSummary({ audio_codec: 'aac' }), 'AAC');
});

test('formats partial track details and zero selectors', () => {
  assert.deepEqual(audioFields({ index: 0, audio_bitrate: 0, sample_rate: 48000 }), [
    ['Bitrate', '0 kbps'], ['Sample rate', '48000 Hz'], ['Stream', '0:0'],
  ]);
  assert.deepEqual(audioFields({ pid: 0 }), [['Stream', 'i:0']]);
  assert.deepEqual(audioFields({}), []);
});

test('validates durations and numeric speed', () => {
  assert.equal(duration(0), 0);
  assert.equal(duration('4.25'), 4.25);
  for (const value of ['', ' ', null, false, 'NaN', Infinity, -1]) assert.equal(duration(value), null);
  assert.equal(finiteNumber('1.02'), 1.02);
  assert.equal(finiteNumber('1.02x'), null);
});

test('shortens common resolutions and preserves unknown ones', () => {
  assert.equal(compactResolution('1920x1080'), '1080p');
  assert.equal(compactResolution('3840x2160'), '4K');
  assert.equal(compactResolution('1440x1080'), '1440x1080');
});
