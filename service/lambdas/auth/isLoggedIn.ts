import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDB, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { decodeIdTokenFromEvent, buildResponse } from '../../utils';
import { GIFT_STATUS } from '../../constants';

const { GIFT_EVENTS_TABLE_NAME, REGION } = process.env;
const dynamoDB = new DynamoDB({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    if (!decodedToken) {
      console.log('no decoded token');
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
        }),
        401,
      );
    }

    const email = decodedToken['email'];
    const username = decodedToken['cognito:username'];
    const permissions = decodedToken['custom:permissions'];
    const organization = decodedToken['custom:organization'];
    const root = decodedToken['custom:root'];
    let giftsEvents: any[] = [];

    // only users created by other organization users can have gifts events
    if (email === username) {
      const giftEevntsRes = await dynamoDB.send(
        new QueryCommand({
          TableName: GIFT_EVENTS_TABLE_NAME as string,
          KeyConditionExpression: 'organization = :organization',
          FilterExpression: '#status = :status',
          ExpressionAttributeValues: {
            ':organization': { S: organization },
            ':status': { S: GIFT_STATUS.ACTIVE },
          },
          ExpressionAttributeNames: {
            '#status': 'status',
          },
        }),
      );
      console.log('got response from db', giftEevntsRes.Items);
      giftsEvents = giftEevntsRes.Items?.map((item) => unmarshall(item)) || [];
    }

    const body = {
      success: true,
      isLoggedIn: true,
      payload: {
        email,
        username,
        organization,
        permissions,
        root,
        giftsEvents,
      },
    };
    return buildResponse(JSON.stringify(body));
  } catch (err) {
    console.log(err, 'from catch');
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
      }),
      502,
    );
  }
};
