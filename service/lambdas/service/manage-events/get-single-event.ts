import { DynamoDB, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { decodeIdTokenFromEvent } from '../../../utils/token-utils';
import { buildResponse } from '../../../utils/response-util';
import validateCsrf from '../../../decorators/csrf-decorator';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const { REGION, TABLE_NAME } = process.env;
const dynamoDB = new DynamoDB({ region: REGION });

const getEeventsLambda = async (event: APIGatewayProxyEvent) => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.['custom:organization'];
    const username = decodedToken?.['cognito:username'];
    const nameUrl = event.pathParameters?.nameUrl;
    console.log('Start get signle event', { nameUrl });

    if (!nameUrl) {
      console.log('missing event name url', username, event.pathParameters);
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: 'Missing event name url',
        }),
        400,
      );
    }

    const eventRecord = await dynamoDB.send(
      new GetItemCommand({
        TableName: TABLE_NAME as string,
        Key: {
          id: { S: nameUrl },
          organization: { S: organization },
        },
        ProjectionExpression:
          'id, #name, event_date, mainImage, logo, giftRoot, organization, nextEventPromotion, number_of_photos, total_photos, missingPhotos, #location, username, time_created, photographer_name, facebook, instagram, website, favorite_photos, selfies_taken, photos_taken, qrcode, logoVersion, mainImageVersion, giftFields, contactMeClick, socialMediaClick, photoDownload, nextEventClick, watermark, eventWatermarkSize, watermarkPosition, #ttl, isPublicEvent',
        ExpressionAttributeNames: {
          '#name': 'name',
          '#location': 'location',
          '#ttl': 'ttl',
        },
      }),
    );
    if (!eventRecord.Item) {
      console.log('event not found', username);
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: 'Event not found',
        }),
        404,
      );
    }
    console.log('got response from db');

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        event: unmarshall(eventRecord.Item),
      }),
      200,
    );
  } catch (error) {
    console.error('Error:', error);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'An error occurred',
      }),
      501,
    );
  }
};

export const handler = validateCsrf(getEeventsLambda);
