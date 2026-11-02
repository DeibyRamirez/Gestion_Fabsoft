import {
  UserCreateSchema,
  UserListQuerySchema,
  UserUpdateSchema,
  type UserDto,
  type UserPage,
} from '@fabsoft/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { CreateUser } from '../../../../application/users/create-user/use-case.js';
import type { GetUser } from '../../../../application/users/get-user/use-case.js';
import type { ListUsers } from '../../../../application/users/list-users/use-case.js';
import type { ResetUserPassword } from '../../../../application/users/reset-user-password/use-case.js';
import type { UserView } from '../../../../application/users/shared/user-view.js';
import type { UpdateUser } from '../../../../application/users/update-user/use-case.js';
import { actorOf, requireRole } from '../../middlewares/authenticate.js';

export interface UsersRouteDeps {
  listUsers: ListUsers;
  getUser: GetUser;
  createUser: CreateUser;
  updateUser: UpdateUser;
  resetUserPassword: ResetUserPassword;
}

const IdSchema = z.string().uuid();

export const toUserDto = (u: UserView): UserDto => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  clientId: u.clientId,
  status: u.status,
  mustChangePassword: u.mustChangePassword,
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
  updatedAt: u.updatedAt.toISOString(),
});

/** /users: sólo admin (permissions-matrix). `authenticate` y password-change se aplican en app.ts. */
export function usersRouter(
  deps: UsersRouteDeps,
  guards: RequestHandler[],
  createIdempotency: RequestHandler,
): Router {
  const router = Router();
  router.use('/users', ...guards, requireRole('admin'));

  router.get('/users', async (req, res) => {
    const query = UserListQuerySchema.parse(req.query);
    const r = await deps.listUsers.execute(actorOf(res), query);
    const body: UserPage = {
      data: r.items.map(toUserDto),
      meta: {
        page: r.page,
        pageSize: r.pageSize,
        total: r.total,
        totalPages: Math.ceil(r.total / r.pageSize),
      },
    };
    res.json(body);
  });
  router.post('/users', createIdempotency, async (req, res) => {
    const { user, temporaryPassword } = await deps.createUser.execute(
      actorOf(res),
      UserCreateSchema.parse(req.body),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ ...toUserDto(user), temporaryPassword });
  });
  router.get('/users/:id', async (req, res) => {
    res.json(toUserDto(await deps.getUser.execute(actorOf(res), IdSchema.parse(req.params.id))));
  });
  router.patch('/users/:id', async (req, res) => {
    const user = await deps.updateUser.execute(
      actorOf(res),
      IdSchema.parse(req.params.id),
      UserUpdateSchema.parse(req.body),
    );
    res.json(toUserDto(user));
  });
  router.post('/users/:id/reset-password', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await deps.resetUserPassword.execute(actorOf(res), IdSchema.parse(req.params.id)));
  });
  return router;
}
