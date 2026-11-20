import type { RequestHandler, Response } from 'express';
import type { Scope } from '@fabsoft/shared';
import type { Role } from '../../../domain/users/role.js';
import type { Actor, IntegrationActor, UserActor } from '../../../application/shared/actor.js';
import type { AuthenticateAccessToken } from '../../../application/auth/authenticate/use-case.js';
import type { AuthenticateApiKey } from '../../../application/integrations/authenticate-api-key/use-case.js';
import { sendProblem } from '../problem.js';

export const actorOf = (res: Response): UserActor => res.locals['actor'] as UserActor;
export const integrationActorOf = (res: Response): IntegrationActor =>
  res.locals['integrationActor'] as IntegrationActor;
export const requestActorOf = (res: Response): Actor =>
  (res.locals['actor'] as UserActor | undefined) ?? integrationActorOf(res);

/** Bearer JWT. Ambas credenciales ⇒ 400 ambiguous_credentials (ADR-001). */
export function authenticate(useCase: AuthenticateAccessToken): RequestHandler {
  return async (req, res, next) => {
    const auth = req.header('authorization');
    const apiKey = req.header('x-api-key');
    if (auth && apiKey) return sendProblem(res, 'ambiguous_credentials', 'Use sólo una credencial');
    if (!auth?.startsWith('Bearer '))
      return sendProblem(res, 'unauthenticated', 'Falta el token de acceso');
    const clientRequestId =
      typeof res.locals['clientRequestId'] === 'string' ? res.locals['clientRequestId'] : undefined;
    const result = await useCase.execute(
      auth.slice(7).trim(),
      String(res.locals['requestId']),
      clientRequestId,
    );
    res.locals['actor'] = result.actor;
    res.locals['mustChangePassword'] = result.mustChangePassword;
    next();
  };
}

/** Con contraseña temporal sólo se permiten /auth/me, /auth/change-password y /auth/logout. */
export const requirePasswordChanged: RequestHandler = (_req, res, next) => {
  if (res.locals['mustChangePassword'] === true) {
    return sendProblem(res, 'password_change_required', 'Debe cambiar su contraseña');
  }
  next();
};

/** Guarda de rol por ruta (primer nivel de la matriz de permisos). */
export function requireRole(...roles: Role[]): RequestHandler {
  return (_req, res, next) => {
    if (!roles.includes(actorOf(res).role))
      return sendProblem(res, 'forbidden', 'Permiso insuficiente');
    next();
  };
}

/** API key de integración (`X-Api-Key`), RN-12/ADR-001. Nunca se mezcla con Bearer. */
export function authenticateApiKey(useCase: AuthenticateApiKey): RequestHandler {
  return async (req, res, next) => {
    const apiKey = req.header('x-api-key');
    if (!apiKey) return sendProblem(res, 'unauthenticated', 'Falta la API key');
    if (req.header('authorization')) {
      return sendProblem(res, 'ambiguous_credentials', 'Use sólo una credencial');
    }
    const clientRequestId =
      typeof res.locals['clientRequestId'] === 'string' ? res.locals['clientRequestId'] : undefined;
    try {
      const actor = await useCase.execute(
        apiKey,
        String(res.locals['requestId']),
        clientRequestId,
        req.ip ?? null,
      );
      res.locals['integrationActor'] = actor;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Exige un scope del manifest para la integración autenticada. */
export function requireScope(scope: Scope): RequestHandler {
  return (_req, res, next) => {
    if (!integrationActorOf(res).scopes.includes(scope)) {
      return sendProblem(res, 'insufficient_scope', 'La integración no tiene el scope requerido');
    }
    next();
  };
}
