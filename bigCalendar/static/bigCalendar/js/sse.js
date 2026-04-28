export function connect(onMessage) {
  const source = new EventSource('/api/stream/');

  source.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  };

  // EventSource переподключается автоматически, но при явной ошибке — пересоздаём
  source.onerror = () => {
    source.close();
    setTimeout(() => connect(onMessage), 3000);
  };
}
