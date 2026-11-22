// 原生音频播放服务封装 —— react-native-track-player（真原生播放，支持后台）

import TrackPlayer, { Capability, State, type Track as RNTrack } from 'react-native-track-player';
import type { Track, TrackSource } from './types';
import { sourceAccess } from './sources';

let initialized = false;

export async function setupPlayer(): Promise<void> {
  if (initialized) return;
  await TrackPlayer.setupPlayer();
  await TrackPlayer.updateOptions({
    capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext]
  });
  initialized = true;
}

function toRNTrack(track: Track, source: TrackSource): RNTrack {
  return {
    id: `${track.key}-${source.sourceId}`,
    url: source.playUrl,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: source.coverUrl || track.cover || undefined
  };
}

/**
 * 从头播放某首歌：从第 0 个可用免费完整源开始，失败源自动顺延到下一个。
 * 返回是否成功加入播放队列。
 */
export async function playTrack(track: Track): Promise<boolean> {
  const sources = track.sources;
  if (!sources.length) return false;
  await setupPlayer();
  let start = 0;
  if (sourceAccess(sources[0]) !== 'free') {
    const freeIdx = sources.findIndex(s => !s.failed && sourceAccess(s) === 'free' && s.playUrl);
    if (freeIdx >= 0) start = freeIdx;
  }
  const playable = sources.filter((s, i) => i >= start && !s.failed && s.playUrl);
  if (!playable.length) return false;
  await TrackPlayer.reset();
  const rnTracks: RNTrack[] = [];
  const sourceIndexMap: number[] = [];
  sources.forEach((s, i) => {
    if (i >= start && !s.failed && s.playUrl) {
      rnTracks.push(toRNTrack(track, s));
      sourceIndexMap.push(i);
    }
  });
  await TrackPlayer.add(rnTracks);
  void sourceIndexMap;
  await TrackPlayer.play();
  return true;
}

export async function togglePlayPause(): Promise<void> {
  const state = await TrackPlayer.getState();
  if (state === State.Playing) await TrackPlayer.pause();
  else await TrackPlayer.play();
}

export async function seekTo(seconds: number): Promise<void> {
  await TrackPlayer.seekTo(seconds);
}

export async function setVolume(v: number): Promise<void> {
  await TrackPlayer.setVolume(Math.max(0, Math.min(1, v)));
}

export function registerPlaybackService(): void {
  // 播放中断处理由 track-player 原生层完成；此处预留 service 注册入口
}
