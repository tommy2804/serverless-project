import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ID_TOKEN_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN, XSRF_TOKEN_KEY } from '../../constants';
import { JwtPayload, decode } from 'jsonwebtoken';
import {
  CognitoIdentityProviderClient,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getDomainByEnv, TOMMY_ENV } from '../../../utils/env-utils';
import { buildResponse } from '../../utils';

const { CLIENT_APP_ID, REGION, DEPLOY_ENV } = process.env;
const domain = getDomainByEnv(DEPLOY_ENV as TOMMY_ENV);

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const { username, mfaCode, session } = JSON.parse(event.body as string);

  if (!username || !mfaCode || !session) {
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

  const respondToAuthChallengeResponse = await cognitoClient.send(
    new RespondToAuthChallengeCommand({
      ChallengeName: 'SMS_MFA',
      ClientId: CLIENT_APP_ID as string,
      ChallengeResponses: {
        USERNAME: lowerUsername as string,
        SMS_MFA_CODE: mfaCode as string,
      },
      Session: session,
    }),
  );
  const { AuthenticationResult } = respondToAuthChallengeResponse;
  if (!AuthenticationResult) {
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: 'Something went wrong',
      }),
      502,
    );
  }
  const { IdToken, AccessToken, RefreshToken } = AuthenticationResult;
  const payload = decode(IdToken as string) as JwtPayload;
  const csrfToken = payload[XSRF_TOKEN_KEY];
  return buildResponse(
    JSON.stringify({ success: true }),
    200,
    {},
    {
      'Set-Cookie': [
        `${ID_TOKEN_KEY}=${IdToken}; domain=.${domain}; path=/; secure; SameSite=Strict; HttpOnly`,
        `${ACCESS_TOKEN_KEY}=${AccessToken}; domain=.${domain}; path=/; secure; SameSite=Strict; HttpOnly`,
        `${REFRESH_TOKEN}=${RefreshToken}; domain=.${domain}; path=/auth/refreshToken; secure; SameSite=Strict; HttpOnly`,
        `${XSRF_TOKEN_KEY}=${csrfToken}; domain=.${domain}; path=/; secure SameSite=Strict`,
      ],
    },
  );
};
