// LRC 歌词解析 —— 强类型

import type { LyricLine } from './types';

/** 解析 LRC 文本为带时间戳的行 */
export function parseLrc(text: string): LyricLine[] {
  const raw = String(text || '');
  const metaRe = /^\[(?:ar|ti|al|by|length|offset|re|ve|author|tool)\s*:/i;
  const wordTagRe = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
  const hourTagRe = /\[(\d{1,2}):(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const minTagRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  let offsetMs = 0;
  raw.split(/\r?\n/).forEach(line => {
    const om = line.match(/\[offset:\s*([+-]?\d+(?:\.\d+)?)\s*\]/i);
    if (om) offsetMs = Number(om[1]) || 0;
  });
  const lines: LyricLine[] = [];
  raw.split(/\r?\n/).forEach(line => {
    if (!line || metaRe.test(line.trim())) return;
    const times: number[] = [];
    let m: RegExpExecArray | null;
    hourTagRe.lastIndex = 0;
    while ((m = hourTagRe.exec(line)) !== null) {
      times.push(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number('0.' + m[4]) : 0));
    }
    minTagRe.lastIndex = 0;
    while ((m = minTagRe.exec(line)) !== null) {
      times.push(Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number('0.' + m[3]) : 0));
    }
    if (!times.length) return;
    const content = line
      .replace(hourTagRe, '')
      .replace(minTagRe, '')
      .replace(wordTagRe, '')
      .replace(/\{\s*\\?k[^}]*\}/gi, '')
      .trim();
    if (!content) return;
    times.forEach(t => lines.push({ time: Math.max(0, t - offsetMs / 1000), text: content }));
  });
  lines.sort((a, b) => a.time - b.time || a.text.localeCompare(b.text));
  return lines.filter((l, i, arr) => i === 0 || !(Math.abs(l.time - arr[i - 1].time) < 0.001 && l.text === arr[i - 1].text));
}

/** 根据当前播放秒数找到歌词行索引 */
export function lyricIndexAt(lines: LyricLine[], seconds: number): number {
  if (!lines.length) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= seconds + 0.12) idx = i;
    else break;
  }
  return idx;
}

/** 从网络加载歌词文本 */
export async function fetchLrc(url: string, timeoutMs: number = 8000): Promise<LyricLine[]> {
  if (!url) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    return parseLrc(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
