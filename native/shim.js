// 네이티브 앱(안드로이드/iOS)에서만 동작하는 기능 모음.
// `npm run build:native` 로 www/js/native.js 에 묶인다. 웹/PWA에서는 isNative=false 로 조용히 지나간다.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
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
async function saveFile(blob, filename) {
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
}

if (isNative) {
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); // 갈색 상단바 위에 흰 글씨
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
