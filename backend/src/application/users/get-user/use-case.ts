import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import { requireRole } from '../../shared/authorizer.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { UserView } from '../shared/user-view.js';
import type { GetUserRepos } from './ports.js';

export class GetUser {
  constructor(private readonly uow: UnitOfWork<GetUserRepos>) {}

  async execute(actor: UserActor, id: string): Promise<UserView> {
    requireRole(actor, 'admin');
    const user = await this.uow.run(actor, ({ userDetail }) => userDetail.findById(id));
    if (!user) throw new ApplicationError('not_found', 'Usuario no encontrado');
    return user;
  }
}
