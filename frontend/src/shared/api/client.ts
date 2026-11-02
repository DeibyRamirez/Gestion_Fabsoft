import {
  API_VERSION_PREFIX,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  ProblemSchema,
  type Problem,
} from '@fabsoft/shared';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? `http://localhost:4000${API_VERSION_PREFIX}`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
  }
}

/** fetch a /api/v1 con access token en memoria; el refresh viaja en cookie HttpOnly. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      [CSRF_HEADER]: CSRF_HEADER_VALUE,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ProblemSchema.safeParse(body);
    throw new ApiError(res.status, parsed.success ? parsed.data : null);
  }
  return body as T;
}
