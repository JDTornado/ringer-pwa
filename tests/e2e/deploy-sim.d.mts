export type Version = 'v1' | 'v2';

/** Build v1 and v2 of the app under `baseDir`; returns their directories. */
export function buildVersions(baseDir: string): Record<Version, string>;

export interface DeployServer {
  url: string;
  /** Switch the served version (a "deploy"). */
  use(version: Version): void;
  close(): Promise<void>;
}

export function startServer(dirs: Record<Version, string>, initial?: Version): Promise<DeployServer>;
