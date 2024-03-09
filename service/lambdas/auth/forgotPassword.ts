import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { buildResponse, getCognitoUser } from '../../utils';
const { USER_POOL_ID, CLIENT_APP_ID } = process.env;

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const { username } = JSON.parse(event.body as string);
    const lowerUsername = username.toLowerCase();
    console.log('Start forgot password proccess for user', lowerUsername);
    const cognitoUser = getCognitoUser(
      USER_POOL_ID as string,
      CLIENT_APP_ID as string,
      lowerUsername,
    );

    return new Promise((resolve) => {
      cognitoUser.forgotPassword({
        onSuccess(data) {
          console.log('CodeDeliveryData from forgotPassword: ' + data);
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
    console.log(err, 'from catch');
    return buildResponse(`Error, CDK! ${err}`, 502);
  }
};
