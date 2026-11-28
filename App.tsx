import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
  Dimensions,
  Easing,
  Linking,
  FlatList,
  Image,
  Modal,
  PanResponder,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import TrackPlayer, { State, usePlaybackState, useProgress } from 'react-native-track-player';
import Voice, { type SpeechResultsEvent, type SpeechErrorEvent } from '@react-native-voice/voice';
import type { Access, AppConfig, Profile, Track, TrackSource } from './src/types';
import { ACCESS_META, type LyricLine } from './src/types';
import { DEFAULT_CONFIG, SOURCE_DEFS, accessOf, searchAll, sourceAccess, sourceDuration } from './src/sources';
import { Storage } from './src/storage';
import { fetchLrc, lyricIndexAt, parseLrc } from './src/lrc';
import { playTrack as enginePlay, seekTo, setupPlayer, togglePlayPause } from './src/player';
import { parseInput, sharePlaylistUrl, slimTrack, type Playlist, type SharedSnapshot } from './src/library';

type Tab = 'discover' | 'search' | 'library';

const SHELF = [
  { name: '华语流行金曲', sub: '周杰伦 · 邓紫棋 · 陈奕迅', q: '华语流行', c1: '#7c5cff', c2: '#3b1d7a', icon: '♫' },
  { name: '深夜纯音乐', sub: '安静 · 专注 · 助眠', q: 'lo-fi 纯音乐', c1: '#0ea5e9', c2: '#0c4a6e', icon: '☾' },
  { name: '经典英文热歌', sub: 'Taylor Swift · Eminem', q: 'Taylor Swift', c1: '#f43f5e', c2: '#7f1d1d', icon: '♪' },
  { name: '中国风古韵', sub: '古风 · 戏腔 · 国风', q: '中国风 古风', c1: '#f59e0b', c2: '#78350f', icon: '❀' },
  { name: '摇滚现场', sub: 'Live · 乐队 · 热血', q: '摇滚 现场', c1: '#ef4444', c2: '#450a0a', icon: '⚡' },
  { name: '治愈系轻音乐', sub: '钢琴 · 吉他 · 自然', q: '治愈 轻音乐', c1: '#10b981', c2: '#064e3b', icon: '✿' }
];

const GUESS = ['周杰伦', '晴天', '邓紫棋', 'Taylor Swift', 'lo-fi 纯音乐', '轻音乐'];
const LYRIC_STAGES = ['fashion', 'hand', 'caption', 'dialogue'] as const;
const LYRIC_STAGE_LABELS: Record<string, string> = { fashion: '时尚', hand: '手书', caption: '字幕', dialogue: '对话' };

/* 26 套配色，来自 KB Chat 背景样式参考库；渐变取主色作为原生端底色 */
const NATIVE_THEMES = [
  { id:'clean', n:'纯净白', bg:'#ffffff', fg:'#1c1c1e' }, { id:'cream', n:'暖奶油', bg:'#fdf8f0', fg:'#3a3228' },
  { id:'paper', n:'纸张色', bg:'#f5f2eb', fg:'#33302a' }, { id:'mint', n:'薄荷清新', bg:'#eaf6f1', fg:'#24463c' },
  { id:'sky', n:'天空蓝', bg:'#eaf3fb', fg:'#20384d' }, { id:'lavender', n:'柔和薰衣草', bg:'#f3eff8', fg:'#3d3350' },
  { id:'rosepink', n:'玫瑰粉', bg:'#fceef1', fg:'#4d2f38' }, { id:'wechat', n:'经典深灰', bg:'#1e1e1e', fg:'#e6e6e6' },
  { id:'navy', n:'深海军蓝', bg:'#191f28', fg:'#d6dae0' }, { id:'midnight', n:'午夜蓝', bg:'#1a1e2e', fg:'#d5d9e6' },
  { id:'amoled', n:'纯黑 AMOLED', bg:'#000000', fg:'#e0e0e0' }, { id:'rosetnight', n:'墨夜玫瑰', bg:'#2a1f24', fg:'#eadde0' },
  { id:'forest', n:'森林绿', bg:'#1b2620', fg:'#d4ded6' }, { id:'mistnight', n:'雾蓝深夜', bg:'#152232', fg:'#cdd8e6' },
  { id:'dots', n:'圆点网格', bg:'#f7f8fa', fg:'#2c2f36' }, { id:'dotsdark', n:'暗夜星点', bg:'#191f28', fg:'#d6dae0' },
  { id:'stripes', n:'斜纹布', bg:'#f2f6ef', fg:'#2e3a30' }, { id:'grid', n:'方格纸', bg:'#f7f9fc', fg:'#2b3442' },
  { id:'sunrise', n:'晨曦暖橙', bg:'#fff4e8', fg:'#4a3329' }, { id:'aurora', n:'极光薄荷', bg:'#e8f7ef', fg:'#26453f' },
  { id:'fogblue', n:'雾蓝海', bg:'#dbe9f5', fg:'#243b52' }, { id:'sagesky', n:'雨后青提', bg:'#eaf3e6', fg:'#2c443c' },
  { id:'nightglow', n:'深夜暖光', bg:'#241c22', fg:'#e6d9d5' }, { id:'glasslight', n:'磨砂浅色', bg:'#f3eaff', fg:'#332f42' },
  { id:'glassdark', n:'磨砂深色', bg:'#2a2340', fg:'#e2dcea' }, { id:'grain', n:'柔光颗粒', bg:'#f6f3ef', fg:'#3a3532' }
];
const NATIVE_VERSION = 19;
const APK_URL = 'https://kaobei-music.pages.dev/api/apk';

const COLORS = {
  bg: '#0b0d12',
  panel: '#141821',
  panel2: '#1b2130',
  border: '#252c3a',
  text: '#e8ecf4',
  sub: '#8b95a9',
  accent: '#00bfa5',
  accent2: '#7c5cff'
};

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function AccessBadge({ access }: { access: Access }): React.JSX.Element {
  const meta = ACCESS_META[access];
  return (
    <View style={[styles.badge, { borderColor: meta.color }]}>
      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function App(): React.JSX.Element {
  const { width, height: screenH } = useWindowDimensions();
  const coverSize = Math.max(140, Math.min(240, Math.round(width * 0.6), Math.round(screenH * 0.3)));
  const [tab, setTab] = useState<Tab>('discover');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [accessFilter, setAccessFilter] = useState<'all' | Access>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'default' | 'time' | 'title'>('default');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG);
  const [themeId, setThemeId] = useState('default');
  const activeTheme = NATIVE_THEMES.find(t => t.id === themeId) || NATIVE_THEMES[0];
  const themeBg = themeId === 'default' ? COLORS.bg : activeTheme.bg;
  const hex = themeBg.replace('#', '');
  const bgLuma = hex.length >= 6
    ? 0.299 * parseInt(hex.slice(0, 2), 16) + 0.587 * parseInt(hex.slice(2, 4), 16) + 0.114 * parseInt(hex.slice(4, 6), 16)
    : 0;
  const playerLight = bgLuma > 140;
  const pf = playerLight ? '#1c1c1e' : '#eef2f8';
  const ps = playerLight ? '#596472' : '#aab5c7';
  const ctrlBg = playerLight ? 'rgba(20,24,33,.08)' : 'rgba(255,255,255,.1)';
  const pfStyle = { color: pf };
  const psStyle = { color: ps };
  const [profile, setProfile] = useState<Profile | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteTracks, setFavoriteTracks] = useState<Track[]>([]);
  const [collected, setCollected] = useState<Track[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [playlistExpanded, setPlaylistExpanded] = useState(false);
  const [librarySection, setLibrarySection] = useState<'liked' | 'collected' | 'recent' | 'playlists'>('liked');
  const [shared, setShared] = useState<SharedSnapshot | null>(null);
  const [promptState, setPromptState] = useState<{ title: string; value: string; onConfirm: (value: string) => void } | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [shareText, setShareText] = useState<string | null>(null);
  const [queueKeys, setQueueKeys] = useState<string[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [lyricFocus, setLyricFocus] = useState(false);
  const [lyricStage, setLyricStage] = useState<(typeof LYRIC_STAGES)[number]>('fashion');
  // 一镜到底 morph：0=迷你条 1=全屏；下滑跟手用 dragY，收起回弹由 spring 完成
  const morph = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const morphClosing = useRef(false);
  const [voiceAwake, setVoiceAwake] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceInputOpen, setVoiceInputOpen] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState('');
  const voiceAwakeRef = useRef(false);
  const volumeBeforeWake = useRef(0.8);
  const ballPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const ballPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, g) => {
      const w = Dimensions.get('window').width;
      const h = Dimensions.get('window').height;
      const baseX = w - 10 - 58;
      const baseY = h - 84 - 58;
      const nx = Math.max(8 - baseX, Math.min(w - 66 - baseX, g.dx));
      const ny = Math.max(70 - baseY, Math.min(h - 150 - baseY, g.dy));
      ballPos.x.setValue(nx);
      ballPos.y.setValue(ny);
    },
    onPanResponderRelease: () => undefined
  })).current;
  const [updateInfo, setUpdateInfo] = useState<{ remote: number; url: string } | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [nickInput, setNickInput] = useState('');
  const searchSeq = useRef(0);
  const spin = useRef(new Animated.Value(0)).current;
  const mineAnim = useRef(new Animated.Value(0)).current;
  const lyricAnim = useRef(new Animated.Value(0)).current;
  const [vinylMode, setVinylMode] = useState(true);
  const playState = usePlaybackState();
  const { position, duration } = useProgress(500);
  const isPlaying = playState.state === State.Playing;
  useEffect(() => {
    if (isPlaying && vinylMode) {
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 18000, useNativeDriver: true })).start();
    } else {
      spin.stopAnimation();
    }
  }, [isPlaying, vinylMode, spin]);
  const spinAngle = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  useEffect(() => {
    Animated.timing(lyricAnim, {
      toValue: lyricFocus ? 1 : 0,
      duration: 480,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      useNativeDriver: false
    }).start();
  }, [lyricFocus, lyricAnim]);

  const playerOpenRef = useRef(false);
  const openPlayer = useCallback(() => {
    if (playerOpenRef.current) return;
    playerOpenRef.current = true;
    setLyricFocus(false);
    setPlayerOpen(true);
    morph.setValue(0);
    dragY.setValue(0);
    requestAnimationFrame(() => {
      Animated.timing(morph, {
        toValue: 1, duration: 540,
        easing: Easing.bezier(0.2, 0.9, 0.25, 1),
        useNativeDriver: true
      }).start();
    });
  }, [morph, dragY]);

  const closePlayer = useCallback(() => {
    if (!playerOpenRef.current || morphClosing.current) return;
    morphClosing.current = true;
    Animated.parallel([
      Animated.timing(morph, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(dragY, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true })
    ]).start(() => {
      morphClosing.current = false;
      playerOpenRef.current = false;
      setPlayerOpen(false);
    });
  }, [morph, dragY]);

  const paging = useRef({ active: false, startY: 0, lastY: 0, startT: 0 }).current;
  const onSheetTouchStart = useCallback((y: number) => {
    if (morphClosing.current || y > screenH * 0.55) { paging.active = false; return; }
    paging.active = true; paging.startY = y; paging.lastY = y; paging.startT = Date.now();
  }, [paging, screenH]);
  const onSheetTouchMove = useCallback((y: number) => {
    if (!paging.active) return;
    paging.lastY = y;
    dragY.setValue(Math.min(Math.max(0, y - paging.startY) * 0.9, screenH * 0.6));
  }, [paging, dragY, screenH]);
  const onSheetTouchEnd = useCallback(() => {
    if (!paging.active) return;
    paging.active = false;
    const dy = Math.max(0, paging.lastY - paging.startY);
    const velocity = dy / Math.max(1, Date.now() - paging.startT);
    if (dy > 120 || velocity > 0.5) closePlayer();
    else Animated.spring(dragY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 260 }).start();
  }, [paging, dragY, closePlayer]);

  const sheetTranslateY = Animated.add(
    morph.interpolate({ inputRange: [0, 1], outputRange: [screenH * 0.06, 0], extrapolate: 'clamp' }),
    dragY
  );
  const sheetOpacity = morph.interpolate({ inputRange: [0, 0.35], outputRange: [0.15, 1], extrapolate: 'clamp' });
  const seekWidth = useRef(0);
  const coverMorphScale = morph.interpolate({ inputRange: [0, 1], outputRange: [0.22, 1], extrapolate: 'clamp' });
  const coverLyricScale = lyricAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9], extrapolate: 'clamp' });
  const coverScale = Animated.multiply(coverMorphScale, coverLyricScale);
  const coverMorphY = morph.interpolate({ inputRange: [0, 1], outputRange: [screenH * 0.2, 0], extrapolate: 'clamp' });
  const coverLyricY = lyricAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -screenH * 0.26], extrapolate: 'clamp' });
  const coverY = Animated.add(coverMorphY, coverLyricY);
  const lyricPad = Math.max(96, Math.round(screenH * 0.38));

  useEffect(() => {
    let alive = true;
    (async () => {
      await setupPlayer().catch(() => undefined);
      const [c, p, fav, favTracks, col, rec, pls, q] = await Promise.all([
        Storage.loadConfig(), Storage.loadProfile(),
        Storage.loadFavorites(), Storage.loadFavoriteTracks(),
        Storage.loadCollected(), Storage.loadRecent(), Storage.loadPlaylists(), Storage.loadQueue()
      ]);
      if (!alive) return;
      setCfg(c); setProfile(p); setFavorites(fav); setFavoriteTracks(favTracks);
      setCollected(col); setRecent(rec); setPlaylists(pls); setQueueKeys(q);
      setNickInput(p.nickname);
      const savedTheme = await AsyncStorage.getItem('kb-color-theme').catch(() => null);
      if (savedTheme === 'default') setThemeId('default');
      else if (savedTheme && NATIVE_THEMES.some(t => t.id === savedTheme)) setThemeId(savedTheme);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    fetch('https://k-dji.github.io/music/version.json?t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } })
      .then(r => r.json())
      .then((meta: { version?: number; apk?: string }) => {
        const remote = Number(meta.version || 0);
        if (remote > NATIVE_VERSION) {
          setUpdateInfo({ remote, url: meta.apk || APK_URL });
          Alert.alert('发现新版本', '当前原生版 v' + NATIVE_VERSION + '，最新 v' + remote + '。点击更新后将在后台下载。', [
            { text: '稍后', style: 'cancel' },
            { text: '立即更新', onPress: () => startUpdate(meta.apk || APK_URL) }
          ]);
        }
      })
      .catch(() => undefined);
  }, []);

  const startUpdate = useCallback((url: string) => {
    setUpdateProgress(0);
    let pct = 0;
    const timer = setInterval(() => {
      pct = Math.min(100, pct + Math.ceil(Math.random() * 9));
      setUpdateProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        void Linking.openURL(url).catch(() => undefined);
        setTimeout(() => setUpdateProgress(null), 600);
      }
    }, 180);
  }, []);

  const visibleResults = (() => {
    let list = results.filter(t => {
      if (freeOnly && accessOf(t) !== 'free') return false;
      if (accessFilter !== 'all' && accessOf(t) !== accessFilter) return false;
      if (sourceFilter !== 'all' && !(t.sources || []).some(s => s.sourceId === sourceFilter)) return false;
      return true;
    });
    if (sortBy === 'time') list = list.slice().sort((a, b) => a.duration - b.duration);
    if (sortBy === 'title') list = list.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
    return list;
  })();
  const freeCount = results.filter(t => accessOf(t) === 'free').length;

  const doSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) return;
    const seq = ++searchSeq.current;
    setSearching(true);
    setProgress({ done: 0, total: 0 });
    setTab('search');
    try {
      const tracks = await searchAll(term, cfg, (done, total) => {
        if (seq === searchSeq.current) setProgress({ done, total });
      });
      if (seq === searchSeq.current) setResults(tracks);
    } finally {
      if (seq === searchSeq.current) { setSearching(false); setProgress(null); }
    }
  }, [cfg]);

  const pushRecent = useCallback((track: Track) => {
    const slim = slimTrack(track);
    setRecent(prev => {
      const next = [slim, ...prev.filter(t => t.key !== slim.key)].slice(0, 500);
      void Storage.saveRecent(next);
      return next;
    });
  }, []);

  const startPlay = useCallback(async (track: Track) => {
    const ok = await enginePlay(track).catch(() => false);
    if (ok) {
      setCurrentTrack(track);
      pushRecent(track);
      openPlayer();
      const src = track.sources.find(s => !s.failed && sourceAccess(s) === 'free') || track.sources[0];
      if (src?.lrcUrl) {
        const lines = await fetchLrc(src.lrcUrl);
        setLyrics(lines.length ? lines : parseLrc(''));
      } else {
        setLyrics([]);
      }
    } else {
      Alert.alert('播放失败', '该歌曲的所有音源均不可用，请换一首或检查网络。');
    }
  }, [pushRecent, openPlayer]);

  const playRelative = useCallback((delta: number) => {
    const list = visibleResults.length ? visibleResults : results;
    if (!list.length) return;
    const idx = list.findIndex(t => t.key === currentTrack?.key);
    const next = list[(idx + delta + list.length) % list.length];
    if (next) void startPlay(next);
  }, [visibleResults, results, currentTrack, startPlay]);

  const toggleFav = useCallback((track: Track) => {
    setFavorites(prev => {
      const next = prev.includes(track.key) ? prev.filter(k => k !== track.key) : [...prev, track.key];
      void Storage.saveFavorites(next);
      return next;
    });
    setFavoriteTracks(prev => {
      const has = prev.some(t => t.key === track.key);
      const next = has ? prev.filter(t => t.key !== track.key) : [slimTrack(track), ...prev];
      void Storage.saveFavoriteTracks(next);
      return next;
    });
  }, []);

  const toggleCollect = useCallback((track: Track) => {
    setCollected(prev => {
      const has = prev.some(t => t.key === track.key);
      const next = has ? prev.filter(t => t.key !== track.key) : [slimTrack(track), ...prev];
      void Storage.saveCollected(next);
      return next;
    });
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueueKeys(prev => {
      if (prev.includes(track.key)) return prev;
      const next = [...prev, track.key];
      void Storage.saveQueue(next);
      return next;
    });
    Alert.alert('已加入队列', `《${track.title}》已保存到本机播放队列。`);
  }, []);

  const saveNick = useCallback(() => {
    if (!profile) return;
    const next = { ...profile, nickname: nickInput.trim() || '音乐爱好者' };
    setProfile(next); void Storage.saveProfile(next);
    Alert.alert('已保存', '昵称已更新。');
  }, [profile, nickInput]);

  const openPrompt = useCallback((title: string, value: string, onConfirm: (value: string) => void) => {
    setPromptValue(value);
    setPromptState({ title, value, onConfirm });
  }, []);

  const submitSearch = useCallback((text: string) => {
    const parsed = parseInput(text);
    if (parsed && parsed.kind === 'playlist') {
      setShared({ n: parsed.name, t: parsed.tracks, v: 1 });
      setTab('library');
      setLibrarySection('playlists');
      setPlaylistExpanded(false);
      return;
    }
    if (parsed && parsed.kind === 'song') { void doSearch(parsed.term); return; }
    if (parsed && parsed.kind === 'external') {
      void Linking.openURL(parsed.url).catch(() => undefined);
      return;
    }
    void doSearch(text);
  }, [doSearch]);

  const createPlaylist = useCallback(() => {
    openPrompt('给新歌单起个名字', '我的歌单 ' + (playlists.length + 1), name => {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      const next = [...playlists, { id: 'pl-' + Date.now().toString(), name: trimmed, tracks: [], createdAt: Date.now() }];
      setPlaylists(next);
      void Storage.savePlaylists(next);
      setActivePlaylistId(next[next.length - 1].id);
      setPlaylistExpanded(true);
      Alert.alert('已创建', '歌单《' + trimmed + '》已保存在本机。');
    });
  }, [openPrompt, playlists]);

  const renamePlaylist = useCallback((p: Playlist) => {
    openPrompt('修改歌单名称', p.name, name => {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      const next = playlists.map(x => x.id === p.id ? { ...x, name: trimmed } : x);
      setPlaylists(next);
      void Storage.savePlaylists(next);
    });
  }, [openPrompt, playlists]);

  const deletePlaylist = useCallback((p: Playlist) => {
    Alert.alert('删除歌单', '确定删除《' + p.name + '》吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        const next = playlists.filter(x => x.id !== p.id);
        setPlaylists(next);
        void Storage.savePlaylists(next);
        if (activePlaylistId === p.id) setActivePlaylistId(null);
      } }
    ]);
  }, [playlists, activePlaylistId]);

  const addCurrentToPlaylist = useCallback((p: Playlist) => {
    if (!currentTrack) { Alert.alert('请先播放一首歌曲'); return; }
    const slim = slimTrack(currentTrack);
    const next = playlists.map(x => x.id === p.id
      ? { ...x, tracks: [slim, ...x.tracks.filter(t => t.key !== slim.key)] }
      : x);
    setPlaylists(next);
    void Storage.savePlaylists(next);
    Alert.alert('已加入', '《' + currentTrack.title + '》已加入《' + p.name + '》。');
  }, [currentTrack, playlists]);

  const removeFromPlaylist = useCallback((p: Playlist, track: Track) => {
    const next = playlists.map(x => x.id === p.id ? { ...x, tracks: x.tracks.filter(t => t.key !== track.key) } : x);
    setPlaylists(next);
    void Storage.savePlaylists(next);
  }, [playlists]);

  const sharePlaylist = useCallback((p: Playlist) => {
    setShareText(sharePlaylistUrl(p.name, p.tracks));
  }, []);

  const importShared = useCallback(() => {
    if (!shared) return;
    openPrompt('导入到你的歌单库，命名为', shared.n + '（副本）', name => {
      const trimmed = name.trim().slice(0, 40);
      if (!trimmed) return;
      const next = [...playlists, {
        id: 'pl-' + Date.now().toString(), name: trimmed,
        tracks: shared.t.map(slimTrack), createdAt: Date.now()
      }];
      setPlaylists(next);
      void Storage.savePlaylists(next);
      setShared(null);
      setActivePlaylistId(next[next.length - 1].id);
      setPlaylistExpanded(true);
      Alert.alert('已导入', '可以像自己的歌单一样修改。');
    });
  }, [shared, openPrompt, playlists]);

  const importFromLink = useCallback(() => {
    openPrompt('粘贴他人分享的歌单链接', '', text => {
      const parsed = parseInput(text.trim());
      if (parsed && parsed.kind === 'playlist') {
        setShared({ n: parsed.name, t: parsed.tracks, v: 1 });
        Alert.alert('已识别歌单', '《' + parsed.name + '》共 ' + parsed.tracks.length + ' 首。');
      } else if (parsed && parsed.kind === 'song') {
        void doSearch(parsed.term);
      } else {
        Alert.alert('链接无效', '请粘贴 KB Music 的 /p/ 或 /s/ 分享链接。');
      }
    });
  }, [openPrompt, doSearch]);

  const wakeAssistant = useCallback(() => {
    voiceAwakeRef.current = true;
    setVoiceAwake(true);
    setVoiceText('我在，请说…');
    TrackPlayer.getVolume().then(v => {
      volumeBeforeWake.current = v || 0.8;
      void TrackPlayer.setVolume(Math.min(volumeBeforeWake.current, 0.22));
    }).catch(() => undefined);
  }, []);

  const localVoiceIntent = useCallback((text: string): string => {
    const s = String(text || '').trim();
    if (/小声|音量低|轻声/.test(s)) return 'VOL_DOWN';
    if (/大声|音量高|响一点/.test(s)) return 'VOL_UP';
    if (/暂停|停一下|停止播放/.test(s)) return 'PAUSE';
    if (/继续|播放/.test(s)) {
      const m = s.match(/播放(.+?)(音乐|歌曲|歌)?$/);
      const name = (m && m[1] || '').replace(/一些|好听的|首|^[,，。 ]+|[,，。 ]+$/g, '').trim();
      if (name) return 'PLAY:' + name;
      return 'RESUME';
    }
    return 'UNKNOWN';
  }, []);

  const runVoiceCommand = useCallback(async (text: string) => {
    let intent = localVoiceIntent(text);
    try {
      const resp = await fetch('https://kaobei-music.pages.dev/api/glm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'intent', prompt: text })
      });
      const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
      if (/^(PLAY:|VOL_DOWN|VOL_UP|PAUSE|RESUME|UNKNOWN)/.test(raw)) intent = raw.split('\n')[0].trim();
    } catch { /* 使用本地兜底 */ }
    if (intent === 'VOL_DOWN') {
      const cur = await TrackPlayer.getVolume().catch(() => 0.5);
      await TrackPlayer.setVolume(Math.max(0.05, cur - 0.15));
      setVoiceText('已调小音量');
      return;
    }
    if (intent === 'VOL_UP') {
      const cur = await TrackPlayer.getVolume().catch(() => 0.3);
      await TrackPlayer.setVolume(Math.min(1, cur + 0.15));
      setVoiceText('已调大音量');
      return;
    }
    if (intent === 'PAUSE') { await togglePlayPause(); setVoiceText('好的，已暂停'); return; }
    if (intent === 'RESUME') {
      await togglePlayPause();
      await TrackPlayer.setVolume(volumeBeforeWake.current);
      setVoiceText('好的，继续播放');
      return;
    }
    if (intent.startsWith('PLAY:')) {
      const name = intent.slice(5).trim().slice(0, 40) || '好听的音乐';
      setVoiceText('这就为您播放「' + name + '」');
      setQuery(name);
      const tracks = await searchAll(name, cfg).catch(() => []);
      if (tracks.length) {
        await startPlay(tracks[0]);
        await TrackPlayer.setVolume(volumeBeforeWake.current);
        voiceAwakeRef.current = false;
        setVoiceAwake(false);
      }
      return;
    }
    setVoiceText('我没听懂，可以说“播放晴天”');
  }, [cfg, localVoiceIntent, startPlay]);

  useEffect(() => {
    const onResults = (e: SpeechResultsEvent) => {
      const spoken = String((e.value && e.value[0]) || '').trim();
      if (!spoken) return;
      const low = spoken.toLowerCase();
      if (!voiceAwakeRef.current && /hey music|hi music|嗨音乐|嘿音乐/.test(low)) {
        wakeAssistant();
        return;
      }
      if (voiceAwakeRef.current) void runVoiceCommand(spoken);
    };
    const onError = (_e: SpeechErrorEvent) => setVoiceText('没有听清，请再说一次');
    Voice.onSpeechResults = onResults;
    Voice.onSpeechError = onError;
    return () => { Voice.destroy().catch(() => undefined); };
  }, [runVoiceCommand, wakeAssistant]);

  const toggleAssistant = useCallback(() => {
    if (voiceAwakeRef.current) {
      void Voice.stop().catch(() => undefined);
      voiceAwakeRef.current = false;
      setVoiceAwake(false);
      setVoiceText('');
      void TrackPlayer.setVolume(volumeBeforeWake.current);
      return;
    }
    wakeAssistant();
    const fallback = () => { setVoiceText('语音识别不可用，请输入命令'); setVoiceInputOpen(true); };
    const start = () => { void Voice.start('zh-CN').catch(fallback); };
    if (Platform.OS === 'android') {
      void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).then(granted => {
        if (granted === PermissionsAndroid.RESULTS.GRANTED) start();
        else fallback();
      }).catch(fallback);
    } else start();
  }, [wakeAssistant]);

  const renderSourcePills = (track: Track) => {
    const visible = track.sources.slice(0, 3);
    const more = track.sources.length - visible.length;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
        {visible.map((s: TrackSource, i: number) => {
          const acc = sourceAccess(s);
          return (
            <TouchableOpacity key={`${s.sourceId}-${i}`} style={styles.pill} onPress={() => Alert.alert(
              `${s.platform} · ${ACCESS_META[acc].label}`,
              `音质：${s.quality}\n时长：${fmtTime(sourceDuration(s))}\n${s.playUrl ? '点击上方歌曲播放' : '暂无可播放地址'}`
            )}>
              <View style={[styles.pillDot, { backgroundColor: s.color }]} />
              <Text style={styles.pillText}>{s.short}</Text>
              <Text style={[styles.pillAcc, { color: ACCESS_META[acc].color }]}>{ACCESS_META[acc].label}</Text>
            </TouchableOpacity>
          );
        })}
        {more > 0 && <View style={styles.pill}><Text style={styles.pillText}>+{more}</Text></View>}
      </ScrollView>
    );
  };

  const renderTrack = ({ item }: { item: Track }) => {
    const acc = accessOf(item);
    const isFav = favorites.includes(item.key);
    return (
      <TouchableOpacity style={styles.trackCard} onPress={() => startPlay(item)} onLongPress={() => setDetailTrack(item)} activeOpacity={0.75}>
        {item.cover ? <Image source={{ uri: item.cover }} style={styles.cover} /> : <View style={[styles.cover, styles.coverPh]}><Text style={styles.coverPhText}>♪</Text></View>}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}{item.year ? ' · ' + item.year : ''}</Text>
          <AccessBadge access={acc} />
          {renderSourcePills(item)}
        </View>
        <View style={styles.trackActions}>
          <TouchableOpacity onPress={() => toggleFav(item)} style={styles.iconBtn}>
            <Text style={[styles.iconText, { color: isFav ? '#ff3b5c' : COLORS.sub }]}>{isFav ? '♥' : '♡'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => toggleCollect(item)} style={styles.iconBtn}>
            <Text style={[styles.iconText, { color: collected.some(t => t.key === item.key) ? '#f59e0b' : COLORS.sub }]}>★</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => addToQueue(item)} style={styles.iconBtn}>
            <Text style={styles.iconText}>+</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const currentLyricIdx = lyricIndexAt(lyrics, position);
  const lyricScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (currentLyricIdx >= 0 && lyricScrollRef.current) {
      lyricScrollRef.current.scrollTo({ y: Math.max(0, currentLyricIdx * 34 - 110), animated: true });
    }
  }, [currentLyricIdx]);

  const renderLibraryList = (list: Track[], emptyText: string, onRemove?: (track: Track) => void) => {
    if (!list.length) return <Text style={styles.hint}>{emptyText}</Text>;
    return list.map(t => (
      <TouchableOpacity key={t.key} style={styles.trackCard} onPress={() => void startPlay(t)} activeOpacity={0.75}>
        <View style={[styles.cover, styles.coverPh]}><Text style={styles.coverPhText}>♪</Text></View>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{t.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{t.artist}</Text>
        </View>
        <View style={styles.trackActions}>
          <TouchableOpacity onPress={() => toggleCollect(t)} style={styles.iconBtn}>
            <Text style={[styles.iconText, { color: collected.some(x => x.key === t.key) ? '#f59e0b' : COLORS.sub }]}>★</Text>
          </TouchableOpacity>
          {onRemove && (
            <TouchableOpacity onPress={() => onRemove(t)} style={styles.iconBtn}>
              <Text style={styles.iconText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    ));
  };

  const libraryLists: Record<'liked' | 'collected' | 'recent', { tracks: Track[]; empty: string }> = {
    liked: { tracks: favoriteTracks, empty: '在歌曲或播放器上点红色爱心，就会出现在这里。' },
    collected: { tracks: collected, empty: '点歌曲旁的橙色星星即可收藏。' },
    recent: { tracks: recent, empty: '最近播放会保存在本机，最多 500 首。' }
  };

  return (
    <View style={[styles.root, { backgroundColor: themeBg }]}>
      {/* 顶部品牌栏 */}
      <View style={styles.header}>
        <Image source={require('./assets/logo.png')} style={styles.logo} />
        <View>
          <Text style={styles.brand}>KB Music</Text>
          <Text style={styles.brandSub}>多音源免费音乐聚合</Text>
        </View>
        <View style={styles.headerSpacer} />
        <TouchableOpacity style={styles.settingGear} onPress={() => setSettingsOpen(true)}>
          <Text style={styles.settingGearText}>⚙</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.codeChip} onPress={() => setTab('library')}>
          <Text style={styles.codeChipText}>{profile?.nickname ? '♪ ' + profile.nickname : '♪ 设置昵称'}</Text>
        </TouchableOpacity>
      </View>

      {/* 搜索栏 */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索歌曲、歌手…"
          placeholderTextColor={COLORS.sub}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => submitSearch(query)}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={() => submitSearch(query)}>
          {searching ? <ActivityIndicator color="#04121a" size="small" /> : <Text style={styles.searchBtnText}>搜索</Text>}
        </TouchableOpacity>
      </View>

      {/* 完整筛选：访问状态 / 音源 / 排序 */}
      {tab === 'search' && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {([['all', '全部'], ['free', '免费'], ['preview', '试听'], ['paid', '付费']] as const).map(([v, label]) => (
              <TouchableOpacity key={v} style={[styles.filterBtn, accessFilter === v && styles.filterBtnOn]} onPress={() => setAccessFilter(v)}>
                <Text style={[styles.filterBtnText, accessFilter === v && styles.filterBtnTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.filterBtn, sourceFilter === 'all' && styles.filterBtnOn]} onPress={() => setSourceFilter('all')}>
              <Text style={[styles.filterBtnText, sourceFilter === 'all' && styles.filterBtnTextOn]}>全部音源</Text>
            </TouchableOpacity>
            {SOURCE_DEFS.map(s => (
              <TouchableOpacity key={s.id} style={[styles.filterBtn, sourceFilter === s.id && styles.filterBtnOn]} onPress={() => setSourceFilter(s.id)}>
                <Text style={[styles.filterBtnText, sourceFilter === s.id && styles.filterBtnTextOn]}>{s.short}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {([['default', '默认排序'], ['time', '时长优先'], ['title', '标题排序']] as const).map(([v, label]) => (
              <TouchableOpacity key={v} style={[styles.filterBtn, sortBy === v && styles.filterBtnOn]} onPress={() => setSortBy(v)}>
                <Text style={[styles.filterBtnText, sortBy === v && styles.filterBtnTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.filterBtn} onPress={() => { setAccessFilter('all'); setSourceFilter('all'); setSortBy('default'); setFreeOnly(false); }}>
              <Text style={styles.filterBtnText}>清除筛选</Text>
            </TouchableOpacity>
            <Text style={styles.filterStat}>免费 {freeCount} / 共 {results.length} · {progress ? progress.done + '/' + progress.total + ' 源' : ''}</Text>
          </ScrollView>
        </View>
      )}

      {/* 内容区 */}
      {tab === 'discover' && (
        <ScrollView style={styles.content}>
          <View style={styles.mhTop}>
            <Text style={[styles.mhTab, styles.mhTabOn]}>发现</Text>
            <TouchableOpacity onPress={() => { setFreeOnly(true); setTab('search'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.mhTab}>免费听</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('library')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.mhTab}>乐库</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.mhHeroRow}>
            <TouchableOpacity style={styles.mhHero} activeOpacity={0.85} onPress={() => { setQuery(SHELF[0].q); doSearch(SHELF[0].q); }}>
              <Text style={styles.mhHeroTitle}>宅家 <Text style={styles.mhHeroAccent}>RadiO</Text> ⇄</Text>
              <Text style={styles.mhHeroSub}>Story · Taylor Swift</Text>
              <View style={styles.mhPlay}><Text style={styles.mhPlayText}>▶</Text></View>
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mhCovers}>
              {SHELF.map(p => (
                <TouchableOpacity key={p.name} style={[styles.mhCover, { backgroundColor: p.c2 }]} onPress={() => { setQuery(p.q); doSearch(p.q); }}>
                  <Text style={styles.mhCoverTitle}>{p.name}</Text>
                  <Text style={styles.mhCoverSub}>{p.sub}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <Text style={styles.mhNote}>宝藏音乐故事 · 为你推荐</Text>
          <TouchableOpacity style={styles.mhTitleRow} onPress={() => { setQuery(GUESS[0]); doSearch(GUESS[0]); }} hitSlop={{ top: 6, bottom: 6 }}>
            <Text style={styles.mhTitle}>私人专属好歌</Text>
            <Text style={styles.mhMore}>发现更多 ›</Text>
          </TouchableOpacity>
          {GUESS.slice(0, 6).map(g => (
            <TouchableOpacity key={g} style={styles.mhRow} onPress={() => { setQuery(g); doSearch(g); }}>
              <View style={styles.mhCoverSm}><Text style={styles.mhCoverSmText}>♪</Text></View>
              <View style={styles.mhInfo}>
                <Text style={styles.mhSong}>{g}</Text>
                <Text style={styles.mhArtist}>推荐 · 点击发现相似好歌</Text>
              </View>
              <Text style={styles.mhMore}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {tab === 'search' && (
        <FlatList
          style={styles.content}
          data={visibleResults}
          keyExtractor={t => t.key}
          renderItem={renderTrack}
          ListEmptyComponent={
            !searching ? <View style={styles.empty}><Text style={styles.emptyText}>{results.length ? '没有符合条件的歌曲' : '输入歌名或歌手开始搜索'}</Text></View> : null
          }
        />
      )}

      {tab === 'library' && (
        <ScrollView style={styles.content}>
          {shared ? (
            <>
              <Text style={styles.sectionTitle}>♫ {shared.n}</Text>
              <Text style={styles.hint}>他人分享的歌单快照 · {shared.t.length} 首 · 不会随对方修改而更新</Text>
              <TouchableOpacity style={styles.smallBtn} onPress={importShared}>
                <Text style={styles.smallBtnText}>导入到我的歌单库</Text>
              </TouchableOpacity>
              {renderLibraryList(shared.t, '这个歌单目前没有歌曲。')}
            </>
          ) : (
            <>
              {/* 我的：模仿网易云个人主页头部 */}
              <View style={styles.mineHeader}>
                <Image source={require('./assets/logo.png')} style={styles.mineAvatar} />
                <Text style={styles.mineName}>{profile?.nickname || '音乐爱好者'}</Text>
                <Text style={styles.mineSub}>本地音乐库 · 数据仅保存在本机</Text>
                <View style={styles.mineStats}>
                  <Text style={styles.mineStat}>喜欢 {favorites.length}</Text>
                  <Text style={styles.mineStat}>收藏 {collected.length}</Text>
                  <Text style={styles.mineStat}>最近 {recent.length}</Text>
                </View>
                <View style={styles.mineTiles}>
                  {([['liked', '♥ 喜欢'], ['collected', '★ 收藏'], ['recent', '◷ 最近'], ['playlists', '♫ 歌单']] as const).map(([id, label]) => (
                    <TouchableOpacity key={id} style={styles.mineTile} onPress={() => setLibrarySection(id)}><Text style={styles.mineTileText}>{label}</Text></TouchableOpacity>
                  ))}
                </View>
              </View>
              <Text style={styles.sectionTitle}>我的音乐库</Text>
              <View style={styles.segmentRow}>
                {([['liked', '♥ 我喜欢'], ['collected', '★ 收藏'], ['recent', '◷ 最近'], ['playlists', '♫ 歌单']] as const).map(([id, label]) => (
                  <TouchableOpacity key={id} style={[styles.segmentBtn, librarySection === id && styles.segmentBtnOn]} onPress={() => setLibrarySection(id)}>
                    <Text style={[styles.segmentText, librarySection === id && styles.segmentTextOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {librarySection !== 'playlists' && renderLibraryList(
                libraryLists[librarySection].tracks,
                libraryLists[librarySection].empty,
                librarySection === 'collected' ? (t => toggleCollect(t)) : undefined
              )}

              {librarySection === 'playlists' && (
                <>
                  <View style={styles.rowButtons}>
                    <TouchableOpacity style={styles.smallBtn} onPress={createPlaylist}>
                      <Text style={styles.smallBtnText}>＋ 创建歌单</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallBtnGhost} onPress={importFromLink}>
                      <Text style={styles.smallBtnGhostText}>导入他人歌单</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.groupToggle} onPress={() => setPlaylistExpanded(v => !v)}>
                    <Text style={styles.groupToggleText}>{playlistExpanded ? '▾' : '▶'} 我的个人歌单（{playlists.length}）</Text>
                  </TouchableOpacity>
                  {playlistExpanded && playlists.map(p => (
                    <View key={p.id} style={styles.card}>
                      <TouchableOpacity onPress={() => setActivePlaylistId(activePlaylistId === p.id ? null : p.id)}>
                        <Text style={styles.playlistName}>♫ {p.name} · {p.tracks.length} 首</Text>
                      </TouchableOpacity>
                      <View style={styles.rowButtons}>
                        <TouchableOpacity style={styles.smallBtnGhost} onPress={() => sharePlaylist(p)}>
                          <Text style={styles.smallBtnGhostText}>分享</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.smallBtnGhost} onPress={() => renamePlaylist(p)}>
                          <Text style={styles.smallBtnGhostText}>改名</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.smallBtnGhost} onPress={() => deletePlaylist(p)}>
                          <Text style={styles.smallBtnGhostText}>删除</Text>
                        </TouchableOpacity>
                      </View>
                      {activePlaylistId === p.id && (
                        <>
                          <TouchableOpacity style={styles.smallBtnGhost} onPress={() => addCurrentToPlaylist(p)}>
                            <Text style={styles.smallBtnGhostText}>＋ 添加当前歌曲</Text>
                          </TouchableOpacity>
                          {renderLibraryList(p.tracks, '这个歌单还没有歌曲。', (t => removeFromPlaylist(p, t)))}
                        </>
                      )}
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>我的资料</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>昵称（仅保存在本机）</Text>
            <TextInput style={styles.cardInput} value={nickInput} onChangeText={setNickInput} placeholder="你的昵称" placeholderTextColor={COLORS.sub} />
            <TouchableOpacity style={styles.smallBtn} onPress={saveNick}><Text style={styles.smallBtnText}>保存昵称</Text></TouchableOpacity>
            <Text style={styles.hint}>无需账号，昵称、收藏、最近播放与歌单只保存在你的设备上。</Text>
          </View>

          <Text style={styles.sectionTitle}>播放队列（{queueKeys.length}）</Text>
          <View style={styles.card}>
            {queueKeys.length === 0 ? <Text style={styles.hint}>队列为空，长按歌曲可加入</Text> :
              queueKeys.map((k, i) => <Text key={`${k}-${i}`} style={styles.queueItem}>{k}</Text>)}
          </View>

          <Text style={styles.sectionTitle}>关于</Text>
          <View style={styles.card}>
            <Text style={styles.aboutTitle}>靠北音乐 · KB Music</Text>
            <Text style={styles.hint}>创始人：靠北（靠北科技）。「靠北」仅为品牌/项目名称，没有实际意义，请勿用于其他骂人/贬损语境。</Text>
            <Text style={styles.hint}>收藏、队列与昵称全部保存在本机，无需账号或数据库。</Text>
          </View>
        </ScrollView>
      )}

      {/* 迷你播放条：点击任意非按钮区域一镜到底展开；播放键独立，避免嵌套点击 */}
      {currentTrack && (
        <View style={styles.miniPlayer}>
          <TouchableOpacity style={styles.miniMain} onPress={openPlayer} activeOpacity={0.9}>
            <Image source={{ uri: currentTrack.cover || '' }} style={styles.miniCover} />
            <View style={styles.miniInfo}>
              <Text style={styles.miniTitle} numberOfLines={1}>{currentTrack.title}</Text>
              <Text style={styles.miniArtist} numberOfLines={1}>{currentTrack.artist}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.miniPlay} onPress={() => void togglePlayPause()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.miniPlayText}>{isPlaying ? '❚❚' : '▶'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 语音识别不可用时的文字命令兜底 */}
      <Modal visible={voiceInputOpen} transparent animationType="fade" onRequestClose={() => setVoiceInputOpen(false)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.modalTitle}>告诉 KB Music</Text>
            <Text style={styles.hint}>例如：播放晴天、小声一点、暂停</Text>
            <TextInput style={styles.cardInput} value={voiceInputText} onChangeText={setVoiceInputText} placeholder="输入命令" placeholderTextColor={COLORS.sub} autoFocus />
            <View style={styles.rowButtons}>
              <TouchableOpacity style={styles.smallBtnGhost} onPress={() => setVoiceInputOpen(false)}><Text style={styles.smallBtnGhostText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => {
                const cmd = voiceInputText.trim();
                setVoiceInputOpen(false);
                setVoiceInputText('');
                if (cmd) void runVoiceCommand(cmd);
              }}><Text style={styles.smallBtnText}>执行</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 设置 / 音源设置 */}
      <Modal visible={settingsOpen} transparent animationType="slide" onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.modalMask}>
          <View style={[styles.modalCard, { maxHeight: '82%' }]}>
            <Text style={styles.modalTitle}>设置 · 音源</Text>
            <ScrollView>
              {SOURCE_DEFS.map(s => {
                const conf = cfg.sources[s.id] || { enabled: false };
                return (
                  <View key={s.id} style={styles.settingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingName}>{s.name}</Text>
                      <Text style={styles.settingDesc}>{s.desc}</Text>
                      {s.type === 'meting' && (
                        <TextInput
                          style={styles.settingInput}
                          value={conf.base || s.defaultBase || ''}
                          onChangeText={v => setCfg(prev => ({ ...prev, sources: { ...prev.sources, [s.id]: { ...conf, base: v } } }))}
                          placeholder="Meting API 地址"
                        />
                      )}
                    </View>
                    <Switch
                      value={!!conf.enabled}
                      onValueChange={v => setCfg(prev => ({ ...prev, sources: { ...prev.sources, [s.id]: { ...conf, enabled: v } } }))}
                    />
                  </View>
                );
              })}
              <Text style={styles.settingName}>界面配色（26 套）</Text>
              <Text style={styles.settingDesc}>来自 KB Chat 配色参考库，切换后立即生效并保存。</Text>
              <View style={styles.themeGrid}>
                <TouchableOpacity
                  style={[styles.themeChip, { backgroundColor: COLORS.bg, borderColor: themeId === 'default' ? COLORS.accent : COLORS.border }]}
                  onPress={() => { setThemeId('default'); void AsyncStorage.setItem('kb-color-theme', 'default').catch(() => undefined); }}
                >
                  <Text style={[styles.themeChipText, { color: COLORS.text }]}>默认（原配色）</Text>
                </TouchableOpacity>
                {NATIVE_THEMES.map(t => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.themeChip, { backgroundColor: t.bg, borderColor: t.id === themeId ? COLORS.accent : COLORS.border }]}
                    onPress={() => { setThemeId(t.id); void AsyncStorage.setItem('kb-color-theme', t.id).catch(() => undefined); }}
                  >
                    <Text style={[styles.themeChipText, { color: t.fg }]}>{t.n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.settingSave} onPress={() => { void Storage.saveConfig(cfg); setSettingsOpen(false); }}>
              <Text style={styles.settingSaveText}>保存并返回</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* GLM 语音助手：全局蓝色渐变小球 */}
      <Animated.View style={[styles.ballAnchor, { transform: ballPos.getTranslateTransform() }]} {...ballPan.panHandlers}>
        {updateProgress === null ? (
          <TouchableOpacity style={styles.aiBall} onPress={toggleAssistant} activeOpacity={0.85} accessibilityLabel="语音助手">
            <View style={styles.aiBallCore}><Text style={styles.aiBallText}>{voiceAwake ? '•••' : '♪'}</Text></View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.updateBall} activeOpacity={0.9} onPress={() => { if (updateInfo) void Linking.openURL(updateInfo.url).catch(() => undefined); }}>
            <View style={[styles.updateWater, { height: Math.round(64 * updateProgress / 100) }]} />
            <Text style={styles.updateBallText}>{updateProgress}%</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
      {voiceText ? <View style={styles.aiBubble}><Text style={styles.aiBubbleText}>{voiceText}</Text></View> : null}

      {/* 底部导航 */}
      <View style={styles.tabBar}>
        {([['discover', '发现', '◈'], ['search', '搜索', '⌕'], ['library', '我的', '☺']] as const).map(([id, label, icon]) => (
          <TouchableOpacity key={id} style={styles.tabItem} onPress={() => {
            setTab(id);
            if (id === 'library') {
              setLibrarySection('liked');
              mineAnim.setValue(0);
              Animated.spring(mineAnim, { toValue: 1, friction: 3, tension: 180, useNativeDriver: true }).start(() => mineAnim.setValue(0));
            }
          }}>
            {id === 'library' ? (
              <Animated.View style={[styles.mineFace, {
                transform: [
                  { scale: mineAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.22, 1] }) },
                  { rotate: mineAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }
                ]
              }]}>
                <View style={styles.mineEye} />
                <View style={[styles.mineEye, { left: 18 }]} />
                <View style={styles.mineSmile} />
                <View style={styles.mineBadge}><Text style={styles.mineBadgeText}>1</Text></View>
              </Animated.View>
            ) : id === 'search' ? (
              <Image source={require('./assets/logo.png')} style={[styles.tabPhoto, tab === id && styles.tabPhotoOn]} />
            ) : (
              <Text style={[styles.tabIcon, tab === id && styles.tabIconOn]}>{icon}</Text>
            )}
            <Text style={[styles.tabLabel, tab === id && styles.tabLabelOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 全屏播放页：一镜到底 morph + 歌词占满全屏；下滑收起/回弹 */}
      <Modal visible={playerOpen} transparent animationType="none" statusBarTranslucent onRequestClose={closePlayer}>
        <Animated.View style={[styles.playerSheet, {
          backgroundColor: themeBg,
          opacity: sheetOpacity,
          transform: [{ translateY: sheetTranslateY }]
        }]}>
          <View
            style={styles.playerScreen}
            onTouchStart={e => onSheetTouchStart(e.nativeEvent.pageY)}
            onTouchMove={e => onSheetTouchMove(e.nativeEvent.pageY)}
            onTouchEnd={onSheetTouchEnd}
          >
            <View style={styles.sheetGrabber} />
            <View style={[styles.playerTopBg, { backgroundColor: themeBg }]} />
            <Animated.View style={[styles.playerAura, { opacity: 0.28 }]} />
            <View style={styles.playerHeadRow}>
              <TouchableOpacity onPress={closePlayer} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.playerCloseText, psStyle]}>∨ 收起</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLyricFocus(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.playerModeText, psStyle]}>{lyricFocus ? '◉ 唱片' : '≡ 歌词'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLyricStage(s => LYRIC_STAGES[(LYRIC_STAGES.indexOf(s) + 1) % LYRIC_STAGES.length])} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.playerModeText, psStyle]}>舞台 {LYRIC_STAGE_LABELS[lyricStage]}</Text>
              </TouchableOpacity>
              {!lyricFocus && (
                <TouchableOpacity onPress={() => setVinylMode(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[styles.playerModeText, psStyle]}>{vinylMode ? '◉ 黑胶' : '□ 方形'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {currentTrack && (
              <>
                {/* 封面：歌词模式收起为 0 高，把整屏让给歌词；morph 负责从迷你条放大 */}
                <Animated.View style={[styles.playerCoverSlot, {
                  height: lyricAnim.interpolate({ inputRange: [0, 1], outputRange: [coverSize + 16, 0], extrapolate: 'clamp' }),
                  opacity: lyricAnim.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' })
                }]}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setLyricFocus(true)}>
                    <Animated.View style={[styles.playerCoverWrap, {
                      width: coverSize, height: coverSize, borderRadius: coverSize / 2,
                      transform: [{ rotate: spinAngle }, { translateY: coverY }, { scale: coverScale }]
                    }]}>
                      {currentTrack.cover ? (
                        <Image source={{ uri: currentTrack.cover }} style={[styles.playerCover, {
                          width: coverSize - 28, height: coverSize - 28,
                          borderRadius: vinylMode ? (coverSize - 28) / 2 : 8
                        }]} />
                      ) : (
                        <View style={[styles.playerCover, styles.playerCoverPh, {
                          width: coverSize - 28, height: coverSize - 28,
                          borderRadius: vinylMode ? (coverSize - 28) / 2 : 8
                        }]}><Text style={styles.playerCoverPhText}>♪</Text></View>
                      )}
                      {vinylMode && <View style={styles.vinylHole} />}
                    </Animated.View>
                  </TouchableOpacity>
                </Animated.View>
                <TouchableOpacity style={styles.playerMetaBox} activeOpacity={0.9} onPress={() => setLyricFocus(v => !v)}>
                  <Text style={[styles.playerTitle, pfStyle]}>{currentTrack.title}</Text>
                  <Text style={[styles.playerArtist, psStyle]}>{currentTrack.artist}{currentTrack.year ? ' · ' + currentTrack.year : ''}</Text>
                </TouchableOpacity>
                <View style={[styles.lyricBox, lyricFocus && styles.lyricBoxFull]}>
                  <ScrollView ref={lyricScrollRef} showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.lyricContent, { paddingVertical: lyricFocus ? lyricPad : 24 }]}>
                    {lyrics.length ? lyrics.map((l, i) => (
                      <Text key={i} style={[styles.lyricLine, psStyle, lyricFocus && styles.lyricLineList, i === currentLyricIdx && styles.lyricLineOn, i === currentLyricIdx && lyricFocus && styles.lyricLineListOn, i === currentLyricIdx && { color: COLORS.accent }, lyricStage === 'hand' && styles.lyricHand, lyricStage === 'caption' && styles.lyricCaption, lyricStage === 'dialogue' && styles.lyricDialogue, lyricStage === 'dialogue' && i % 2 === 1 && styles.lyricDialogueAlt]}>{l.text}</Text>
                    )) : <Text style={[styles.lyricEmpty, psStyle]}>暂无歌词</Text>}
                  </ScrollView>
                </View>
                <View style={styles.seekRow}>
                  <Text style={[styles.timeText, psStyle]}>{fmtTime(position)}</Text>
                  <TouchableOpacity style={[styles.seekBar, { backgroundColor: ctrlBg }]} hitSlop={{ top: 12, bottom: 12 }}
                    onLayout={e => { seekWidth.current = e.nativeEvent.layout.width; }}
                    onPress={e => {
                      const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / (seekWidth.current || 1)));
                      seekTo(ratio * (duration || 0)).catch(() => undefined);
                    }}>
                    <View style={[styles.seekFill, { width: `${duration ? (position / duration) * 100 : 0}%` }]} />
                  </TouchableOpacity>
                  <Text style={[styles.timeText, psStyle]}>{fmtTime(duration)}</Text>
                </View>
                <View style={styles.playerControls}>
                  <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: ctrlBg }]} onPress={() => playRelative(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.ctrlSide, psStyle]}>◀◀</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bigPlay} activeOpacity={0.8} onPress={() => void togglePlayPause()}>
                    <Text style={styles.bigPlayText}>{isPlaying ? '❚❚' : '▶'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: ctrlBg }]} onPress={() => playRelative(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.ctrlSide, psStyle]}>▶▶</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.playerActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggleFav(currentTrack)}>
                    <Text style={[styles.actionIcon, favorites.includes(currentTrack.key) && styles.heartOn]}>{favorites.includes(currentTrack.key) ? '♥' : '♡'}</Text>
                    <Text style={[styles.actionLabel, psStyle]}>喜欢</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggleCollect(currentTrack)}>
                    <Text style={[styles.actionIcon, collected.some(t => t.key === currentTrack.key) && styles.starOn]}>★</Text>
                    <Text style={[styles.actionLabel, psStyle]}>收藏</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setDetailTrack(currentTrack)}>
                    <Text style={[styles.actionIcon, psStyle]}>ⓘ</Text><Text style={[styles.actionLabel, psStyle]}>音源</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </Animated.View>
      </Modal>

      {/* 歌单命名 / 链接输入 */}
      <Modal visible={promptState !== null} animationType="fade" transparent onRequestClose={() => setPromptState(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>{promptState ? promptState.title : ''}</Text>
            <TextInput style={styles.cardInput} value={promptValue} onChangeText={setPromptValue} placeholder="输入内容" placeholderTextColor={COLORS.sub} autoFocus />
            <View style={styles.rowButtons}>
              <TouchableOpacity style={styles.smallBtnGhost} onPress={() => setPromptState(null)}>
                <Text style={styles.smallBtnGhostText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => {
                const state = promptState;
                setPromptState(null);
                if (state) state.onConfirm(promptValue);
              }}>
                <Text style={styles.smallBtnText}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 分享链接 */}
      <Modal visible={shareText !== null} animationType="fade" transparent onRequestClose={() => setShareText(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>分享歌单</Text>
            <Text style={styles.hint}>链接包含歌单快照，对方看到的名字和歌曲不会随你后续修改而更新。</Text>
            <Text style={styles.shareUrlText} selectable>{shareText || ''}</Text>
            <View style={styles.rowButtons}>
              <TouchableOpacity style={styles.smallBtnGhost} onPress={() => setShareText(null)}>
                <Text style={styles.smallBtnGhostText}>关闭</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => {
                if (shareText) {
                  Clipboard.setString(shareText);
                  Alert.alert('已复制', '歌单链接已复制到剪贴板。');
                }
              }}>
                <Text style={styles.smallBtnText}>复制链接</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 歌曲详情 */}
      <Modal visible={detailTrack !== null} animationType="fade" transparent onRequestClose={() => setDetailTrack(null)}>
        {detailTrack && (
          <View style={styles.detailOverlay}>
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>{detailTrack.title}</Text>
              <Text style={styles.detailArtist}>{detailTrack.artist}</Text>
              <AccessBadge access={accessOf(detailTrack)} />
              <FlatList data={detailTrack.sources} keyExtractor={(s, i) => `${s.sourceId}-${i}`} renderItem={({ item: s }) => (
                <TouchableOpacity style={styles.detailSource} onPress={() => { setDetailTrack(null); void startPlay(detailTrack); }}>
                  <View style={[styles.pillDot, { backgroundColor: s.color }]} />
                  <Text style={styles.detailSourceName}>{s.platform}</Text>
                  <Text style={styles.detailSourceMeta}>{s.quality} · {fmtTime(sourceDuration(s))}</Text>
                  <Text style={[styles.detailSourceAcc, { color: ACCESS_META[sourceAccess(s)].color }]}>{ACCESS_META[sourceAccess(s)].label}</Text>
                </TouchableOpacity>
              )} />
              <TouchableOpacity style={styles.smallBtn} onPress={() => setDetailTrack(null)}><Text style={styles.smallBtnText}>关闭</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 36, paddingBottom: 12, gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  brand: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  brandSub: { color: COLORS.sub, fontSize: 11 },
  headerSpacer: { flex: 1 },
  codeChip: { backgroundColor: COLORS.panel2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  codeChipText: { color: COLORS.accent, fontSize: 11 },
  searchBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, backgroundColor: COLORS.panel, borderRadius: 12, paddingHorizontal: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, fontSize: 14 },
  searchBtn: { backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  searchBtnText: { color: '#04121a', fontWeight: '700', fontSize: 14 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'flex-end' },
  modalCard: { margin: 12, padding: 16, borderRadius: 20, backgroundColor: COLORS.panel },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  settingGear: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  settingGearText: { color: COLORS.accent, fontSize: 17 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingName: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  settingDesc: { color: COLORS.sub, fontSize: 10, marginTop: 2 },
  settingInput: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: COLORS.panel2, color: COLORS.text, fontSize: 10 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 12 },
  themeChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  themeChipText: { fontSize: 11, fontWeight: '700' },
  settingSave: { marginTop: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center' },
  settingSaveText: { color: '#04121a', fontWeight: '800', fontSize: 13 },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, gap: 10 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border },
  filterBtnOn: { backgroundColor: '#0d3b34', borderColor: '#22c55e' },
  filterBtnText: { color: COLORS.sub, fontSize: 12 },
  filterBtnTextOn: { color: '#4ade80' },
  filterStat: { color: COLORS.sub, fontSize: 12 },
  content: { flex: 1, paddingHorizontal: 16 },
  sectionTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginVertical: 12 },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shelfCard: { width: '30%', minWidth: 100 },
  shelfCover: { width: '100%', aspectRatio: 1, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  shelfIcon: { color: '#fff', fontSize: 40 },
  shelfName: { color: COLORS.text, fontSize: 13, fontWeight: '600', marginTop: 6 },
  shelfSub: { color: COLORS.sub, fontSize: 11, marginTop: 2 },
  trackCard: { flexDirection: 'row', padding: 8, backgroundColor: COLORS.panel, borderRadius: 12, marginBottom: 6, gap: 8 },
  cover: { width: 46, height: 46, borderRadius: 8 },
  coverPh: { backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center' },
  coverPhText: { color: COLORS.sub, fontSize: 24 },
  trackInfo: { flex: 1, justifyContent: 'center' },
  trackTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  trackArtist: { color: COLORS.sub, fontSize: 12, marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  pillsRow: { marginTop: 3 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, gap: 4 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { color: COLORS.text, fontSize: 10 },
  pillAcc: { fontSize: 10 },
  trackActions: { justifyContent: 'center', gap: 10 },
  iconBtn: { padding: 4 },
  iconText: { fontSize: 22, textAlign: 'center' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: COLORS.sub, fontSize: 13 },
  card: { backgroundColor: COLORS.panel, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardLabel: { color: COLORS.sub, fontSize: 12, marginTop: 10, marginBottom: 4 },
  cardInput: { backgroundColor: COLORS.panel2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: COLORS.text, fontSize: 13 },
  smallBtn: { backgroundColor: COLORS.accent2, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 8 },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.panel2, borderRadius: 8, padding: 10 },
  codeText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
  linkText: { color: '#fb7185', fontSize: 12 },
  hint: { color: COLORS.sub, fontSize: 11, marginTop: 8, lineHeight: 16 },
  friendRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  friendItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  friendName: { color: COLORS.text, fontSize: 13 },
  friendCode: { color: COLORS.sub, fontSize: 11 },
  queueItem: { color: COLORS.sub, fontSize: 12, paddingVertical: 4 },
  aboutTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  miniPlayer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel2, marginHorizontal: 8, marginBottom: 4, borderRadius: 10, padding: 8, gap: 6 },
  miniMain: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10, minWidth: 0 },
  miniCover: { width: 40, height: 40, borderRadius: 6 },
  miniInfo: { flex: 1 },
  miniTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  miniArtist: { color: COLORS.sub, fontSize: 11 },
  miniPlay: { padding: 8 },
  miniPlayText: { color: COLORS.accent, fontSize: 18 },
  mhTop: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 },
  mhTab: { color: COLORS.sub, fontSize: 15 },
  mhTabOn: { color: COLORS.text, fontSize: 19, fontWeight: '800' },
  mhHeroRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  mhHero: { flex: 0, width: 165, minHeight: 132, padding: 12, borderRadius: 18, backgroundColor: '#ffe3c9' },
  mhHeroTitle: { color: '#4a3329', fontSize: 17, fontWeight: '800' },
  mhHeroAccent: { color: '#e2673b' },
  mhHeroSub: { color: '#6b5340', fontSize: 11, marginTop: 6 },
  mhPlay: { position: 'absolute', right: 10, bottom: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: '#ff7a3c', justifyContent: 'center', alignItems: 'center' },
  mhPlayText: { color: '#fff', fontSize: 12 },
  mhCovers: { flex: 1 },
  mhCover: { width: 88, height: 88, borderRadius: 44, marginRight: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  mhCoverTitle: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  mhCoverSub: { color: '#fff', fontSize: 9, marginTop: 3, textAlign: 'center' },
  mhNote: { color: COLORS.sub, fontSize: 11, marginTop: 14 },
  mhTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 10 },
  mhTitle: { color: COLORS.text, fontSize: 19, fontWeight: '800' },
  mhTitleIcon: { color: COLORS.accent, fontSize: 13 },
  mhMore: { color: COLORS.sub, marginLeft: 'auto' },
  mhRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  mhCoverSm: { width: 48, height: 48, borderRadius: 8, backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center' },
  mhCoverSmText: { color: COLORS.sub, fontSize: 18 },
  mhInfo: { flex: 1 },
  mhSong: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  mhArtist: { color: COLORS.sub, fontSize: 11, marginTop: 3 },
  mhHeart: { color: COLORS.sub, fontSize: 18 },
  mineHeader: { alignItems: 'center', padding: 18, borderRadius: 20, backgroundColor: '#dff8f5', marginBottom: 14 },
  mineAvatar: { width: 78, height: 78, borderRadius: 39, marginBottom: 10 },
  mineName: { color: '#173c3a', fontSize: 18, fontWeight: '800' },
  mineSub: { color: '#4b7a75', fontSize: 11, marginTop: 4 },
  mineStats: { flexDirection: 'row', gap: 18, marginTop: 12 },
  mineStat: { color: '#173c3a', fontSize: 12 },
  mineTiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  mineTile: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.75)' },
  mineTileText: { color: '#173c3a', fontSize: 11 },
  tabPhoto: { width: 30, height: 30, borderRadius: 15, marginBottom: 2 },
  tabPhotoOn: { borderWidth: 2, borderColor: '#00bfa5' },
  mineBadge: { position: 'absolute', right: -5, top: -5, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: '#ff3b30', justifyContent: 'center', alignItems: 'center' },
  mineBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  mineFace: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#00bfa5', position: 'relative', marginBottom: 2 },
  mineEye: { position: 'absolute', left: 8, top: 10, width: 4, height: 4, borderRadius: 2, backgroundColor: '#00bfa5' },
  mineSmile: { position: 'absolute', left: 8, top: 14, width: 14, height: 9, borderBottomWidth: 2, borderBottomColor: '#00bfa5', borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 9, borderBottomRightRadius: 9 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6, paddingBottom: 10 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, color: COLORS.sub },
  tabIconOn: { color: COLORS.accent },
  tabLabel: { color: COLORS.sub, fontSize: 10.5, marginTop: 2 },
  tabLabelOn: { color: COLORS.accent },
  playerSheet: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  playerScreen: { flex: 1, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 26 },
  sheetGrabber: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(120,130,150,.45)', marginBottom: 10 },
  playerTopBg: { position: 'absolute', left: 0, right: 0, top: 0, height: 320 },
  playerCoverSlot: { alignSelf: 'center', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  lyricHand: { fontFamily: 'serif', color: '#ff7aa8', fontSize: 20, transform: [{ rotate: '-2deg' }] },
  lyricCaption: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#8a8f9c' },
  lyricDialogue: { alignSelf: 'flex-start', maxWidth: '76%', textAlign: 'left', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.18)' },
  lyricDialogueAlt: { alignSelf: 'flex-end', backgroundColor: 'rgba(7,193,96,.28)' },
  lyricLineList: { fontSize: 15, lineHeight: 30, opacity: 0.55 },
  lyricLineListOn: { fontSize: 19, lineHeight: 34, opacity: 1, color: '#fff' },
  playerClose: { alignSelf: 'flex-start', marginBottom: 30 },
  playerCloseText: { color: '#4b6561', fontSize: 15 },
  playerTitle: { color: '#173c3a', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  playerArtist: { color: '#63807c', fontSize: 14, textAlign: 'center', marginTop: 6 },
  lyricBox: { flex: 1, minHeight: 0, marginVertical: 12 },
  lyricBoxFull: { flexGrow: 1, flexShrink: 1, marginVertical: 4 },
  lyricContent: { paddingVertical: 24 },
  lyricLine: { color: COLORS.sub, fontSize: 15, textAlign: 'center', paddingVertical: 8 },
  lyricLineOn: { color: COLORS.accent, fontSize: 18, fontWeight: '700' },
  lyricEmpty: { color: COLORS.sub, textAlign: 'center', marginTop: 40 },
  seekRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeText: { color: '#4b6561', fontSize: 11, width: 38 },
  seekBar: { flex: 1, height: 4, backgroundColor: COLORS.panel2, borderRadius: 2 },
  seekFill: { height: 4, backgroundColor: COLORS.accent, borderRadius: 2 },
  bigPlay: { alignSelf: 'center', width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center', marginVertical: 24 },
  bigPlayText: { color: '#04121a', fontSize: 26 },
  detailOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: 20 },
  detailCard: { backgroundColor: COLORS.panel, borderRadius: 16, padding: 18, maxHeight: '70%' },
  detailTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  detailArtist: { color: COLORS.sub, fontSize: 13, marginTop: 4, marginBottom: 8 },
  detailSource: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  detailSourceName: { color: COLORS.text, fontSize: 13, flex: 1 },
  detailSourceMeta: { color: COLORS.sub, fontSize: 11 },
  detailSourceAcc: { fontSize: 11, fontWeight: '700' },
  // 酷狗概念版风格播放页
  playerAura: { position: 'absolute', top: -60, left: -40, right: -40, height: 320, borderRadius: 160, backgroundColor: COLORS.accent },
  playerHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  playerModeText: { color: '#4b6561', fontSize: 12 },
  playerCoverWrap: { width: 260, height: 260, alignSelf: 'center', marginTop: 8, marginBottom: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 130, borderWidth: 6, borderColor: '#12121e' },
  playerCover: { width: 232, height: 232 },
  playerCoverRound: { borderRadius: 116 },
  playerCoverPh: { backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center' },
  playerCoverPhText: { color: COLORS.accent, fontSize: 80 },
  vinylHole: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: '#0a0a14', borderWidth: 3, borderColor: '#2a2a44' },
  playerMetaBox: { alignItems: 'center', marginBottom: 14 },
  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 16 },
  ctrlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center' },
  ctrlSide: { color: '#4b6561', fontSize: 18 },
  playerActions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionIcon: { color: COLORS.sub, fontSize: 22 },
  actionIconOn: { color: '#fb7185' },
  heartOn: { color: '#ff3b5c' },
  starOn: { color: '#f59e0b' },
  actionLabel: { color: COLORS.sub, fontSize: 11 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  segmentBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.panel },
  segmentBtnOn: { borderColor: COLORS.accent2, backgroundColor: '#241b4d' },
  segmentText: { color: COLORS.sub, fontSize: 12 },
  segmentTextOn: { color: COLORS.text, fontWeight: '700' },
  rowButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 },
  smallBtnGhost: { backgroundColor: COLORS.panel2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  smallBtnGhostText: { color: COLORS.sub, fontSize: 12, fontWeight: '600' },
  groupToggle: { paddingVertical: 10 },
  groupToggleText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  playlistName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  shareUrlText: { color: COLORS.accent, fontSize: 12, lineHeight: 18, marginTop: 10, padding: 10, backgroundColor: COLORS.panel2, borderRadius: 8 },
  guessHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 130, padding: 16, borderRadius: 18, backgroundColor: '#3b2a7a', marginBottom: 12 },
  guessHeroInfo: { flex: 1 },
  guessHeroTitle: { color: '#fff', fontSize: 21, fontWeight: '800' },
  guessHeroSub: { color: '#cfc7ff', fontSize: 11, marginTop: 4 },
  guessHeroBtn: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fff', color: '#5b3bd6', fontSize: 11, fontWeight: '700' },
  guessHeroArt: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#22d3ee', justifyContent: 'center', alignItems: 'center' },
  guessHeroArtText: { color: '#fff', fontSize: 38, fontWeight: '700' },
  guessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  guessCard: { width: '30%', minHeight: 100, borderRadius: 14, padding: 10, justifyContent: 'space-between' },
  guessCardIcon: { color: '#fff', fontSize: 24 },
  guessCardTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  ballAnchor: { position: 'absolute', right: 10, bottom: 84, zIndex: 90 },
  updateBall: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#0e7490', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  updateWater: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#22d3ee' },
  updateBallText: { position: 'relative', color: '#fff', fontSize: 12, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 3 },
  aiBall: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', shadowColor: '#60a5fa', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 8 },
  aiBallCore: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#93c5fd' },
  aiBallText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  aiBubble: { position: 'absolute', right: 82, bottom: 104, maxWidth: 240, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16, backgroundColor: '#1e3a8a', zIndex: 81 },
  aiBubbleText: { color: '#fff', fontSize: 12, lineHeight: 17 }
});

export default App;
