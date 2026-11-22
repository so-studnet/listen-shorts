/**
 * 画面のテスト用の偽の Supabase。ブラウザからの通信を横取りして、メモリ上の表で応える。
 * 1つの「サーバー」を複数のブラウザ（端末）で共有できる。
 */
import type { BrowserContext, Route } from "@playwright/test";

export const FAKE_URL = "https://test-project.supabase.co";
export const USER = { id: "11111111-1111-1111-1111-111111111111", email: "so@example.com" };
export const PASSWORD = "correct-horse";

type Row = Record<string, unknown>;

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  /** 次の書き込みを 500 で失敗させる回数 */
  failWrites = 0;
  requests: string[] = [];

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  async attach(ctx: BrowserContext) {
    await ctx.route(`${FAKE_URL}/**`, (route) => this.handle(route));
    // Realtime（WebSocket）はつながないでおく
    await ctx.routeWebSocket(/realtime/, (ws) => ws.close());
  }

  private json(route: Route, status: number, body: unknown) {
    return route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "x-supabase-api-version": "2024-01-01" },
      body: body === undefined ? "" : JSON.stringify(body),
    });
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "OPTIONS")
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        },
      });
    this.requests.push(`${method} ${url.pathname}`);

    if (url.pathname === "/auth/v1/token") {
      const body = req.postDataJSON() as { email?: string; password?: string };
      if (body.email !== USER.email || body.password !== PASSWORD)
        return this.json(route, 400, {
          code: "invalid_credentials",
          error_code: "invalid_credentials",
          msg: "Invalid login credentials",
        });
      const now = Math.floor(Date.now() / 1000);
      return this.json(route, 200, {
        access_token: "fake-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "fake-refresh-token",
        user: { id: USER.id, email: USER.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" },
      });
    }
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    if (url.pathname === "/auth/v1/user")
      return this.json(route, 200, { id: USER.id, email: USER.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} });

    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m) return this.json(route, 404, { message: "not found" });
    const table = m[1];

    if (method === "GET") {
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      const rows = [...this.rows(table)].sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
      return this.json(route, 200, rows.slice(offset, offset + limit));
    }
    if (this.failWrites > 0) {
      this.failWrites--;
      return this.json(route, 500, { message: "server error" });
    }
    if (method === "POST") {
      const body = req.postDataJSON() as Row | Row[];
      const list = Array.isArray(body) ? body : [body];
      const key = (r: Row) => (table === "ls_progress" ? String(r.user_id) : String(r.id));
      for (const r of list) {
        if (r.user_id !== USER.id) return this.json(route, 403, { message: "RLS" });
        this.tables[table] = [...this.rows(table).filter((x) => key(x) !== key(r)), r];
      }
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" } });
    }
    if (method === "DELETE") {
      const raw = url.searchParams.get("id") ?? "";
      const ids = raw.replace(/^in\.\(/, "").replace(/\)$/, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      this.tables[table] = this.rows(table).filter((x) => !ids.includes(String(x.id)));
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    return this.json(route, 405, { message: "method" });
  }
}
