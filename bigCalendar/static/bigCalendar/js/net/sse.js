export function connect(onMessage) {
  const source = new EventSource('/api/stream/');

  source.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed JSON */ }
  };

  // EventSource reconnects automatically, but on explicit error — recreate it
  source.onerror = () => {
    source.close();
    setTimeout(() => connect(onMessage), 3000);
  };
}
