import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProvider,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDB, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { buildResponse } from '../../utils';


const { USER_POOL_ID, CLIENT_APP_ID, REGION, USERS_TABLE_NAME } = process.env;
const cognitoClient = new CognitoIdentityProvider({ region: REGION });
const dynamoDB = new DynamoDB({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const { username, oldPassword, newPassword } = JSON.parse(event.body as string);
    console.log('Start sign in proccess for user', username);
    const lowerUsername = username.toLowerCase();

    const user = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: lowerUsername,
      }),
    );
    if (!user) {
      return buildResponse(
        JSON.stringify({
          success: false,
          message: 'User not found',
        }),
        404,
      );
    }
    const userStatus = user.UserStatus;
    if (userStatus !== 'FORCE_CHANGE_PASSWORD') {
      return buildResponse(
        JSON.stringify({
          success: false,
          message: 'User is not in FORCE_CHANGE_PASSWORD status',
        }),
      );
    }
    console.log('start admin auth');

    const result = await cognitoClient.send(
      new AdminInitiateAuthCommand({
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        ClientId: CLIENT_APP_ID,
        UserPoolId: USER_POOL_ID,
        AuthParameters: {
          USERNAME: lowerUsername,
          PASSWORD: oldPassword,
        },
      }),
    );

    const challengeResponses = {
      USERNAME: lowerUsername,
      NEW_PASSWORD: newPassword,
    };

    console.log('after admin auth', result);

    const challengeResult = await cognitoClient.send(
      new AdminRespondToAuthChallengeCommand({
        ChallengeName: 'NEW_PASSWORD_REQUIRED',
        ClientId: CLIENT_APP_ID,
        UserPoolId: USER_POOL_ID,
        ChallengeResponses: challengeResponses,
        Session: result.Session,
      }),
    );

    console.log('after new pass', challengeResult);

    const MEMBER = user.UserAttributes?.find(
      (attr) => attr.Name === 'custom:MEMBER',
    )?.Value;
    console.log('got MEMBER', MEMBER);

    await dynamoDB.send(
      new UpdateItemCommand({
        TableName: USERS_TABLE_NAME,
        Key: {
          id: { S: lowerUsername },
          MEMBER: { S: MEMBER as string },
        },
        UpdateExpression: 'SET verified = :verified',
        ExpressionAttributeValues: {
          ':verified': { BOOL: true },
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    console.log('updated verified');
    return buildResponse(
      JSON.stringify({
        success: true,
      }),
    );
  } catch (err) {
    console.log(err, 'from catch');
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: 'Failed to change temp user password',
      }),
      502,
    );
  }
};
