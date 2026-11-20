/**
 * YouTube IFrame Player API の読み込みと、使う部分だけの型。
 * https://developers.google.com/youtube/iframe_api_reference
 */

export type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
};

export type YTPlayerOptions = {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number }) => void;
  };
};

export type YTNamespace = {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const IFRAME_API_URL = "https://www.youtube.com/iframe_api";

let loading: Promise<YTNamespace> | null = null;

/** IFrame API のスクリプトを1回だけ読み込む。 */
export function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = IFRAME_API_URL;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error("YouTube のプレーヤーを読み込めませんでした"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** onError のコードを日本語の説明にする。 */
export function describePlayerError(code: number): string {
  switch (code) {
    case 2:
      return "動画 ID が正しくありません";
    case 5:
      return "この端末では再生できない動画です";
    case 100:
      return "動画が見つかりません（削除・非公開の可能性）";
    case 101:
    case 150:
      return "この動画は埋め込みでの再生が許可されていません";
    default:
      return `再生できません（エラー ${code}）`;
  }
}
