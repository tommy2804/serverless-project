import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { emptyCookiesResponse } from '../../../utils/auth-util/cookies-utils';
import { getDomainByEnv, TOMMY_ENV } from '../../../utils/env-utils';
import { decodeIdTokenFromEvent, buildResponse } from '../../utils';


const { USER_POOL_ID, REGION, DEPLOY_ENV } = process.env;
const domain = getDomainByEnv(DEPLOY_ENV as TOMMY_ENV);

const client = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const username = decodedToken?.['cognito:username'];
    if (!username)
      return buildResponse(
        JSON.stringify({
          success: false,
          refreshed: false,
          error: true,
          message: 'Could not find username',
        }),
        400,
      );
    console.log('Start logout for user', username);

    const command = new AdminUserGlobalSignOutCommand({
      UserPoolId: USER_POOL_ID as string,
      Username: username as string,
    });
    await client.send(command);

    return buildResponse(
      JSON.stringify({
        success: true,
      }),
      200,
      {},
      emptyCookiesResponse(domain),
    );
  } catch (err) {
    console.log(err, 'from catch');
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'An error occurred',
      }),
      500,
      {},
      emptyCookiesResponse(domain),
    );
  }
};
