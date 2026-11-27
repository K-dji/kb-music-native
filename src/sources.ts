// 音源定义与搜索聚合 —— 从网页版移植的强类型实现

import type { Access, AppConfig, SourceDef, Track, TrackSource } from './types';

export const METING_PRIMARY = 'https://api.kfjie.me/music';
export const METING_FALLBACK = 'https://api.qijieya.cn/meting/';

export const SOURCE_DEFS: readonly SourceDef[] = [
  { id: 'netease', name: '网易云音乐', short: '网易', type: 'meting', server: 'netease', defaultBase: METING_PRIMARY, color: '#fb7185', priority: 10, full: true, tag: '在线音源', desc: '国内曲库' },
  { id: 'qq', name: 'QQ 音乐', short: 'QQ', type: 'meting', server: 'tencent', defaultBase: METING_PRIMARY, color: '#60a5fa', priority: 9, full: true, tag: '在线音源', desc: '国内曲库' },
  { id: 'kugou', name: '酷狗音乐', short: '酷狗', type: 'meting', server: 'kugou', defaultBase: METING_PRIMARY, color: '#34d399', priority: 8, full: true, tag: '在线音源', desc: '免费完整版较多' },
  { id: 'kuwo', name: '酷我音乐', short: '酷我', type: 'meting', server: 'kuwo', defaultBase: METING_PRIMARY, color: '#f472b6', priority: 7, full: true, tag: '在线音源', desc: '可选音源' },
  { id: 'migu', name: '咪咕音乐', short: '咪咕', type: 'meting', server: 'migu', defaultBase: METING_FALLBACK, color: '#fbbf24', priority: 6, full: true, tag: '在线音源', desc: '可选音源' },
  { id: 'jamendo', name: 'Jamendo', short: 'Jamendo', type: 'jamendo', color: '#f97316', priority: 5, full: true, tag: 'CC 授权', desc: '开放授权音乐' },
  { id: 'itunes', name: 'Apple Music 预览', short: 'iTunes', type: 'itunes', color: '#c084fc', priority: 4, full: false, tag: '30 秒预览', desc: '官方 30 秒试听' }
];

export const DEFAULT_CONFIG: AppConfig = {
  limit: 20,
  timeout: 9,
  sources: {
    netease: { enabled: true, base: METING_PRIMARY },
    qq: { enabled: true, base: METING_PRIMARY },
    kugou: { enabled: true, base: METING_PRIMARY },
    kuwo: { enabled: false, base: METING_PRIMARY },
    migu: { enabled: false, base: METING_FALLBACK },
    jamendo: { enabled: false, clientId: '' },
    itunes: { enabled: true, country: 'us' }
  }
};

function numOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toYear(value: string): number {
  const m = String(value || '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : 0;
}

/** 纠正无效/危险的自定义 API 地址 */
export function sanitizeBase(id: string, value: string): string {
  let v = String(value || '').trim();
  if (!v) return '';
  if (/^http:\/\//i.test(v)) v = v.replace(/^http:/i, 'https:');
  if (/qijieya\.cn/i.test(v) && /\/music\/?$/i.test(v)) v = v.replace(/\/music\/?$/i, '/meting/');
  const def = SOURCE_DEFS.find(s => s.id === id);
  if (v === 'https://api.kfjie.me' || (def && def.type === 'meting' && !/\/meting|\/music/i.test(v))) {
    v = v.replace(/\/$/, '') + '/music';
  }
  return v;
}

function safeUrl(u: unknown): string {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return s;
}

function safeAudioUrl(u: unknown): string {
  const s = safeUrl(u);
  return /\.(mp3|m4a|aac|ogg|wav|flac)(\?|$)/i.test(s) ? s : s;
}

function isGroupArtist(artist: string): boolean {
  return /\s*(ft\.?|feat\.?|&|与|合奏|vs\.?)\s*/i.test(artist) || artist.includes('、') || artist.includes('/');
}

function normalizeKey(s: string): string {
  return String(s || '').toLowerCase().replace(/[\s_\-·•]/g, '').trim();
}

function extractMetingId(url: string): string {
  const m = String(url || '').match(/(?:id=|\/)(\d{4,})/);
  return m ? m[1] : '';
}

function platformUrl(src: SourceDef, id: string): string {
  if (src.id === 'netease') return /^\d+$/.test(id) ? `https://music.163.com/#/song?id=${id}` : '';
  if (src.id === 'qq') return `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(id)}`;
  if (src.id === 'kugou') return /^[a-f0-9]{32}$/i.test(id) ? `https://www.kugou.com/song/#hash=${id}` : '';
  if (src.id === 'kuwo') return /^\d+$/.test(id) ? `https://www.kuwo.cn/play_detail/${id}` : '';
  return '';
}

function detectPaid(raw: Record<string, unknown>): boolean {
  const privilege = (raw.privilege || {}) as Record<string, unknown>;
  const fee = Number(raw.fee != null ? raw.fee : (privilege.fee != null ? privilege.fee : (raw.vipfee != null ? raw.vipfee : 0)));
  const vip = Boolean(raw.vip || raw.isVip || raw.pay || raw.payInfo || (privilege.vip || Number(privilege.fee) > 0));
  return fee > 0 || vip;
}

function qualityOf(raw: Record<string, unknown>, src: SourceDef): string {
  const q = String(raw.quality || raw.br || raw.bitrate || '');
  if (/lossless|sq|flac|hi-?res|lrctitle/i.test(q)) return '无损';
  if (/exhigh|hq|320/i.test(q)) return '高';
  if (/standard|128/i.test(q)) return '中';
  if (src.type === 'itunes' || src.type === 'deezer') return '试听';
  return '标准';
}

export function sourceDuration(s: TrackSource): number {
  return numOr(s.actualDuration, numOr(s.declaredDuration, 0));
}

/** 按平台 + 时长做强判定：网易<=46s/QQ<52s 为试听，咪咕与酷狗按接口时长判为免费 */
export function sourceAccess(s: TrackSource): Access {
  if (!s) return 'preview';
  if (s.failed) return 'paid';
  if (s.full === false) return 'preview';
  const d = sourceDuration(s);
  const id = String(s.sourceId || '').toLowerCase();
  if (id.includes('netease') || id === '163' || id === 'wy') return d > 0 && d <= 46 ? 'preview' : 'free';
  if (id.includes('qq')) return d > 0 && d < 52 ? 'preview' : 'free';
  if (id.includes('migu') || id.includes('kugou') || id === 'kg') return 'free';
  if (d > 0 && d < 45) return 'preview';
  if (d >= 45) return 'free';
  if (s.paid) return 'paid';
  return s.full ? 'free' : 'preview';
}

const ACCESS_RANK: Record<Access, number> = { free: 0, preview: 1, paid: 2 };

function platformRank(s: TrackSource): number {
  const id = String(s.sourceId || '').toLowerCase();
  if (id.includes('kugou') || id === 'kg') return 0;
  if (id.includes('migu')) return 1;
  if (id.includes('netease') || id === '163' || id === 'wy') return 2;
  if (id.includes('qq')) return 3;
  return 4;
}

export function sortSources(sources: TrackSource[]): TrackSource[] {
  return sources.slice().sort((a, b) =>
    (ACCESS_RANK[sourceAccess(a)] - ACCESS_RANK[sourceAccess(b)]) ||
    (platformRank(a) - platformRank(b)) ||
    (sourceDuration(b) - sourceDuration(a)) ||
    (b.priority - a.priority)
  );
}

export function accessOf(track: Track): Access {
  const sources = track.sources || [];
  if (sources.some(s => sourceAccess(s) === 'free')) return 'free';
  if (sources.some(s => sourceAccess(s) === 'preview')) return 'preview';
  return sources.length ? 'paid' : 'preview';
}

function makeTrack(meta: { title: string; artist: string; album?: string; cover: string; duration: number; year?: number }, src: SourceDef, source: TrackSource): Track {
  const key = `${normalizeKey(meta.title)}|${normalizeKey(meta.artist)}`;
  return {
    key,
    uid: `${src.id}-${Math.random().toString(36).slice(2, 10)}`,
    title: meta.title,
    artist: meta.artist,
    album: meta.album || '',
    cover: meta.cover,
    duration: meta.duration,
    year: meta.year || 0,
    sources: [source]
  };
}

function normalizeTrack(raw: Record<string, unknown>, src: SourceDef): Track | null {
  try {
    if (src.type === 'meting') {
      const title = String(raw.title || raw.name || raw.songname || '未知歌曲');
      const artist = String(raw.author || raw.artist || raw.artists || '未知歌手');
      const playUrl = safeAudioUrl(raw.url);
      const id = extractMetingId(String(raw.url || raw.pic || ''));
      const declared = numOr(raw.duration || raw.length || raw.time, 0);
      const coverUrl = safeUrl(raw.pic || raw.picUrl || raw.cover);
      return makeTrack({ title, artist, album: String(raw.album || ''), cover: coverUrl, duration: declared }, src, {
        sourceId: src.id, platform: src.name, short: src.short, color: src.color,
        priority: src.priority, full: true, tag: src.tag, paid: detectPaid(raw), quality: qualityOf(raw, src),
        playUrl, declaredDuration: declared, verified: false, coverUrl,
        lrcUrl: safeUrl(raw.lrc || raw.lyric), externalUrl: platformUrl(src, id)
      });
    }
    if (src.type === 'itunes') {
      const playUrl = safeAudioUrl(raw.previewUrl);
      const cover = String(raw.artworkUrl100 || '').replace('100x100bb', '600x600bb');
      return makeTrack({
        title: String(raw.trackName || '未知歌曲'), artist: String(raw.artistName || '未知歌手'),
        album: String(raw.collectionName || ''), cover, duration: Math.round(Number(raw.trackTimeMillis || 0) / 1000),
        year: toYear(String(raw.releaseDate || ''))
      }, src, {
        sourceId: src.id, platform: src.name, short: src.short, color: src.color,
        priority: src.priority, full: false, tag: src.tag, paid: false, quality: qualityOf(raw, src),
        playUrl, declaredDuration: 30, verified: false, coverUrl: safeUrl(cover), lrcUrl: '', externalUrl: safeUrl(raw.trackViewUrl)
      });
    }
    if (src.type === 'jamendo') {
      const cover = String(raw.image || raw.album_image || '');
      return makeTrack({
        title: String(raw.name || '未知歌曲'), artist: String(raw.artist_name || '未知歌手'),
        album: String(raw.album_name || ''), cover, duration: numOr(raw.duration, 0)
      }, src, {
        sourceId: src.id, platform: src.name, short: src.short, color: src.color,
        priority: src.priority, full: true, tag: src.tag, paid: false, quality: qualityOf(raw, src),
        playUrl: safeAudioUrl(raw.audio), declaredDuration: numOr(raw.duration, 0), verified: false,
        coverUrl: safeUrl(cover), lrcUrl: '', externalUrl: safeUrl(raw.shareurl)
      });
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function extractArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const k of ['data', 'songs', 'result', 'results']) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
    if (obj.data && typeof obj.data === 'object') {
      const inner = (obj.data as Record<string, unknown>).songs;
      if (Array.isArray(inner)) return inner as Record<string, unknown>[];
    }
  }
  return [];
}

async function searchMeting(src: SourceDef, query: string, cfg: AppConfig): Promise<Record<string, unknown>[]> {
  const conf = cfg.sources[src.id];
  const base = sanitizeBase(src.id, conf?.base || src.defaultBase || METING_PRIMARY);
  const url = `${base.replace(/\/$/, '')}?server=${encodeURIComponent(src.server || 'netease')}&type=search&keyword=${encodeURIComponent(query)}&limit=${cfg.limit}`;
  const data = await fetchJson(url, cfg.timeout * 1000);
  return extractArray(data).slice(0, cfg.limit);
}

async function searchItunes(src: SourceDef, query: string, cfg: AppConfig): Promise<Record<string, unknown>[]> {
  const country = cfg.sources[src.id]?.country || 'us';
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&country=${encodeURIComponent(country)}&limit=${cfg.limit}`;
  const data = await fetchJson(url, cfg.timeout * 1000);
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).results)) {
    return (data as Record<string, unknown>).results as Record<string, unknown>[];
  }
  return [];
}

async function searchJamendo(src: SourceDef, query: string, cfg: AppConfig): Promise<Record<string, unknown>[]> {
  const clientId = (cfg.sources[src.id]?.clientId || '').trim();
  if (!clientId) return [];
  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(clientId)}&format=json&limit=${cfg.limit}&search=${encodeURIComponent(query)}&include=musicinfo&order=searchweight_desc`;
  const data = await fetchJson(url, cfg.timeout * 1000);
  return extractArray(data);
}

async function searchSource(src: SourceDef, query: string, cfg: AppConfig): Promise<Record<string, unknown>[]> {
  if (src.type === 'meting') return searchMeting(src, query, cfg);
  if (src.type === 'itunes') return searchItunes(src, query, cfg);
  if (src.type === 'jamendo') return searchJamendo(src, query, cfg);
  return [];
}

function scoreTrack(track: Track, query: string): number {
  const q = normalizeKey(query);
  const t = normalizeKey(track.title);
  const a = normalizeKey(track.artist);
  let score = 0;
  if (t === q) score += 110;
  else if (t.includes(q)) score += 65;
  else if (q.includes(t) && t.length > 1) score += 42;
  if (a.includes(q)) score += 30 + (isGroupArtist(track.artist) ? -12 : 14);
  if (track.sources.some(s => sourceAccess(s) === 'free')) score += 10;
  const bestDur = track.sources.reduce((m, s) => Math.max(m, sourceDuration(s)), 0);
  if (bestDur >= 180) score += 6;
  else if (bestDur >= 90) score += 3;
  score += Math.min(track.sources.length, 5) * 4;
  return score;
}

export function dedupeAndSort(tracks: Track[], query: string): Track[] {
  const map = new Map<string, Track>();
  const MAX_SOURCES = 8;
  for (const track of tracks) {
    if (!track.title || track.title === '未知歌曲') continue;
    const existing = map.get(track.key);
    if (!existing) {
      track.sources = sortSources(track.sources).slice(0, MAX_SOURCES);
      map.set(track.key, track);
      continue;
    }
    for (const s of track.sources) {
      if (existing.sources.length >= MAX_SOURCES) break;
      if (s.playUrl && !existing.sources.some(o => o.playUrl === s.playUrl)) existing.sources.push(s);
    }
    existing.duration = existing.duration || track.duration;
    existing.year = existing.year || track.year || 0;
    existing.sources = sortSources(existing.sources).slice(0, MAX_SOURCES);
  }
  return Array.from(map.values()).sort((a, b) =>
    scoreTrack(b, query) - scoreTrack(a, query) || b.sources.length - a.sources.length
  );
}

/** 并行搜索所有启用的音源并聚合 */
export async function searchAll(query: string, cfg: AppConfig, onProgress?: (done: number, total: number) => void): Promise<Track[]> {
  const enabled = SOURCE_DEFS.filter(s => cfg.sources[s.id]?.enabled);
  let done = 0;
  const settled = await Promise.allSettled(enabled.map(async src => {
    try {
      const rows = await searchSource(src, query, cfg);
      return rows.map(r => normalizeTrack(r, src)).filter((t): t is Track => t !== null);
    } catch {
      return [] as Track[];
    } finally {
      done += 1;
      onProgress?.(done, enabled.length);
    }
  }));
  const flat: Track[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') flat.push(...r.value);
  }
  return dedupeAndSort(flat, query);
}

/** 找到下一个可播放的免费音源（失败源跳过，30 秒试听靠后） */
export function findNextPlayableSource(track: Track, fromIndex: number): number {
  const sources = track.sources;
  for (let i = fromIndex; i < sources.length; i++) {
    if (sources[i]?.failed) continue;
    if (sourceAccess(sources[i]) === 'free' && sources[i].playUrl) return i;
  }
  for (let i = fromIndex; i < sources.length; i++) {
    if (!sources[i]?.failed && sources[i].playUrl) return i;
  }
  return -1;
}
