import { APIGatewayProxyEvent } from 'aws-lambda';
import { buildResponse } from '../../../utils/response-util';
import { createPutPresignedUrl } from '../../../utils/photos-util';
import { decodeIdTokenFromEvent } from '../../../utils/token-utils';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import validateCsrf from '../../../decorators/csrf-decorator';
import { S3, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { PresignUrlFile } from '../../../interfaces';

const { REGION, BUCKET_NAME, ORGANIZATIONS_TABLE_NAME, EVENTS_TABLE_NAME } = process.env;
const dynamoDBClient = new DynamoDBClient({ region: REGION });
const s3 = new S3({ region: REGION });

const SUPPORTED_TYPES = ['logo', 'mainImage', 'watermark', 'next-event-logo'];

const resolvePhotoUrl = (size: string, type: string, organization: string, eventId?: string) => {
  const eventIdPath = eventId ? `${eventId}/` : '';
  return `/organization-assets/${size}/${organization}/${eventIdPath}${type}`;
};

const brandingPresignLambda = async (event: APIGatewayProxyEvent) => {
  const { file, type, eventId, remove } = JSON.parse(event.body as string);
  console.log(event.body, eventId);
  const decodedToken = decodeIdTokenFromEvent(event);
  const organization = decodedToken?.['custom:organization'];
  if (type && remove && !eventId) {
    const originalDelete = s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME as string,
        Key: resolvePhotoUrl('original', type, organization),
      }),
    );
    const resizedDelete = s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME as string,
        Key: resolvePhotoUrl('resized', type, organization),
      }),
    );
    const updateCommand = new UpdateItemCommand({
      TableName: ORGANIZATIONS_TABLE_NAME as string,
      Key: {
        id: { S: organization },
      },
      UpdateExpression: `SET ${type} = :false`,
      ExpressionAttributeValues: {
        ':false': { BOOL: false },
      },
      ReturnValues: 'ALL_NEW',
    });
    await Promise.all([originalDelete, resizedDelete, dynamoDBClient.send(updateCommand)]);
    return buildResponse(
      JSON.stringify({
        success: true,
        err: false,
      }),
    );
  }

  if (!file || !type) {
    console.log('fileName or type not provided', {
      file,
      type,
    });
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: 'fileName or type not provided',
      }),
      501,
    );
  }
  if (!organization) throw new Error('Organization is not defined');

  const { fileName, fileSize } = file as PresignUrlFile;

  if (!SUPPORTED_TYPES.includes(type) || fileSize > 100 * 1024 * 1024) {
    console.log('file is not valid, unsupported type or too large', {
      type,
      fileSize,
    });
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: 'file is not valid, unsupported type or too large',
      }),
      501,
    );
  }
  console.log({ eventId, fileName });
  let version;

  if (['logo', 'mainImage'].includes(type)) {
    const versionType = type === 'logo' ? 'logoVersion' : 'mainImageVersion';

    const TableName = eventId
      ? (EVENTS_TABLE_NAME as string)
      : (ORGANIZATIONS_TABLE_NAME as string);

    const item = await dynamoDBClient.send(
      new UpdateItemCommand({
        TableName,
        Key: eventId
          ? { id: { S: eventId }, organization: { S: organization } }
          : { id: { S: organization } },
        // handle not exist value
        UpdateExpression: `SET ${versionType} = if_not_exists(${versionType}, :zero) + :incr`,
        ExpressionAttributeValues: {
          ':incr': { N: '1' },
          ':zero': { N: '0' },
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    version = item.Attributes?.[versionType].N;
  }

  console.log('Creating presign url');
  const typeWithVersion = version ? `${type}-${version}` : type;
  const uploadlUrl = await createPutPresignedUrl({
    bucket: BUCKET_NAME as string,
    folderName: eventId || '',
    fileName: typeWithVersion,
    fileSize,
    prefix: `organization-assets/original/${organization}/`,
  });

  if (!eventId) {
    const updateCommand = new UpdateItemCommand({
      TableName: ORGANIZATIONS_TABLE_NAME as string,
      Key: {
        id: { S: organization },
      },
      UpdateExpression: `SET ${type} = :true`,
      ExpressionAttributeValues: {
        ':true': { BOOL: true },
      },
      ReturnValues: 'ALL_NEW',
    });
    await dynamoDBClient.send(updateCommand);
  } else if (version && Number(version) > 1) {
    try {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME as string,
          Delete: {
            Objects: [
              { Key: resolvePhotoUrl('original', `type-${version}`, organization, eventId) },
              { Key: resolvePhotoUrl('resized', `type-${version}`, organization, eventId) },
            ],
          },
        }),
      );
    } catch (error) {
      console.log('Error deleting old photos', error);
    }
  }

  return buildResponse(
    JSON.stringify({
      success: true,
      err: false,
      uploadlUrl,
    }),
  );
};

export const handler = validateCsrf(brandingPresignLambda);
