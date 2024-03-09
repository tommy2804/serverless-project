import {
  CognitoIdentityProviderClient,
  SetUserMFAPreferenceCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { buildResponse } from '../../utils';
import validateCsrf from '../../utils/csrf-decorator';

const { REGION } = process.env;

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

const updateMfaLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { enable } = JSON.parse(event.body as string) || {};

  try {
    await cognitoClient.send(
      new SetUserMFAPreferenceCommand({
        SMSMfaSettings: {
          Enabled: enable,
          PreferredMfa: enable,
        },
        AccessToken: event.headers.AccessToken,
      }),
    );

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: `User mfa ${enable ? 'enabled' : 'disabled'} successfully`,
      }),
    );
  } catch (err) {
    console.error(err);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Error updating user',
      }),
      501,
    );
  }
};

export const handler = validateCsrf(updateMfaLambda);
