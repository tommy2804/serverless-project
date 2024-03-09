import { CognitoUserPool, CognitoUser } from 'amazon-cognito-identity-js';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { buildResponse } from '../../utils';


const { USER_POOL_ID, CLIENT_APP_ID } = process.env;

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const { username } = JSON.parse(event.body as string);
    const lowerUsername = username.toLowerCase();
    console.log('Start resend code proccess for user', lowerUsername);

    const poolData = {
      UserPoolId: USER_POOL_ID as string,
      ClientId: CLIENT_APP_ID as string,
    };
    const userPool = new CognitoUserPool(poolData);
    console.log('Got userpool', USER_POOL_ID);
    const userData = {
      Username: lowerUsername,
      Pool: userPool,
    };
    const cognitoUser = new CognitoUser(userData);

    return new Promise((resolve) => {
      cognitoUser.resendConfirmationCode((err: any, result: any) => {
        if (err) {
          console.log(err, 'from callback');
          let message = 'Error in resend code proccess';
          if (err.code === 'UserNotFoundException') message = 'User not found';
          else if (err.code === 'InvalidParameterException') message = 'User already confirmed';
          return resolve(
            buildResponse(
              JSON.stringify({
                success: false,
                err: true,
                message,
              }),
              502,
            ),
          );
        }
        console.log(result);
        return resolve(
          buildResponse(
            JSON.stringify({
              success: true,
            }),
          ),
        );
      });
    });
  } catch (err) {
    console.log(err, 'from catch');
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Error in resend code proccess',
      }),
      502,
    );
  }
};
