import { CognitoUser, CognitoUserPool } from 'amazon-cognito-identity-js';

const getCognitoUser = (userPoolId: string, clientAppId: string, username: string): CognitoUser => {
  const poolData = {
    UserPoolId: userPoolId,
    ClientId: clientAppId,
  };
  const userPool = new CognitoUserPool(poolData);
  console.log('Got userpool', userPoolId);
  const userData = {
    Username: username,
    Pool: userPool,
  };
  return new CognitoUser(userData);
};

export { getCognitoUser };
