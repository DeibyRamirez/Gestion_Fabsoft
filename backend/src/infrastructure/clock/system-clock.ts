import { randomUUID } from 'node:crypto';
import type { Clock, IdGenerator } from '../../application/shared/ports.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class CryptoIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
}
