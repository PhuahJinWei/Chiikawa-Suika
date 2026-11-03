import type { AbilityId } from '../config/game';

/** Hand-drawn style inline SVG icons for the abilities (stroke = currentColor). */
const svg = (body: string) =>
  `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS: Record<AbilityId, string> = {
  shake: svg(
    `<rect x="13" y="14" width="22" height="24" rx="5" fill="#ffdae0"/>
     <circle cx="20" cy="31" r="3.4" fill="#fff"/><circle cx="28" cy="25" r="4" fill="#fff"/>
     <path d="M6 18c-2 3-2 7 0 10M42 18c2 3 2 7 0 10M9 21c-1 2-1 3 0 5M39 21c1 2 1 3 0 5"/>`,
  ),
  remove: svg(
    `<path d="M28 9l11 11" /><rect x="17" y="6" width="16" height="12" rx="4" transform="rotate(45 25 12)" fill="#ffdae0"/>
     <path d="M21 21L8 38" stroke-width="4.2"/>
     <path d="M30 34l3-3M34 40l1-4M40 32l-4 1" />`,
  ),
  pick: svg(
    `<circle cx="17" cy="17" r="9" fill="#fff3c2"/><circle cx="31" cy="31" r="9" fill="#dcebf5"/>
     <path d="M30 9c5 0 9 4 9 9M39 18l-3-3M39 18l3-3M18 39c-5 0-9-4-9-9M9 30l-3 3M9 30l3 3"/>`,
  ),
  flip: svg(
    `<rect x="15" y="13" width="18" height="22" rx="4" fill="#e3f2dc"/>
     <path d="M9 22a15 15 0 0 1 24-12M33 10l1-6M33 10l-6-1M39 26a15 15 0 0 1-24 12M15 38l-1 6M15 38l6 1"/>`,
  ),
};

/** Icons for the menus, in the same style. */
export const UI_ICONS = {
  retry: svg(
    `<circle cx="24" cy="25" r="8" fill="#ffdae0" stroke="none"/>
     <path d="M37 26a13 13 0 1 1-4-10.5"/><path d="M34.5 7.5l-1 8.5-8.5-1"/>`,
  ),
  help: svg(
    `<circle cx="24" cy="24" r="16" fill="#dcebf5"/>
     <path d="M18.5 19.5a5.5 5.5 0 1 1 7.6 5.1c-1.4.6-2.1 1.7-2.1 3.1v1.3"/><circle cx="24" cy="34.5" r="0.6"/>`,
  ),
  gear: svg(
    `<path d="M24 6v6M24 36v6M6 24h6M36 24h6M11.3 11.3l4.2 4.2M32.5 32.5l4.2 4.2M11.3 36.7l4.2-4.2M32.5 15.5l4.2-4.2"/>
     <circle cx="24" cy="24" r="11" fill="#fff3c2"/><circle cx="24" cy="24" r="4"/>`,
  ),
  home: svg(
    `<path d="M13 21v17h22V21" fill="#e3f2dc"/><path d="M7 24L24 9l17 15"/><path d="M21 38v-8h6v8"/>`,
  ),
  sparkle: svg(
    `<path d="M22 5c1.6 9.4 4.2 12 13.6 13.6C26.2 20.2 23.6 22.8 22 32.2 20.4 22.8 17.8 20.2 8.4 18.6 17.8 17 20.4 14.4 22 5z" fill="#fff3c2"/>
     <path d="M36 28c.8 4 2 5.2 6 6-4 .8-5.2 2-6 6-.8-4-2-5.2-6-6 4-.8 5.2-2 6-6z" fill="#ffdae0" stroke-width="2.6"/>
     <path d="M11 34c.5 2.6 1.4 3.5 4 4-2.6.5-3.5 1.4-4 4-.5-2.6-1.4-3.5-4-4 2.6-.5 3.5-1.4 4-4z" fill="#dcebf5" stroke-width="2.4"/>`,
  ),
};
