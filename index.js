import { AppRegistry } from 'react-native';
import App from './App';

// 后台播放服务注册
import { registerPlaybackService } from './src/player';
import TrackPlayer from 'react-native-track-player';

TrackPlayer.registerPlaybackService(() => async () => {
  registerPlaybackService();
});

AppRegistry.registerComponent('KBMusic', () => App);
