/** Comprobación de una dependencia (BD). Debe resolver en ≤ timeout y nunca lanzar. */
export interface DependencyCheck {
  readonly name: string;
  check(): Promise<boolean>;
}
