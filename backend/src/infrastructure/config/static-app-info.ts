import type { AppInfoProvider } from '../../application/health/get-liveness/ports.js';

export class StaticAppInfo implements AppInfoProvider {
  constructor(private readonly appVersion: string) {}
  version(): string {
    return this.appVersion;
  }
}
