import {
  CognitoIdentityProviderClient,
  UpdateUserAttributesCommand,
  ResendConfirmationCodeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { decodeIdTokenFromEvent, buildResponse } from '../../utils';
import validateCsrf from '../../utils/csrf-decorator';



const { REGION, CLIENT_APP_ID } = process.env;

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

const updatePhoneNumberLambda = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const decodedToken = decodeIdTokenFromEvent(event);
  const username = decodedToken?.['cognito:username'];
  const { phoneNumber, resend } = JSON.parse(event.body as string) || {};

  if (!phoneNumber && !resend) {
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Missing required fields',
      }),
      400,
    );
  }

  try {
    if (resend) {
      await cognitoClient.send(
        new ResendConfirmationCodeCommand({
          ClientId: CLIENT_APP_ID,
          Username: username,
        }),
      );
    } else {
      await cognitoClient.send(
        new UpdateUserAttributesCommand({
          UserAttributes: [
            {
              Name: 'phone_number',
              Value: phoneNumber,
            },
          ],
          AccessToken: event.headers.AccessToken,
        }),
      );
    }

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: `User updated successfully`,
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

export const handler = validateCsrf(updatePhoneNumberLambda);
