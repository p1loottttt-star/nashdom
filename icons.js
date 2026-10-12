// Значки интерфейса комнаты — Phosphor (MIT), SVG вписываются в сборку (?raw), без шрифта-иконок
import images from '@phosphor-icons/core/regular/images-square.svg?raw';
import pencil from '@phosphor-icons/core/regular/pencil-simple-line.svg?raw';
import armchair from '@phosphor-icons/core/regular/armchair.svg?raw';
import laptop from '@phosphor-icons/core/regular/laptop.svg?raw';
import bell from '@phosphor-icons/core/regular/bell-simple.svg?raw';
import heart from '@phosphor-icons/core/fill/heart-fill.svg?raw';
import fire from '@phosphor-icons/core/fill/fire-fill.svg?raw';
import x from '@phosphor-icons/core/regular/x.svg?raw';
import hand from '@phosphor-icons/core/regular/hand-grabbing.svg?raw';
import shop from '@phosphor-icons/core/regular/storefront.svg?raw';
import sound from '@phosphor-icons/core/regular/speaker-high.svg?raw';
import mute from '@phosphor-icons/core/regular/speaker-slash.svg?raw';
import plus from '@phosphor-icons/core/regular/plus.svg?raw';
import gallery from '@phosphor-icons/core/regular/images.svg?raw';
import chat from '@phosphor-icons/core/regular/chat-circle-text.svg?raw';

const ICONS = { images, pencil, armchair, laptop, bell, heart, fire, x, hand, shop, sound, mute, plus, gallery, chat };
// у regular нет fill — краска текстом (currentColor), размер — шрифтом (1em)
export const icon = (name) => ICONS[name].replace('<svg ', '<svg class="ic" width="1em" height="1em" fill="currentColor" aria-hidden="true" ');
