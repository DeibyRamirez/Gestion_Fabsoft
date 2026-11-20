# Contrato OpenAPI

- **Fuente canónica:** [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1).
- **Artefacto generado:** [`openapi.json`](./openapi.json), consumido por la documentación navegable. No editar a mano.
- **UI interactiva:** `GET /api/v1/docs` (Swagger UI) y `GET /api/v1/docs/openapi.json`.
- **Autenticación:** la UI es pública; las operaciones protegidas exigen `Authorization: Bearer` o `X-Api-Key` (ver `info.description`).

## Comandos

```bash
pnpm openapi:build   # regenera docs/api/openapi.json desde el YAML
pnpm openapi:check   # falla si el JSON versionado está desactualizado (CI)
npx --yes @redocly/cli lint docs/api/openapi.yaml
```

## Cobertura y convenciones

- `backend/tests/helpers/openapi-coverage.test.ts` reconstruye las rutas reales de Express y falla si una ruta implementada no está documentada o si una operación vigente no existe.
- `backend/tests/helpers/openapi-json.test.ts` compara el JSON con el YAML.
- Las operaciones planificadas que todavía no expone la API llevan `x-implementation-status: pending` y se excluyen de la cobertura; al implementarlas, quitar la extensión y actualizar el listado del test.
- Los tests de API validan respuestas contra el esquema de cada operación con `expectMatchesOperation(res, operationId)`.

## Servir la especificación en otros entornos

La API busca `docs/api/openapi.json` en la raíz del repo o junto al proceso. Si el despliegue no incluye `docs/`, definir `OPENAPI_SPEC_PATH` con la ruta absoluta al JSON; si no se encuentra, `/api/v1/docs` responde `503 dependency_unavailable`.
