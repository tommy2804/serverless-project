import { SQSEvent } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDB, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const resizeImg = require('resize-img');

const { REGION, EVENTS_TABLE_NAME } = process.env;
const s3Client = new S3Client({ region: REGION });
const dynamoDB = new DynamoDB({ region: REGION });

interface IResizeDate {
  imageBuffer: Buffer;
  key: string;
  size: number;
}

const resizedImages = async (resizeData: IResizeDate[], bucketName: string): Promise<void> => {
  console.log('Start resizing, length:', resizeData.length);
  const resizedArray = await Promise.all(
    resizeData.map(async (item) => {
      const resizedImage = await resizeImg(item.imageBuffer, { width: item.size });
      return {
        ...item,
        resizedImage,
      };
    }),
  );
  console.log('finish resize, put in s3');
  await Promise.all(
    resizedArray.map((item) =>
      s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: item.key,
          Body: item.resizedImage,
        }),
      ),
    ),
  );
  console.log('successfully put photos in s3');
};

export const handler = async (event: SQSEvent) => {
  try {
    console.log('new event:', event);
    console.log('start looping', event.Records.length);
    for (const index in event.Records) {
      console.log('index', index);
      const eventRecord = event.Records[index];
      const body = JSON.parse(eventRecord.body);
      const records = JSON.parse(body.Message).Records;
      if (!records) {
        console.log('no records found');
        continue;
      }
      console.log('start looping inner records', records.length);
      for (const innerIndex in records) {
        console.log('inner index', innerIndex);
        const record = records[innerIndex];
        if (!record) {
          console.log('no record found');
          continue;
        }
        const s3Object = record.s3?.object;
        const bucketName = record.s3?.bucket.name;
        const photoKey = decodeURIComponent(s3Object.key.replace(/\+/g, ' '));
        console.log('got all the data', bucketName, photoKey);

        const { Body: imageObject } = await s3Client.send(
          new GetObjectCommand({
            Bucket: bucketName,
            Key: photoKey,
          }),
        );
        if (!imageObject) throw new Error('no image object');
        const imageBytes = await imageObject.transformToByteArray();
        const imageBuffer = Buffer.from(imageBytes);
        if (!imageBuffer) throw new Error('no image buffer');

        const [prefix] = photoKey.split('/');
        if (prefix === 'organization-assets') {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const [prefix, _, organization, eventName, photoName] = photoKey.split('/');
          console.log({ organization, eventName, photoName });
          const photoNameWithSlash = photoName ? `/${photoName}` : ''; // for default brand image case with no event name
          const key = `${prefix}/resized/${organization}/${eventName}${photoNameWithSlash}`;
          const resizeData: IResizeDate = {
            imageBuffer,
            key,
            size: (photoName || eventName).startsWith('mainImage') ? 800 : 200,
          };
          await resizedImages([resizeData], bucketName);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const [_, organization, eventName, photoName] = photoKey.split('/');
          console.log({ organization, eventName, photoName });
          const mediumKey = `medium/${organization}/${eventName}/${photoName}`;
          const smallKey = `small/${organization}/${eventName}/${photoName}`;
          const resizeData: IResizeDate[] = [
            {
              imageBuffer,
              key: mediumKey,
              size: 1200,
            },
            {
              imageBuffer,
              key: smallKey,
              size: 450,
            },
          ];
          const resizePromise = resizedImages(resizeData, bucketName);
          const updateDbPromise = dynamoDB
            .send(
              new UpdateItemCommand({
                TableName: EVENTS_TABLE_NAME as string,
                Key: {
                  id: { S: eventName },
                  organization: { S: organization },
                },
                UpdateExpression: 'SET photos_process = list_append(photos_process, :photo)',
                ConditionExpression: 'size(photos_process) < number_of_photos AND NOT contains(photos_process, :photostr)',
                ExpressionAttributeValues: {
                  ':photo': { L: [{ S: photoName }] },
                  ':photostr': { S: photoName },
                },
              }),
            )
            .catch((err) => console.log('error updating total photos', err));

          await Promise.all([resizePromise, updateDbPromise]);

          console.log('Successfully resized and uploaded the image');
        }
      }
    }
    return;
  } catch (error: unknown) {
    console.error('Error processing S3 event:', error);
    throw new Error(error as string);
  }
};
