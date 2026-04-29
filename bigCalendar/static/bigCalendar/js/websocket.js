const RECONNECT_DELAY = 3000;
let _onUpdate = null;

export function connect(onUpdate) {
  _onUpdate = onUpdate;
  _connect();
}

function _connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/bigcalendar/ws/events/`);

  ws.onmessage = (e) => {
    if (_onUpdate) _onUpdate(JSON.parse(e.data));
  };

  ws.onclose = () => setTimeout(_connect, RECONNECT_DELAY);
}
