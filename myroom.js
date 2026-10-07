// Своя комната каждой половинки: стены, пол, стол и где что стоит. Хранится в store ('room', id человека).
import * as store from './store.js';
import { DEFAULT_ROOM, ownedStyles, inventory } from './catalog.js';

const subs = new Set();
export const getRoom = (uid = store.me()?.id) => ({ ...DEFAULT_ROOM, ...(store.get('room', uid) || {}) });
export const hasRoom = () => !!store.get('room', store.me()?.id)?.setup;
export const onRoom = (cb) => { subs.add(cb); return () => subs.delete(cb); };
const emit = () => subs.forEach((f) => { try { f(getRoom()); } catch (e) { console.warn(e); } });

// patch: { wall, floor, desk, deskColor, place, setup }; store.put сразу кладёт в память, сеть — следом
export function saveRoom(patch) {
  const next = { ...getRoom(), ...patch };
  store.put('room', store.me().id, next).catch(console.warn);
  emit();
}
// правка с другого устройства этого же человека
store.on('room', (id) => { if (id === store.me()?.id) emit(); });

export const myStyles = () => ownedStyles(store.ledger(), store.me().id);
export const myThings = () => inventory(store.ledger(), store.me().id);
