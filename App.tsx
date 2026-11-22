import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import { State, usePlaybackState, useProgress } from 'react-native-track-player';
import type { Access, AppConfig, Profile, Track, TrackSource } from './src/types';
import { ACCESS_META, type LyricLine } from './src/types';
import { DEFAULT_CONFIG, accessOf, searchAll, sourceAccess, sourceDuration } from './src/sources';
import { Storage } from './src/storage';
import { fetchLrc, lyricIndexAt, parseLrc } from './src/lrc';
import { playTrack as enginePlay, seekTo, setupPlayer, togglePlayPause } from './src/player';

type Tab = 'discover' | 'search' | 'library';

const SHELF = [
  { name: '华语流行金曲', sub: '周杰伦 · 邓紫棋 · 陈奕迅', q: '华语流行', c1: '#7c5cff', c2: '#3b1d7a', icon: '♫' },
  { name: '深夜纯音乐', sub: '安静 · 专注 · 助眠', q: 'lo-fi 纯音乐', c1: '#0ea5e9', c2: '#0c4a6e', icon: '☾' },
  { name: '经典英文热歌', sub: 'Taylor Swift · Eminem', q: 'Taylor Swift', c1: '#f43f5e', c2: '#7f1d1d', icon: '♪' },
  { name: '中国风古韵', sub: '古风 · 戏腔 · 国风', q: '中国风 古风', c1: '#f59e0b', c2: '#78350f', icon: '❀' },
  { name: '摇滚现场', sub: 'Live · 乐队 · 热血', q: '摇滚 现场', c1: '#ef4444', c2: '#450a0a', icon: '⚡' },
  { name: '治愈系轻音乐', sub: '钢琴 · 吉他 · 自然', q: '治愈 轻音乐', c1: '#10b981', c2: '#064e3b', icon: '✿' }
];

const COLORS = {
  bg: '#0b0d12',
  panel: '#141821',
  panel2: '#1b2130',
  border: '#252c3a',
  text: '#e8ecf4',
  sub: '#8b95a9',
  accent: '#22d3ee',
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
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('discover');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [queueKeys, setQueueKeys] = useState<string[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [nickInput, setNickInput] = useState('');
  const searchSeq = useRef(0);
  const spin = useRef(new Animated.Value(0)).current;
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
    let alive = true;
    (async () => {
      await setupPlayer().catch(() => undefined);
      const [c, p, fav, q] = await Promise.all([
        Storage.loadConfig(), Storage.loadProfile(),
        Storage.loadFavorites(), Storage.loadQueue()
      ]);
      if (!alive) return;
      setCfg(c); setProfile(p); setFavorites(fav); setQueueKeys(q);
      setNickInput(p.nickname);
    })();
    return () => { alive = false; };
  }, []);

  const visibleResults = freeOnly ? results.filter(t => accessOf(t) === 'free') : results;
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

  const startPlay = useCallback(async (track: Track) => {
    const ok = await enginePlay(track).catch(() => false);
    if (ok) {
      setCurrentTrack(track);
      setPlayerOpen(true);
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
  }, []);

  const toggleFav = useCallback((key: string) => {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      void Storage.saveFavorites(next);
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

  const renderSourcePills = (track: Track) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
      {track.sources.map((s: TrackSource, i: number) => {
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
    </ScrollView>
  );

  const renderTrack = ({ item }: { item: Track }) => {
    const acc = accessOf(item);
    const isFav = favorites.includes(item.key);
    return (
      <TouchableOpacity style={styles.trackCard} onPress={() => startPlay(item)} onLongPress={() => setDetailTrack(item)} activeOpacity={0.75}>
        {item.cover ? <Image source={{ uri: item.cover }} style={styles.cover} /> : <View style={[styles.cover, styles.coverPh]}><Text style={styles.coverPhText}>♪</Text></View>}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
          <AccessBadge access={acc} />
          {renderSourcePills(item)}
        </View>
        <View style={styles.trackActions}>
          <TouchableOpacity onPress={() => toggleFav(item.key)} style={styles.iconBtn}>
            <Text style={[styles.iconText, { color: isFav ? '#fb7185' : COLORS.sub }]}>{isFav ? '♥' : '♡'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => addToQueue(item)} style={styles.iconBtn}>
            <Text style={styles.iconText}>+</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const currentLyricIdx = lyricIndexAt(lyrics, position);

  return (
    <View style={styles.root}>
      {/* 顶部品牌栏 */}
      <View style={styles.header}>
        <Image source={require('./assets/logo.png')} style={styles.logo} />
        <View>
          <Text style={styles.brand}>KB Music</Text>
          <Text style={styles.brandSub}>多音源免费音乐聚合</Text>
        </View>
        <View style={styles.headerSpacer} />
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
          onSubmitEditing={() => doSearch(query)}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={() => doSearch(query)}>
          {searching ? <ActivityIndicator color="#04121a" size="small" /> : <Text style={styles.searchBtnText}>搜索</Text>}
        </TouchableOpacity>
      </View>

      {/* 免费筛选 */}
      {tab === 'search' && (
        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterBtn, freeOnly && styles.filterBtnOn]} onPress={() => setFreeOnly(v => !v)}>
            <Text style={[styles.filterBtnText, freeOnly && styles.filterBtnTextOn]}>{freeOnly ? '✓ ' : ''}仅看免费完整</Text>
          </TouchableOpacity>
          <Text style={styles.filterStat}>免费 {freeCount} 首 / 共 {results.length} 首</Text>
          {progress && <Text style={styles.filterStat}>{progress.done}/{progress.total} 源</Text>}
        </View>
      )}

      {/* 内容区 */}
      {tab === 'discover' && (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>发现音乐</Text>
          <View style={styles.shelf}>
            {SHELF.map((p, i) => (
              <TouchableOpacity key={i} style={styles.shelfCard} onPress={() => { setQuery(p.q); doSearch(p.q); }} activeOpacity={0.8}>
                <View style={[styles.shelfCover, { backgroundColor: p.c2 }]}>
                  <Text style={styles.shelfIcon}>{p.icon}</Text>
                </View>
                <Text style={styles.shelfName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.shelfSub} numberOfLines={1}>{p.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
          <Text style={styles.sectionTitle}>我的资料</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>昵称（仅保存在本机）</Text>
            <TextInput style={styles.cardInput} value={nickInput} onChangeText={setNickInput} placeholder="你的昵称" placeholderTextColor={COLORS.sub} />
            <TouchableOpacity style={styles.smallBtn} onPress={saveNick}><Text style={styles.smallBtnText}>保存昵称</Text></TouchableOpacity>
            <Text style={styles.hint}>无需账号，昵称与收藏只保存在你的设备上。</Text>
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

      {/* 迷你播放条 */}
      {currentTrack && (
        <TouchableOpacity style={styles.miniPlayer} onPress={() => setPlayerOpen(true)} activeOpacity={0.9}>
          <Image source={{ uri: currentTrack.cover || (sourceAccess(currentTrack.sources[0]) ? '' : '') }} style={styles.miniCover} />
          <View style={styles.miniInfo}>
            <Text style={styles.miniTitle} numberOfLines={1}>{currentTrack.title}</Text>
            <Text style={styles.miniArtist} numberOfLines={1}>{currentTrack.artist}</Text>
          </View>
          <TouchableOpacity style={styles.miniPlay} onPress={() => void togglePlayPause()}>
            <Text style={styles.miniPlayText}>{isPlaying ? '❚❚' : '▶'}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* 底部导航 */}
      <View style={styles.tabBar}>
        {([['discover', '发现', '◈'], ['search', '搜索', '⌕'], ['library', '我的', '☺']] as const).map(([id, label, icon]) => (
          <TouchableOpacity key={id} style={styles.tabItem} onPress={() => setTab(id)}>
            <Text style={[styles.tabIcon, tab === id && styles.tabIconOn]}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === id && styles.tabLabelOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 全屏播放页 - 酷狗概念版风格 */}
      <Modal visible={playerOpen} animationType="slide" onRequestClose={() => setPlayerOpen(false)}>
        <View style={styles.playerScreen}>
          <Animated.View style={[styles.playerAura, { opacity: 0.5 }]} />
          <View style={styles.playerHeadRow}>
            <TouchableOpacity onPress={() => setPlayerOpen(false)}><Text style={styles.playerCloseText}>∨ 收起</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setVinylMode(v => !v)}>
              <Text style={styles.playerModeText}>{vinylMode ? '◉ 唱片' : '□ 简约'}</Text>
            </TouchableOpacity>
          </View>
          {currentTrack && (
            <>
              <Animated.View style={[styles.playerCoverWrap, { transform: [{ rotate: spinAngle }] }]}>
                {currentTrack.cover ? (
                  <Image source={{ uri: currentTrack.cover }} style={[styles.playerCover, vinylMode && styles.playerCoverRound]} />
                ) : (
                  <View style={[styles.playerCover, styles.playerCoverPh, vinylMode && styles.playerCoverRound]}><Text style={styles.playerCoverPhText}>♪</Text></View>
                )}
                {vinylMode && <View style={styles.vinylHole} />}
              </Animated.View>
              <View style={styles.playerMetaBox}>
                <Text style={styles.playerTitle}>{currentTrack.title}</Text>
                <Text style={styles.playerArtist}>{currentTrack.artist}</Text>
              </View>
              <View style={styles.lyricBox}>
                <ScrollView ref={ref => { if (ref && currentLyricIdx >= 0) ref.scrollTo({ y: Math.max(0, currentLyricIdx * 34 - 120), animated: true }); }}>
                  {lyrics.length ? lyrics.map((l, i) => (
                    <Text key={i} style={[styles.lyricLine, i === currentLyricIdx && styles.lyricLineOn]}>{l.text}</Text>
                  )) : <Text style={styles.lyricEmpty}>暂无歌词</Text>}
                </ScrollView>
              </View>
              <View style={styles.seekRow}>
                <Text style={styles.timeText}>{fmtTime(position)}</Text>
                <TouchableOpacity style={styles.seekBar} onPress={e => {
                  const x = e.nativeEvent.locationX;
                  seekTo((x / width) * (duration || 0)).catch(() => undefined);
                }}>
                  <View style={[styles.seekFill, { width: `${duration ? (position / duration) * 100 : 0}%` }]} />
                </TouchableOpacity>
                <Text style={styles.timeText}>{fmtTime(duration)}</Text>
              </View>
              <View style={styles.playerControls}>
                <TouchableOpacity style={styles.ctrlBtn} onPress={() => toggleFav(currentTrack.key)}>
                  <Text style={[styles.ctrlSide, favorites.includes(currentTrack.key) && styles.actionIconOn]}>{favorites.includes(currentTrack.key) ? '♥' : '♡'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bigPlay} onPress={() => void togglePlayPause()}>
                  <Text style={styles.bigPlayText}>{isPlaying ? '❚❚' : '▶'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ctrlBtn} onPress={() => setDetailTrack(currentTrack)}>
                  <Text style={styles.ctrlSide}>ⓘ</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.playerActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => toggleFav(currentTrack.key)}>
                  <Text style={[styles.actionIcon, favorites.includes(currentTrack.key) && styles.actionIconOn]}>{favorites.includes(currentTrack.key) ? '♥' : '♡'}</Text>
                  <Text style={styles.actionLabel}>喜欢</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setDetailTrack(currentTrack)}>
                  <Text style={styles.actionIcon}>ⓘ</Text><Text style={styles.actionLabel}>音源</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setPlayerOpen(false)}>
                  <Text style={styles.actionIcon}>☰</Text><Text style={styles.actionLabel}>队列</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 44, paddingBottom: 12, gap: 10 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  brand: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  brandSub: { color: COLORS.sub, fontSize: 11 },
  headerSpacer: { flex: 1 },
  codeChip: { backgroundColor: COLORS.panel2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  codeChipText: { color: COLORS.accent, fontSize: 11 },
  searchBar: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, backgroundColor: COLORS.panel, borderRadius: 12, paddingHorizontal: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, fontSize: 14 },
  searchBtn: { backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  searchBtnText: { color: '#04121a', fontWeight: '700', fontSize: 14 },
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
  trackCard: { flexDirection: 'row', padding: 10, backgroundColor: COLORS.panel, borderRadius: 12, marginBottom: 8, gap: 10 },
  cover: { width: 56, height: 56, borderRadius: 8 },
  coverPh: { backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center' },
  coverPhText: { color: COLORS.sub, fontSize: 24 },
  trackInfo: { flex: 1, justifyContent: 'center' },
  trackTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  trackArtist: { color: COLORS.sub, fontSize: 12, marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  pillsRow: { marginTop: 6 },
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
  miniPlayer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.panel2, marginHorizontal: 8, marginBottom: 4, borderRadius: 10, padding: 8, gap: 10 },
  miniCover: { width: 40, height: 40, borderRadius: 6 },
  miniInfo: { flex: 1 },
  miniTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  miniArtist: { color: COLORS.sub, fontSize: 11 },
  miniPlay: { padding: 8 },
  miniPlayText: { color: COLORS.accent, fontSize: 18 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 8 },
  tabItem: { flex: 1, alignItems: 'center' },
  tabIcon: { fontSize: 20, color: COLORS.sub },
  tabIconOn: { color: COLORS.accent },
  tabLabel: { color: COLORS.sub, fontSize: 11, marginTop: 2 },
  tabLabelOn: { color: COLORS.accent },
  playerScreen: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 20, paddingTop: 50 },
  playerClose: { alignSelf: 'flex-start', marginBottom: 30 },
  playerCloseText: { color: COLORS.sub, fontSize: 15 },
  playerTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  playerArtist: { color: COLORS.sub, fontSize: 14, textAlign: 'center', marginTop: 6 },
  lyricBox: { flex: 1, marginVertical: 20 },
  lyricLine: { color: COLORS.sub, fontSize: 15, textAlign: 'center', paddingVertical: 8 },
  lyricLineOn: { color: COLORS.accent, fontSize: 18, fontWeight: '700' },
  lyricEmpty: { color: COLORS.sub, textAlign: 'center', marginTop: 40 },
  seekRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeText: { color: COLORS.sub, fontSize: 11, width: 38 },
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
  playerModeText: { color: COLORS.sub, fontSize: 12 },
  playerCoverWrap: { width: 260, height: 260, alignSelf: 'center', marginTop: 8, marginBottom: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 130, borderWidth: 6, borderColor: '#12121e' },
  playerCover: { width: 232, height: 232 },
  playerCoverRound: { borderRadius: 116 },
  playerCoverPh: { backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center' },
  playerCoverPhText: { color: COLORS.accent, fontSize: 80 },
  vinylHole: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: '#0a0a14', borderWidth: 3, borderColor: '#2a2a44' },
  playerMetaBox: { alignItems: 'center', marginBottom: 14 },
  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 16 },
  ctrlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.panel2, justifyContent: 'center', alignItems: 'center' },
  ctrlSide: { color: COLORS.sub, fontSize: 18 },
  playerActions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionIcon: { color: COLORS.sub, fontSize: 22 },
  actionIconOn: { color: '#fb7185' },
  actionLabel: { color: COLORS.sub, fontSize: 11 }
});

export default App;
