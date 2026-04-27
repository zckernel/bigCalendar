import * as store    from './store.js';
import * as api      from './api.js';
import { connect as wsConnect } from './websocket.js';
import { ScrollManager }        from './scroll.js';
import { render }               from './renderer.js';

const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const wrapper      = document.getElementById('wrapper');
const vscroll      = document.getElementById('vscroll');
const vscrollInner = document.getElementById('vscroll-inner');

let W = 0, H = 0, rafPending = false;

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; render(ctx, W, H, sm, store); });
}

const sm = new ScrollManager(wrapper, vscroll, vscrollInner, scheduleRender);

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = W;
  canvas.height = H;
  sm.resize(W, H);
}

async function init() {
  resize();
  window.addEventListener('resize', resize);

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 180);
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 180);

  const [rooms, events] = await Promise.all([
    api.fetchRooms(),
    api.fetchEvents(start, end),
  ]);

  store.setRooms(rooms);
  store.setEvents(events);
  sm.setNumRooms(rooms.length);
  scheduleRender();

  wsConnect((msg) => {
    if (msg.type === 'events_changed') {
      store.applyUpdates(msg.events);
      scheduleRender();
    }
  });
}

init();
