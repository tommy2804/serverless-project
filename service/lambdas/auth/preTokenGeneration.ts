import { PreTokenGenerationAuthenticationTriggerEvent } from 'aws-lambda';
import { XSRF_TOKEN_KEY } from '../../constants';
import { DynamoDB, GetItemCommand } from '@aws-sdk/client-dynamodb';

const { USERS_TABLE_NAME, REGION } = process.env;
const dynamoDB = new DynamoDB({ region: REGION });

function generateXSRFToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return [...Array(20).keys()].reduce(
    (acc) => (acc += chars.charAt(Math.floor(Math.random() * chars.length))),
    '',
  );
}

export const handler = async (event: PreTokenGenerationAuthenticationTriggerEvent) => {
  console.log('Start new generate token process');
  try {
    const xsrfToken = generateXSRFToken();
    const MEMBER = event.request.userAttributes['custom:MEMBER'];
    const isRoot = event.request.userAttributes['custom:root'] === 'true';
    const username = event.userName;
    console.log('xsrf token created');
    let userRecord;
    if (!isRoot) {
      userRecord = await dynamoDB.send(
        new GetItemCommand({
          TableName: USERS_TABLE_NAME as string,
          Key: {
            id: { S: username },
            MEMBER: { S: MEMBER },
          },
          ProjectionExpression: 'eventsLimitType, eventsCreated, eventsLimit',
        }),
      );
      if (!userRecord.Item) throw new Error('User not found');
    }

    const eventsLimitType = userRecord?.Item?.eventsLimitType?.S || '';

    event.response = {
      claimsOverrideDetails: {
        claimsToAddOrOverride: {
          [XSRF_TOKEN_KEY]: xsrfToken,
          eventsLimitType,
          eventsCreated: userRecord?.Item?.eventsCreated?.N || '0',
          eventsLimit: userRecord?.Item?.eventsLimit?.N || '0',
        },
      },
    };
    console.log('succesfully added claims to token');
  } catch (err) {
    console.log(err);
  }
  return event;
};
