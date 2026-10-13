// 네이티브 앱(안드로이드/iOS)에서만 동작하는 기능 모음.
// `npm run build:native` 로 www/js/native.js 에 묶인다. 웹/PWA에서는 isNative=false 로 조용히 지나간다.
import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// 파일을 기기에 저장해 두고, 공유 창(카카오톡·메일·파일에 저장 등)을 연다
let busy = false;
async function saveFile(blob, filename) {
  if (busy) return { shared: false, savedWhere: null, busy: true }; // 연타 방지: 공유 창이 이미 열리는 중
  busy = true;
  try {
    const data = await blobToBase64(blob);
    let savedWhere = null;
    try {
      // iOS: 앱 문서 폴더(파일 앱에서 보임) / 안드로이드: 공용 Documents/축의대 폴더
      const path = platform === 'ios' ? filename : '축의대/' + filename;
      await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
      savedWhere = platform === 'ios' ? '파일 앱 > 나의 iPhone > 축의대' : '내 파일 > Documents > 축의대';
    } catch (_) {
      // 안드로이드 10 이하 등 공용 폴더에 쓸 수 없는 기기에서는 공유 창만 연다
    }
    const tmp = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    let shared = false;
    try {
      await Share.share({ title: filename, files: [tmp.uri] });
      shared = true;
    } catch (err) {
      if (!/cancel/i.test(String(err && err.message))) throw err;
    }
    return { shared, savedWhere };
  } finally {
    busy = false;
  }
}

if (isNative) {
  // 상태바 글씨: 갈색 헤더 뒤로 들어가면 흰색. 구형 안드로이드 WebView(140 미만)는 헤더 위에 밝은 띠가
  // 생기므로 검은색. 하단 내비게이션 바는 capacitor.config.json 의 SystemBars.style(LIGHT) 그대로 검은색.
  const chromeMajor = Number((navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || 0);
  const overlaysHeader = platform === 'ios' || chromeMajor >= 140;
  SystemBars.setStyle({ style: overlaysHeader ? SystemBarsStyle.Dark : SystemBarsStyle.Light, bar: SystemBarType.StatusBar }).catch(() => {});
  window.addEventListener('load', () => { SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}); });

  if (platform === 'android') {
    // 뒤로 가기: 열린 창 닫기 → 앱 안에서 한 단계 뒤로 → 첫 화면이면 앱을 닫지 않고 뒤로 보낸다
    App.addListener('backButton', () => {
      const dlg = document.querySelector('dialog[open]');
      if (dlg) { dlg.close(); return; }
      if (history.state) { history.back(); return; }
      App.minimizeApp();
    });
  }
}

window.Native = { isNative, platform, saveFile, getInfo: () => App.getInfo() };
