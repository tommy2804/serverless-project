import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  GetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { buildResponse } from '../../utils';

const { REGION } = process.env;

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const user = await cognitoClient.send(
      new GetUserCommand({
        AccessToken: event.headers.AccessToken,
      }),
    );

    const phoneNumber = user.UserAttributes?.find((attr) => attr.Name === 'phone_number')?.Value;
    const phoneNumberVerified = user.UserAttributes?.find(
      (attr) => attr.Name === 'phone_number_verified',
    )?.Value;
    const smsMfaEnabled = user.PreferredMfaSetting === 'SMS_MFA';

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: 'User fetched successfully',
        user: {
          phoneNumber,
          phoneNumberVerified,
          smsMfaEnabled,
        },
      }),
    );
  } catch (err: any) {
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Error in get user proccess',
      }),
      502,
    );
  }
};
