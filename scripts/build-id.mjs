// The short commit SHA baked into the build (shown on the setup screen).
// Order: Cloudflare Workers Builds' WORKERS_CI_COMMIT_SHA (a full SHA, set by
// default in every build), then the local git checkout, then "dev".
import { execSync } from 'node:child_process';

export function buildId() {
  const ci = process.env.WORKERS_CI_COMMIT_SHA?.trim();
  if (ci) return ci.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}
