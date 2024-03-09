import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ChangePasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { buildResponse } from '../../utils';

const { REGION } = process.env;
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const { oldPassword, newPassword } = JSON.parse(event.body as string);

    if (!oldPassword || !newPassword) {
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: 'Missing required fields',
        }),
        400,
      );
    }
    if (oldPassword === newPassword) {
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: 'New password cannot be the same as old password',
        }),
        400,
      );
    }

    await cognitoClient.send(
      new ChangePasswordCommand({
        AccessToken: event.headers.AccessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword,
      }),
    );

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: 'Password changed successfully',
      }),
    );
  } catch (err) {
    console.log('error in reset password flow', err);
    return buildResponse(`Error, CDK! ${err}`, 502);
  }
};
