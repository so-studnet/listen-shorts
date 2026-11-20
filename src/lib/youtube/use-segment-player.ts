"use client";
/**
 * 埋め込みプレーヤーで区間（start〜end 秒）だけを再生するフック。
 * 区間の終わりは 100ms ごとに再生位置を見て止める（PLAYBACK_TAIL_PADDING だけ余白を足す）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PLAYBACK_TAIL_PADDING } from "@/lib/domain/constants";
import { describePlayerError, loadYouTubeApi, type YTPlayer } from "./api";

const POLL_MS = 100;

export type SegmentPlayer = {
  /** プレーヤーの準備ができたか */
  ready: boolean;
  /** 区間を再生中か */
  playing: boolean;
  /** 再生できないときの説明 */
  error: string | null;
  /** 区間を再生する。必ずタップなどの操作の中から呼ぶ（iPhone の制限） */
  playSegment: (start: number, end: number) => void;
  stop: () => void;
};

export function useSegmentPlayer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  videoId: string,
  initialStart: number,
  onSegmentEnd?: () => void,
): SegmentPlayer {
  const playerRef = useRef<YTPlayer | null>(null);
  const segmentRef = useRef<{ start: number; end: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEndRef = useRef(onSegmentEnd);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onEndRef.current = onSegmentEnd;
  }, [onSegmentEnd]);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const finish = useCallback((notify: boolean) => {
    clearTimer();
    segmentRef.current = null;
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // プレーヤーが壊れていても止める操作は失敗してよい
    }
    setPlaying(false);
    if (notify) onEndRef.current?.();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    // YT.Player は渡した要素を iframe に置き換えるので、中に子要素を作って渡す
    const mount = document.createElement("div");
    el.appendChild(mount);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        playerRef.current = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            cc_load_policy: 0,
            controls: 0,
            disablekb: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            start: Math.floor(initialStart),
          },
          events: {
            onReady: () => !cancelled && setReady(true),
            onError: (e) => {
              if (cancelled) return;
              setError(describePlayerError(e.data));
              finish(false);
            },
            onStateChange: (e) => {
              const seg = segmentRef.current;
              if (!seg || cancelled) return;
              if (e.data === YT.PlayerState.PLAYING) {
                // iPhone では最初の再生の前の seekTo が効かないことがあるので、再生が始まったら位置を確かめる
                const t = e.target.getCurrentTime();
                if (t < seg.start - 0.5 || t > seg.end) e.target.seekTo(seg.start, true);
              } else if (e.data === YT.PlayerState.ENDED) {
                finish(true);
              }
            },
          },
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      clearTimer();
      try {
        playerRef.current?.destroy();
      } catch {
        // すでに壊れていてもよい
      }
      playerRef.current = null;
      el.innerHTML = "";
      setReady(false);
      setPlaying(false);
    };
    // videoId が変わったら作り直す。initialStart は最初の位置だけに使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, videoId, finish]);

  const playSegment = useCallback(
    (start: number, end: number) => {
      const p = playerRef.current;
      if (!p) return;
      clearTimer();
      segmentRef.current = { start, end };
      p.seekTo(start, true);
      p.playVideo();
      setPlaying(true);
      timerRef.current = setInterval(() => {
        const seg = segmentRef.current;
        if (!seg) return;
        let t = 0;
        try {
          t = p.getCurrentTime();
        } catch {
          return;
        }
        if (t >= seg.end + PLAYBACK_TAIL_PADDING) finish(true);
      }, POLL_MS);
    },
    [finish],
  );

  const stop = useCallback(() => finish(false), [finish]);

  return { ready, playing, error, playSegment, stop };
}
