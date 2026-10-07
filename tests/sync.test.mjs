import assert from 'node:assert/strict';
import { parseSource, expected, correction, sourceKey } from '../sync.js';

const yt = (u) => parseSource(u)?.id;
assert.equal(yt('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(yt('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
assert.equal(yt('https://m.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(yt('https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'), 'dQw4w9WgXcQ');
assert.equal(yt('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(parseSource('https://youtu.be/dQw4w9WgXcQ?t=1m30s').start, 90);
assert.equal(parseSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42').start, 42);
assert.equal(parseSource('https://youtube.com/watch?v=short'), null);
assert.deepEqual(parseSource('https://cdn.example.com/film.MP4?token=1'), { type: 'file', url: 'https://cdn.example.com/film.MP4?token=1', hls: false });
assert.equal(parseSource('https://x.tv/live/index.m3u8').hls, true);
assert.equal(parseSource('https://netflix.com/watch/123'), null);
assert.equal(parseSource('javascript:alert(1)'), null);
assert.equal(parseSource('не ссылка'), null);

assert.equal(expected({ playing: false, pos: 10, at: 0 }, 99999), 10);
assert.equal(expected({ playing: true, pos: 10, at: 1000 }, 3500), 12.5);
assert.equal(expected({ playing: true, pos: 10, at: 5000 }, 4000), 10); // часы чуть отстали — назад не отматываем

assert.equal(correction(2, 'file').seek, true);
assert.equal(correction(1, 'yt').seek, false);
assert.equal(correction(-1.5, 'yt').seek, true);
assert.equal(correction(0.02, 'file').rate, 1);
assert.ok(correction(0.4, 'file').rate < 1); // впереди — притормозить
assert.ok(correction(-0.4, 'file').rate > 1); // отстаём — догнать
assert.equal(correction(0.5, 'yt').rate, 1);
assert.equal(sourceKey({ type: 'yt', id: 'abc' }), 'yt:abc');
const P = parseSource;
assert.deepEqual(P('https://vkvideo.ru/video-22822305_456241864'), { type: 'vk', oid: '-22822305', id: '456241864', hash: '', start: 0 });
assert.equal(P('https://vk.com/video?z=video-1_2%2Fpl_1').id, '2');
assert.equal(P('https://vk.com/video_ext.php?oid=-1&id=2&hash=abc').hash, 'abc');
assert.equal(P('https://vk.com/clip-5_6').oid, '-5');
assert.equal(P('https://vk.com/feed'), null);
assert.deepEqual(P('https://rutube.ru/video/32844cfe80e86df0e34700046f5d3ede/'), { type: 'rutube', id: '32844cfe80e86df0e34700046f5d3ede', p: '', start: 0 });
assert.equal(P('https://rutube.ru/video/private/32844cfe80e86df0e34700046f5d3ede/?p=KEY').p, 'KEY');
assert.equal(P('https://www.twitch.tv/videos/123456?t=1h2m3s').start, 3723);
assert.equal(P('https://twitch.tv/SomeStreamer').channel, 'somestreamer');
assert.equal(P('https://twitch.tv/directory'), null);
assert.deepEqual(P('https://vimeo.com/76979871/abc123'), { type: 'vimeo', id: '76979871', h: 'abc123', start: 0 });
assert.equal(P('https://player.vimeo.com/video/76979871?h=ff').h, 'ff');
assert.equal(P('https://disk.yandex.ru/i/AbCdEf').yadisk, true);
assert.equal(P('https://www.dropbox.com/scl/fi/x/film.mp4?rlkey=k&dl=0').url, 'https://www.dropbox.com/scl/fi/x/film.mp4?rlkey=k&raw=1');
assert.equal(sourceKey(P('https://vk.com/video-1_2')), 'vk:-1_2');
console.log('sync: ok');
