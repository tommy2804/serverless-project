import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ID_TOKEN_KEY, ACCESS_TOKEN_KEY, XSRF_TOKEN_KEY, REFRESH_TOKEN } from '../../constants';
import { JwtPayload, decode } from 'jsonwebtoken';
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { emptyCookiesResponse } from '../../../utils/auth-util/cookies-utils';
import { buildResponse } from '../../utils';
import { TOMMY_ENV, getDomainByEnv } from '../../../utils/env-utils';

const { CLIENT_APP_ID, REGION, USER_POOL_ID, DEPLOY_ENV } = process.env;

const domain = getDomainByEnv(DEPLOY_ENV as TOMMY_ENV);

const client = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const refreshToken = event.headers?.refreshToken;
    if (!refreshToken) {
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: 'Missing refresh token in headers',
        }),
        400,
        {},
        emptyCookiesResponse(domain),
      );
    }
    const response = await client.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN',
        ClientId: CLIENT_APP_ID,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken as string,
        },
      }),
    );
    const idToken = response.AuthenticationResult?.IdToken;
    const accessToken = response.AuthenticationResult?.AccessToken;
    const newRefreshToken = response.AuthenticationResult?.RefreshToken;
    const payload = decode(idToken as string) as JwtPayload;
    const expiration = payload['custom:expiration'];
    if (expiration && new Date(expiration) < new Date()) {
      const username = payload['cognito:username'];
      const command = new AdminUserGlobalSignOutCommand({
        UserPoolId: USER_POOL_ID as string,
        Username: username,
      });
      await client.send(command);
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: 'User expired',
        }),
        400,
        {},
        emptyCookiesResponse(domain),
      );
    }
    const csrfToken = payload[XSRF_TOKEN_KEY];
    return buildResponse(
      JSON.stringify({
        success: true,
      }),
      200,
      {},
      {
        'Set-Cookie': [
          `${ID_TOKEN_KEY}=${idToken}; domain=.${domain}; path=/; secure; HttpOnly: SameSite=Strict`,
          `${ACCESS_TOKEN_KEY}=${accessToken}; domain=.${domain}; path=/; secure; HttpOnly; SameSite=Strict`,
          `${XSRF_TOKEN_KEY}=${csrfToken}; domain=.${domain}; path=/; secure; SameSite=Strict`,
          `${REFRESH_TOKEN}=${newRefreshToken}; domain=.${domain}; path=/auth/refreshToken; secure; HttpOnly; SameSite=Strict`,
        ],
      },
    );
  } catch (err) {
    console.log(err);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Error in refresh token proccess',
      }),
      502,
      {},
      emptyCookiesResponse(domain),
    );
  }
};
