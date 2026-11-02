import {
  ChangePasswordInputSchema,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
  LoginInputSchema,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  type TokenResponse,
} from '@fabsoft/shared';
import {
  Router,
  type CookieOptions,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { AuthenticateAccessToken } from '../../../../application/auth/authenticate/use-case.js';
import type { ChangePassword } from '../../../../application/auth/change-password/use-case.js';
import { toMe, type GetMe } from '../../../../application/auth/get-me/use-case.js';
import type { Login } from '../../../../application/auth/login/use-case.js';
import type { Logout } from '../../../../application/auth/logout/use-case.js';
import type { SessionResult } from '../../../../application/auth/ports.js';
import type { RefreshSession } from '../../../../application/auth/refresh-session/use-case.js';
import { actorOf, authenticate } from '../../middlewares/authenticate.js';
import { sendProblem } from '../../problem.js';

export interface AuthRouteDeps {
  login: Login;
  refreshSession: RefreshSession;
  logout: Logout;
  getMe: GetMe;
  changePassword: ChangePassword;
  authenticateAccessToken: AuthenticateAccessToken;
  cookie: { secure: boolean; domain?: string | undefined };
  loginRateLimit: RequestHandler[];
}

const meta = (req: Request, res: Response) => ({
  requestId: String(res.locals['requestId']),
  userAgent: req.header('user-agent') ?? null,
  ip: req.ip ?? null,
});

export function authRouter(deps: AuthRouteDeps): Router {
  const router = Router();
  const cookieOptions = (expires?: Date): CookieOptions => ({
    httpOnly: true,
    secure: deps.cookie.secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(deps.cookie.domain ? { domain: deps.cookie.domain } : {}),
    ...(expires ? { expires } : {}),
  });
  const sendSession = (res: Response, s: SessionResult) => {
    res.cookie(REFRESH_COOKIE_NAME, s.refreshToken, cookieOptions(s.refreshExpiresAt));
    res.setHeader('Cache-Control', 'no-store');
    const body: TokenResponse = {
      accessToken: s.accessToken,
      tokenType: 'Bearer',
      expiresIn: s.expiresIn,
      user: toMe(s.user),
    };
    res.status(200).json(body);
  };
  const csrf: RequestHandler = (req, res, next) =>
    req.header(CSRF_HEADER) === CSRF_HEADER_VALUE
      ? next()
      : sendProblem(res, 'forbidden', `Falta ${CSRF_HEADER}`);
  const refreshCookie = (req: Request): string | undefined =>
    (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];

  router.post('/login', ...deps.loginRateLimit, async (req, res) => {
    sendSession(res, await deps.login.execute(LoginInputSchema.parse(req.body), meta(req, res)));
  });
  router.post('/refresh', csrf, async (req, res) => {
    try {
      sendSession(res, await deps.refreshSession.execute(refreshCookie(req), meta(req, res)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
      throw err;
    }
  });
  router.post('/logout', async (req, res) => {
    await deps.logout.execute(refreshCookie(req), String(res.locals['requestId']));
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
    res.status(204).end();
  });
  router.get('/me', authenticate(deps.authenticateAccessToken), async (_req, res) => {
    res.json(await deps.getMe.execute(actorOf(res)));
  });
  router.post('/change-password', authenticate(deps.authenticateAccessToken), async (req, res) => {
    await deps.changePassword.execute(
      actorOf(res),
      ChangePasswordInputSchema.parse(req.body),
      refreshCookie(req),
    );
    res.status(204).end();
  });
  return router;
}
