// разбор звуковых дорожек mkv на собранном вручную заголовке
import assert from 'node:assert/strict';
import { audioTracks, trackLabel } from '../mkvtracks.js';

const enc = (s) => [...new TextEncoder().encode(s)];
const el = (id, payload) => [...id, 0x80 | payload.length, ...payload]; // размер одним байтом (< 127)
const entry = (type, codec, lang, name) => el([0xae], [...el([0x83], [type]), ...el([0x86], enc(codec)), ...(lang ? el([0x22, 0xb5, 0x9c], enc(lang)) : []), ...(name ? el([0x53, 0x6e], enc(name)) : [])]);
const tracks = el([0x16, 0x54, 0xae, 0x6b], [...entry(1, 'V_MPEG4/ISO/AVC'), ...entry(2, 'A_AC3', 'rus', 'Дубляж'), ...entry(2, 'A_AAC', 'eng')]);
const mkv = new Uint8Array([...el([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x82, 0x84, ...enc('matr')]),
  0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, // Segment неизвестной длины
  ...el([0x15, 0x49, 0xa9, 0x66], [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]), ...tracks, 0x1f, 0x43, 0xb6, 0x75, 0x81, 0x00]);
const t = await audioTracks(new File([mkv], 'x.mkv'));
assert.deepEqual(t, [{ i: 0, codec: 'AC3', lang: 'русский', name: 'Дубляж' }, { i: 1, codec: 'AAC', lang: 'английский', name: '' }]);
assert.equal(trackLabel(t[0]), '1 · русский · Дубляж · AC3');
assert.deepEqual(await audioTracks(new File([new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])], 'x.mp4')), []); // не mkv
console.log('mkvtracks: ok');
