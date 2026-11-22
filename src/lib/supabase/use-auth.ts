"use client";
import { useSyncExternalStore } from "react";
import {
  getAuthState,
  getServerAuthState,
  subscribeAuth,
  type AuthState,
} from "./auth";

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
}
