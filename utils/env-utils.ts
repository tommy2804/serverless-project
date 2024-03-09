export enum TOMMY_ENV {
  DEV = 'dev',
  PROD = 'prod',
}

const TOMMY_DOMAIN = {
  [TOMMY_ENV.DEV]: 'tommy.cloud',
  [TOMMY_ENV.PROD]: 'tommy.ai',
};

export const getEnv = (): TOMMY_ENV => {
  const env = process.env.DEPLOY_ENV;
  if (env === TOMMY_ENV.DEV) return TOMMY_ENV.DEV;
  else if (env === TOMMY_ENV.PROD) return TOMMY_ENV.PROD;
  else throw new Error('Invalid environment');
};

export const isProd = (): boolean => getEnv() === TOMMY_ENV.PROD;

export const getDomainByEnv = (env: TOMMY_ENV): string => {
  return TOMMY_DOMAIN[env];
};
