export interface CleanupResult {
  idempotencyKeys: number;
  refreshTokens: number;
}

export interface MaintenanceRepository {
  cleanup(now: Date, refreshTokenCutoff: Date): Promise<CleanupResult>;
}

export interface MaintenanceRepos {
  maintenance: MaintenanceRepository;
}
