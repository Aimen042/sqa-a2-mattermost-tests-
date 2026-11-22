import { request, APIRequestContext, APIResponse } from '@playwright/test';
import { BASE_URL } from './env';

/**
 * Thin wrapper around the Mattermost REST API v4 (https://api.mattermost.com).
 * Used for test setup, for API-level assertions, and for cross-checking UI results.
 */
export class MM {
  private constructor(public readonly ctx: APIRequestContext, public readonly token?: string) {}

  /** Request context with no session (used for negative / security checks). */
  static async anonymous(extraHeaders: Record<string, string> = {}): Promise<MM> {
    return new MM(await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: extraHeaders }));
  }

  /** Raw login call - returns the response so tests can assert on failures. */
  static async loginRaw(loginId: string, password: string): Promise<APIResponse> {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/v4/users/login', { data: { login_id: loginId, password } });
    await res.body(); // read before dispose
    await ctx.dispose();
    return res;
  }

  /** Logs in and returns an authenticated client (Bearer token). Throws if login fails. */
  static async login(loginId: string, password: string): Promise<MM> {
    const ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await ctx.post('/api/v4/users/login', { data: { login_id: loginId, password } });
    if (!res.ok()) {
      const body = await res.text();
      await ctx.dispose();
      throw new Error(`API login failed for "${loginId}": HTTP ${res.status()} ${body}`);
    }
    const token = res.headers()['token'];
    await ctx.dispose();
    const authed = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'X-Requested-With': 'XMLHttpRequest' },
    });
    return new MM(authed, token);
  }

  get(path: string) { return this.ctx.get(path); }
  post(path: string, data?: unknown) { return this.ctx.post(path, { data }); }
  put(path: string, data?: unknown) { return this.ctx.put(path, { data }); }

  // ---- convenience calls -------------------------------------------------
  async me(): Promise<any> { return (await this.get('/api/v4/users/me')).json(); }

  createChannel(teamId: string, name: string, displayName: string, type: 'O' | 'P' = 'O') {
    return this.post('/api/v4/channels', { team_id: teamId, name, display_name: displayName, type });
  }

  async channelByName(teamId: string, name: string): Promise<any> {
    const res = await this.get(`/api/v4/teams/${teamId}/channels/name/${name}`);
    return res.ok() ? res.json() : null;
  }

  addChannelMember(channelId: string, userId: string) {
    return this.post(`/api/v4/channels/${channelId}/members`, { user_id: userId });
  }

  removeChannelMember(channelId: string, userId: string) {
    return this.ctx.delete(`/api/v4/channels/${channelId}/members/${userId}`);
  }

  createPost(channelId: string, message: string, fileIds: string[] = [], rootId = '') {
    return this.post('/api/v4/posts', { channel_id: channelId, message, file_ids: fileIds, root_id: rootId });
  }

  /** Self sign-up (no session) - used by FR-06 registration tests. */
  signUp(email: string, username: string, password: string) {
    return this.post('/api/v4/users', { email, username, password });
  }

  search(teamId: string, terms: string) {
    return this.post(`/api/v4/teams/${teamId}/posts/search`, { terms, is_or_search: false });
  }

  /** Simple (non-multipart) upload: Content-Length equals the exact file size, which makes BVA precise. */
  uploadFileRaw(channelId: string, filename: string, content: Buffer) {
    return this.ctx.post(
      `/api/v4/files?channel_id=${channelId}&filename=${encodeURIComponent(filename)}`,
      { data: content, headers: { 'Content-Type': 'application/octet-stream' } },
    );
  }

  async clientConfig(): Promise<Record<string, string>> {
    return (await this.get('/api/v4/config/client?format=old')).json();
  }

  dispose() { return this.ctx.dispose(); }
}

/** Unique, lowercase, URL-safe id for channel names etc. */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Unique alphanumeric keyword for search tests (no separators, so the search engine treats it as one token). */
export function keyword(prefix = 'qakw'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
