// KB Music 音乐库分享快照：URL-safe Base64，无依赖，兼容网页版 /p/<code>/ 格式
import type { Track } from './types';

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

export interface SharedSnapshot {
  n: string;
  t: Track[];
  v: number;
}

export type ParsedInput =
  | { kind: 'playlist'; name: string; tracks: Track[] }
  | { kind: 'song'; term: string }
  | { kind: 'external'; url: string }
  | null;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) LOOKUP[ALPHABET[i]] = i;

function utf8Encode(value: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    let cp = value.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < value.length) {
      const low = value.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b < 0x80) { out += String.fromCharCode(b); continue; }
    if (b >= 0xc0 && b < 0xe0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 1; continue;
    }
    if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 2; continue;
    }
    if (b >= 0xf0 && i + 3 < bytes.length) {
      const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const v = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
      i += 3;
    }
  }
  return out;
}

export function encodeSnapshot(value: unknown): string {
  const bytes = utf8Encode(JSON.stringify(value));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) out += ALPHABET[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) out += ALPHABET[c & 63];
  }
  return out;
}

export function decodeSnapshot<T>(code: string): T | null {
  try {
    const clean = code.replace(/[^A-Za-z0-9_-]/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 4) {
      const a = LOOKUP[clean[i]];
      const b = i + 1 < clean.length ? LOOKUP[clean[i + 1]] : 0;
      const c = i + 2 < clean.length ? LOOKUP[clean[i + 2]] : 0;
      const d = i + 3 < clean.length ? LOOKUP[clean[i + 3]] : 0;
      if (a === undefined || b === undefined) return null;
      bytes.push((a << 2) | (b >> 4));
      if (i + 2 < clean.length) bytes.push(((b & 15) << 4) | (c >> 2));
      if (i + 3 < clean.length) bytes.push(((c & 3) << 6) | (d & 63));
    }
    return JSON.parse(utf8Decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function slimTrack(track: Track): Track {
  return {
    key: track.key,
    uid: track.uid || track.key,
    title: track.title,
    artist: track.artist,
    album: track.album || '',
    cover: track.cover || '',
    duration: Number(track.duration) || 0,
    sources: (track.sources || []).slice(0, 3).map(s => ({ ...s, failed: false }))
  };
}

export function sharePlaylistUrl(name: string, tracks: Track[]): string {
  const snapshot: SharedSnapshot = { n: name, t: tracks.map(slimTrack), v: 1 };
  return 'https://kaobei-music.pages.dev/p/' + encodeSnapshot(snapshot) + '/';
}

export function parseInput(text: string): ParsedInput {
  const s = String(text || '').trim();
  if (!s) return null;
  const pm = s.match(/\/p\/([A-Za-z0-9_-]+)\/?/);
  if (pm) {
    const obj = decodeSnapshot<SharedSnapshot>(pm[1]);
    if (obj && typeof obj.n === 'string' && Array.isArray(obj.t)) {
      return { kind: 'playlist', name: obj.n, tracks: obj.t };
    }
    return null;
  }
  const sm = s.match(/\/s\/([A-Za-z0-9_-]+)\/?/);
  if (sm) {
    const obj = decodeSnapshot<{ t?: string }>(sm[1]);
    if (obj && typeof obj.t === 'string' && obj.t) return { kind: 'song', term: obj.t };
  }
  if (/^https?:\/\//i.test(s)) return { kind: 'external', url: s };
  return null;
}
