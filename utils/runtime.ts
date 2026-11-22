import fs from 'fs';
import path from 'path';

/** Data produced by global-setup.ts (ids of the team, users and channels on the live server). */
export interface RuntimeUser { id: string; username: string; password: string }
export interface Runtime {
  serverVersion: string;
  baseUrl: string;
  teamId: string;
  teamName: string;
  maxFileSize: number;
  passwordMinLength: number;
  users: { alice: RuntimeUser; bob: RuntimeUser; eve: RuntimeUser };
  channels: {
    scratch: { id: string; name: string; display_name: string };
    private: { id: string; name: string; display_name: string };
  };
}

export const RUNTIME_FILE = path.join(__dirname, '..', '.runtime', 'runtime.json');

let cached: Runtime | undefined;
export function rt(): Runtime {
  if (!cached) cached = JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf-8')) as Runtime;
  return cached;
}
