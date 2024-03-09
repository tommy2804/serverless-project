export const XSRF_TOKEN_KEY = 'XSRF-TOKEN';
export const ID_TOKEN_KEY = 'idToken';
export const REFRESH_TOKEN = 'refreshToken';
export const ACCESS_TOKEN_KEY = 'accessToken';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

export const runtime = Runtime.NODEJS_18_X;


export enum UserStatus {
    FORCE_CHANGE_PASSWORD = 'FORCE_CHANGE_PASSWORD',
    UNCONFIRMED = 'UNCONFIRMED',
    EXPIRED = 'EXPIRED',
    CONFIRM_MFA = 'CONFIRM_MFA',
  }
  

  export enum GIFT_STATUS {
    ACTIVE = 'ACTIVE',
    USED = 'USED',
    INACTIVE = 'INACTIVE',
  }
  