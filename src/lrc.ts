// LRC 歌词解析 —— 强类型

import type { LyricLine } from './types';

/** 解析 LRC 文本为带时间戳的行 */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const tagRe = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const content = rawLine.replace(tagRe, '').trim();
    if (!content) continue;
    tagRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(rawLine)) !== null) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      lines.push({ time: min * 60 + sec, text: content });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** 根据当前播放秒数找到歌词行索引 */
export function lyricIndexAt(lines: LyricLine[], seconds: number): number {
  if (!lines.length) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= seconds + 0.25) idx = i;
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
