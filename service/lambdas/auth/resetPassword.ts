import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { buildResponse, getCognitoUser } from '../../utils';

const { USER_POOL_ID, CLIENT_APP_ID } = process.env;

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const { verificationCode, newPassword, username } = JSON.parse(event.body as string);
    if (!verificationCode || !newPassword || !username) {
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
    console.log('Start reset password proccess for user', lowerUsername);
    const cognitoUser = getCognitoUser(
      USER_POOL_ID as string,
      CLIENT_APP_ID as string,
      lowerUsername as string,
    );

    return new Promise((resolve) => {
      console.log('Change password with verification code flow');
      cognitoUser.confirmPassword(verificationCode, newPassword, {
        onSuccess() {
          console.log('Password confirmed!');
          resolve(
            buildResponse(
              JSON.stringify({
                success: true,
              }),
            ),
          );
        },
        onFailure(err) {
          console.log(err);
          resolve(
            buildResponse(
              JSON.stringify({
                success: false,
                err: true,
              }),
              502,
            ),
          );
        },
      });
    });
  } catch (err) {
    console.log('error in reset password flow', err);
    return buildResponse(`Error, CDK! ${err}`, 502);
  }
};
