export interface IdempotencyPurgeRepository {
  purgeExpired(now: Date): Promise<number>;
}
