import { CreateUser } from '../../application/users/create-user/use-case.js';
import { GetUser } from '../../application/users/get-user/use-case.js';
import { ListUsers } from '../../application/users/list-users/use-case.js';
import { ResetUserPassword } from '../../application/users/reset-user-password/use-case.js';
import { UpdateUser } from '../../application/users/update-user/use-case.js';
import type { Infra } from '../infra.js';

export function usersModule(infra: Infra) {
  return {
    listUsers: new ListUsers(infra.userUow),
    getUser: new GetUser(infra.userUow),
    createUser: new CreateUser(infra.userUow, infra.hasher, infra.passwords),
    updateUser: new UpdateUser(infra.userUow),
    resetUserPassword: new ResetUserPassword(infra.userUow, infra.hasher, infra.passwords),
  };
}
