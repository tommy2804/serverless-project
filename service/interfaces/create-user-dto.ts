export enum ExpirationType {
  UNLIMITED = 'unlimited',
  DATE = 'date',
}

export enum EventsLimitType {
  UNLIMITED = 'unlimited',
  NUMBER = 'number',
}

export enum Permission {
  CREATE_EVENTS = 'create-events',
  MANAGE_USERS = 'manage-users',
  MANAGE_EVENTS = 'manage-events',
  MANAGE_ORGANIZATION = 'manage-organization',
}

export interface CreateUserDto {
  username: string;
  email: string;
  permissions: Permission[];
  expirationType: ExpirationType;
  expiration?: string;
  eventsLimitType: EventsLimitType;
  eventsLimit?: number;
  role: string;
}
