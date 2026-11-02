/** Error de regla de negocio. `code` coincide con `Problem.code` del contrato. */
export type DomainErrorCode = 'validation_error' | 'invalid_state_transition';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: ReadonlyArray<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
