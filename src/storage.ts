// 本地存储封装 —— 纯本地，无账号无数据库

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppConfig, Friend, Profile, Track } from './types';
import type { Playlist } from './library';
import { DEFAULT_CONFIG } from './sources';

const KEYS = {
  profile: 'kb-music-profile-v1',
  friends: 'kb-music-friends-v1',
  favorites: 'kb-music-favorites-v1',
  favoriteTracks: 'kb-music-favorite-tracks-v1',
  collected: 'kb-music-collected-v1',
  recent: 'kb-music-recent-v1',
  playlists: 'kb-music-playlists-v1',
  queue: 'kb-music-queue-v1',
  config: 'kb-music-config-v1'
} as const;

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function save<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储失败静默处理
  }
}

export function makeMusicCode(): string {
  return 'kbmusic-' + Math.random().toString(36).slice(2, 8).padEnd(6, '0').slice(0, 6);
}

export const Storage = {
  loadProfile: (): Promise<Profile> => load<Profile>(KEYS.profile, {
    nickname: '音乐爱好者', musicCode: makeMusicCode(), uiLang: 'zh', musicLangs: [], gender: 'secret'
  }),
  saveProfile: (p: Profile): Promise<void> => save(KEYS.profile, p),

  loadFriends: (): Promise<Friend[]> => load<Friend[]>(KEYS.friends, []),
  saveFriends: (f: Friend[]): Promise<void> => save(KEYS.friends, f),

  loadFavorites: (): Promise<string[]> => load<string[]>(KEYS.favorites, []),
  saveFavorites: (f: string[]): Promise<void> => save(KEYS.favorites, f),

  loadFavoriteTracks: (): Promise<Track[]> => load<Track[]>(KEYS.favoriteTracks, []),
  saveFavoriteTracks: (t: Track[]): Promise<void> => save(KEYS.favoriteTracks, t.slice(0, 500)),

  loadCollected: (): Promise<Track[]> => load<Track[]>(KEYS.collected, []),
  saveCollected: (t: Track[]): Promise<void> => save(KEYS.collected, t.slice(0, 500)),

  loadRecent: (): Promise<Track[]> => load<Track[]>(KEYS.recent, []),
  saveRecent: (t: Track[]): Promise<void> => save(KEYS.recent, t.slice(0, 500)),

  loadPlaylists: (): Promise<Playlist[]> => load<Playlist[]>(KEYS.playlists, []),
  savePlaylists: (p: Playlist[]): Promise<void> => save(KEYS.playlists, p.slice(0, 200)),

  loadQueue: (): Promise<string[]> => load<string[]>(KEYS.queue, []),
  saveQueue: (q: string[]): Promise<void> => save(KEYS.queue, q),

  loadConfig: (): Promise<AppConfig> => load<AppConfig>(KEYS.config, DEFAULT_CONFIG),
  saveConfig: (c: AppConfig): Promise<void> => save(KEYS.config, c)
};
