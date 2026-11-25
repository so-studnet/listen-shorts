/**
 * 途中で閉じたクイズの、この端末への保存（1つだけ）。
 * 端末間では同期しない（解いている途中の状態は、その端末だけのもの）。
 */
import { parseSaved, type SavedQuiz } from "@/lib/domain/resume";

export const RESUME_KEY = "listen-shorts:v1:resume";

export function readResume(): SavedQuiz | null {
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    return raw ? parseSaved(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeResume(saved: SavedQuiz): void {
  try {
    window.localStorage.setItem(RESUME_KEY, JSON.stringify(saved));
  } catch {
    // 保存できなくても解くのは続けられる（閉じたら最初からになるだけ）
  }
}

export function clearResume(): void {
  try {
    window.localStorage.removeItem(RESUME_KEY);
  } catch {
    // 消せなくてもよい
  }
}
