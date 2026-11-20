import type { AuthUser } from '../../auth/ports.js';
import type { PortalContactChannelView, PortalOrganizationView } from '../shared/portal-views.js';

export interface PortalMeQuery {
  findOrganization(clientId: string): Promise<PortalOrganizationView | null>;
  findContactChannel(): Promise<PortalContactChannelView>;
}

export interface GetPortalMeRepos {
  me: { findProfile(userId: string): Promise<AuthUser | null> };
  portalMe: PortalMeQuery;
}
