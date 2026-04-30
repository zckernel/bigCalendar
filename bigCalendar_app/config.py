# ── Realtime transport ────────────────────────────────────────────────────────
# 'redis' — WebSocket + Redis (scales to multiple workers)
# 'sse'   — Server-Sent Events, no Redis needed (single-process only)
REALTIME_TRANSPORT = 'redis'

# ── Static assets ─────────────────────────────────────────────────────────────
JS_VERSION = '1.0.13'
