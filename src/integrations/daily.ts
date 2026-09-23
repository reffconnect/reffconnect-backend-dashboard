/**
 * Daily.co adapter for video rooms + meeting tokens. Fails closed (503) when
 * DAILY_API_KEY is absent.
 */
import { config } from '../config/env';
import { AppError } from '../utils/AppError';

const DAILY_API = 'https://api.daily.co/v1';

function requireKey(): string {
  if (!config.DAILY_API_KEY) {
    throw new AppError(503, 'Video calls are not configured on this server', { code: 'video_unconfigured' });
  }
  return config.DAILY_API_KEY;
}

export function isEnabled(): boolean {
  return config.videoEnabled;
}

async function dailyFetch<T>(path: string, body: unknown): Promise<T> {
  const key = requireKey();
  const res = await fetch(`${DAILY_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, `Daily.co request failed (${res.status})`, {
      code: 'gateway_error',
      details: text.slice(0, 500),
    });
  }
  return (await res.json()) as T;
}

/** Create (or reuse) a room and mint a meeting token that expires with the session. */
export async function createRoomAndToken(params: {
  roomName: string;
  expUnix: number;
  isOwner: boolean;
}): Promise<{ roomUrl: string; roomName: string; token: string }> {
  const room = await dailyFetch<{ name: string; url: string }>('/rooms', {
    name: params.roomName,
    privacy: 'private',
    properties: { exp: params.expUnix, enable_prejoin_ui: true },
  }).catch(async (err: unknown) => {
    // If the room already exists, fetch it instead of failing.
    const key = requireKey();
    const res = await fetch(`${DAILY_API}/rooms/${encodeURIComponent(params.roomName)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return (await res.json()) as { name: string; url: string };
    throw err;
  });

  const token = await dailyFetch<{ token: string }>('/meeting-tokens', {
    properties: { room_name: room.name, exp: params.expUnix, is_owner: params.isOwner },
  });

  return { roomUrl: room.url, roomName: room.name, token: token.token };
}
