export enum Actions {
  CREATE_EVENT = 'CREATE_EVENT',
  DELETE_EVENT = 'DELETE_EVENT',
  CREATE_USER = 'CREATE_USER',
  DELETE_USER = 'DELETE_USER',
  UPDATE_USER = 'UPDATE_USER',
  CREATE_ORGANIZATION = 'CREATE_ORGANIZATION',
  UPDATE_ORGANIZATION_SETTINGS = 'UPDATE_ORGANIZATION_SETTINGS',
}

export interface IActivity {
  id: number;
  username: string;
  organization: string;
  action: Actions;
  resource?: string;
}

export interface ICreateActivityDTO {
  username: string;
  organization: string;
  action: Actions;
  resource?: string;
}
