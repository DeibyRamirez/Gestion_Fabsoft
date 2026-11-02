/** Puerto: metadatos de la aplicación (versión desplegada). Implementado en infrastructure. */
export interface AppInfoProvider {
  version(): string;
}
