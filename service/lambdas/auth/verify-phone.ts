import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  VerifyUserAttributeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { buildResponse } from '../../utils';

const { REGION } = process.env;

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const { confirmationCode } = JSON.parse(event.body as string);

    if (!confirmationCode) {
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: 'Missing required fields',
        }),
        400,
      );
    }

    await cognitoClient.send(
      new VerifyUserAttributeCommand({
        AccessToken: event.headers.AccessToken,
        AttributeName: 'phone_number',
        Code: confirmationCode,
      }),
    );

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: 'Phone number verified successfully',
      }),
    );
  } catch (error: any) {
    console.error('Error:', error);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Error verifying phone number',
      }),
      501,
    );
  }
};
