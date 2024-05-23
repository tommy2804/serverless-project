export interface ISigninEnv {
  [key: string]: string;
  USER_POOL_ID: string;
  CLIENT_APP_ID: string;
  CLOUDFRONT_DOMAIN: string;
}

export interface ISignupEnv {
  [key: string]: string;
  USER_POOL_ID: string;
  CLIENT_APP_ID: string;
  TABLE_NAME: string;
  REGION: string;
}
