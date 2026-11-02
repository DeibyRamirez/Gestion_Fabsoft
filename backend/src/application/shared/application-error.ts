import type { ProblemCode } from '@fabsoft/shared';

/** Error de aplicación con código del contrato; interfaces/http lo traduce a problem+json. */
export class ApplicationError extends Error {
  constructor(
    readonly code: ProblemCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
