import { CognitoUserPool, CognitoUser } from 'amazon-cognito-identity-js'
import { APIGatewayProxyResult, APIGatewayProxyEvent } from 'aws-lambda';
import { buildResponse } from '../../utils';

const { USER_POOL_ID, CLIENT_APP_ID } = process.env;

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const { verifyCode, username } = JSON.parse(event?.body || '{}');
  const poolData = {
    UserPoolId: USER_POOL_ID as string,
    ClientId: CLIENT_APP_ID as string,
  };

  if (!verifyCode || !username) {
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Missing required fields',
      }),
      400,
    );
  }

  const lowerUsername = username.toLowerCase();

  console.log('poolData is', poolData);
  const userPool = new CognitoUserPool(poolData);
  console.log('userpool is', userPool);
  const userData = {
    Username: lowerUsername,
    Pool: userPool,
  };

  const cognitoUser = new CognitoUser(userData);
  return new Promise((resolve) => {
    cognitoUser.confirmRegistration(verifyCode, true, function (err: any, result: any) {
      if (err) {
        console.log(err.message);
        const response = buildResponse(
          JSON.stringify({
            success: false,
            err: true,
            message: 'Could not veriy code',
          }),
          502,
        );
        resolve(response);
      }
      console.log('call result: ' + result);

      const response = buildResponse(
        JSON.stringify({
          success: true,
        }),
      );
      resolve(response);
    });
  });
};
