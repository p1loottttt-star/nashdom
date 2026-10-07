import assert from 'node:assert/strict';
import { effects, label, roomHour } from '../weather.js';

assert.equal(effects({ code: 0, cloud: 0.1 }).rain, 0);
assert.equal(effects({ code: 63, cloud: 0.4 }).rain, 0.65);
assert.ok(effects({ code: 63, cloud: 0.4 }).clouds >= 0.9); // дождь без туч не бывает
assert.equal(effects({ code: 73, cloud: 1 }).snow, 0.6);
assert.equal(effects({ code: 95, cloud: 1 }).storm, true);
assert.equal(effects({ code: 45, cloud: 0.2 }).fog, 0.85);
assert.equal(effects({ code: 57, cloud: 1 }).rain, 0.3);
assert.equal(label({ code: 0, isDay: false })[0], '🌙');
assert.equal(label({ code: 99 })[1], 'гроза');
// восход 8:00, закат 16:00 (зима) → в шкале комнаты 6.5 и 18.5
assert.equal(roomHour(8, { sunrise: 8, sunset: 16 }), 6.5);
assert.equal(roomHour(16, { sunrise: 8, sunset: 16 }), 18.5);
assert.equal(roomHour(12, { sunrise: 8, sunset: 16 }), 12.5);
assert.equal(roomHour(13, null), 13);
console.log('weather: ok');
