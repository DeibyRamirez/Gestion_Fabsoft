import { AuthenticateAccessToken } from '../../application/auth/authenticate/use-case.js';
import { ChangePassword } from '../../application/auth/change-password/use-case.js';
import { GetMe } from '../../application/auth/get-me/use-case.js';
import { Login } from '../../application/auth/login/use-case.js';
import { Logout } from '../../application/auth/logout/use-case.js';
import { RefreshSession } from '../../application/auth/refresh-session/use-case.js';
import { SessionIssuer } from '../../application/auth/session-issuer.js';
import type { Infra } from '../infra.js';

export function authModule(infra: Infra) {
  const issuer = new SessionIssuer(infra.tokens, infra.refreshTokens, infra.ids, infra.clock, {
    refreshTokenTtlDays: infra.refreshTokenTtlDays,
  });
  return {
    login: new Login(infra.authUow, infra.hasher, issuer, infra.ids, infra.clock, infra.dummyHash),
    refreshSession: new RefreshSession(infra.authUow, infra.refreshTokens, issuer, infra.clock),
    logout: new Logout(infra.authUow, infra.refreshTokens, infra.clock),
    getMe: new GetMe(infra.userUow),
    changePassword: new ChangePassword(
      infra.userUow,
      infra.hasher,
      infra.refreshTokens,
      infra.clock,
    ),
    authenticateAccessToken: new AuthenticateAccessToken(infra.authUow, infra.tokens),
  };
}
