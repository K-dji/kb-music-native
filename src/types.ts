// KB Music 核心类型定义 —— 全部显式类型，杜绝 any

export type Access = 'free' | 'preview' | 'paid';
export type SourceType = 'meting' | 'itunes' | 'deezer' | 'jamendo';

export interface SourceDef {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly type: SourceType;
  readonly server?: string;
  readonly defaultBase?: string;
  readonly color: string;
  readonly priority: number;
  readonly full: boolean;
  readonly tag: string;
  readonly desc: string;
}

export interface SourceConfig {
  enabled: boolean;
  base?: string;
  clientId?: string;
  country?: string;
}

export interface AppConfig {
  limit: number;
  timeout: number;
  sources: Record<string, SourceConfig>;
}

/** 单个可播放音源 */
export interface TrackSource {
  sourceId: string;
  platform: string;
  short: string;
  color: string;
  priority: number;
  full: boolean;
  tag: string;
  paid: boolean;
  quality: string;
  playUrl: string;
  declaredDuration: number;
  actualDuration?: number;
  verified: boolean;
  coverUrl: string;
  lrcUrl: string;
  externalUrl: string;
  failed?: boolean;
}

/** 聚合后的一首歌 */
export interface Track {
  key: string;
  uid: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  year?: number;
  sources: TrackSource[];
}

/** 本地用户资料 */
export interface Profile {
  nickname: string;
  musicCode: string;
  uiLang: 'zh' | 'en';
  musicLangs: string[];
  gender: 'secret' | 'male' | 'female';
}

export interface Friend {
  code: string;
  nickname: string;
  addedAt: number;
}

export interface LyricLine {
  time: number;
  text: string;
}

export const ACCESS_META: Record<Access, { label: string; labelEn: string; color: string }> = {
  free: { label: '免费', labelEn: 'Free', color: '#22c55e' },
  preview: { label: '试听', labelEn: 'Preview', color: '#f59e0b' },
  paid: { label: '付费', labelEn: 'Paid', color: '#ef4444' }
};
