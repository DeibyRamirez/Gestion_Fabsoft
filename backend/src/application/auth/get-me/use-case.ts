import type { Me } from '@fabsoft/shared';
import type { UserActor } from '../../shared/actor.js';
import { ApplicationError } from '../../shared/application-error.js';
import type { UnitOfWork } from '../../shared/ports.js';
import type { GetMeRepos } from './ports.js';

export class GetMe {
  constructor(private readonly uow: UnitOfWork<GetMeRepos>) {}

  async execute(actor: UserActor): Promise<Me> {
    const user = await this.uow.run(actor, ({ me }) => me.findProfile(actor.userId));
    if (!user) throw new ApplicationError('unauthenticated', 'Usuario no encontrado');
    return toMe(user);
  }
}

export function toMe(user: {
  id: string;
  email: string;
  fullName: string;
  role: Me['role'];
  clientId: string | null;
  mustChangePassword: boolean;
}): Me {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clientId: user.clientId,
    mustChangePassword: user.mustChangePassword,
  };
}
