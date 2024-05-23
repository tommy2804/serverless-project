import { RekognitionClient, IndexFacesCommand } from "@aws-sdk/client-rekognition";
import { DynamoDB, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { SQSEvent } from "aws-lambda";
import { EVENTS_RETENTION_DAYS } from "../../../../lib/constants/events";
import { getTtlTime } from "../../../utils/date-util";

const { REGION, FACES_TABLE_NAME } = process.env;

const rekognition = new RekognitionClient({ region: REGION });
const dynamoDB = new DynamoDB({ region: REGION });
const s3Client = new S3Client({ region: REGION });

export const handler = async (event: SQSEvent) => {
  try {
    console.log("new event:", event);
    for (const eventRecord of event.Records) {
      const body = JSON.parse(eventRecord.body);
      const records = JSON.parse(body.Message).Records;
      if (!records) {
        console.log("no records found");
        continue;
      }
      for (const record of records) {
        if (!record) {
          console.log("no record found");
          continue;
        }
        console.log({ record });
        const s3Object = record.s3?.object;
        console.log({ s3Object });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [prefix, organization, eventId, photoName] = s3Object.key.split("/");
        const bucketName = record.s3?.bucket.name;
        const photoKey = decodeURIComponent(s3Object.key.replace(/\+/g, " "));
        console.log({ photoKey, bucketName, eventId });
        const faces = await rekognition
          .send(
            new IndexFacesCommand({
              CollectionId: eventId,
              Image: {
                S3Object: {
                  Bucket: bucketName,
                  Name: photoKey,
                },
              },
              MaxFaces: 25,
            })
          )
          .catch(async (error) => {
            console.log(error);
            if (error.code === "InvalidImageFormatException") {
              console.log("delete invalid image");
              const deleteResponse = await s3Client
                .send(
                  new DeleteObjectCommand({
                    Bucket: bucketName,
                    Key: photoKey,
                  })
                )
                .catch((err) => console.log("error in delete item in s3", err));
              console.log({ deleteResponse });
            }
          });
        console.log("after command");
        if (faces?.FaceRecords) {
          console.log("start proccess image faces");
          const facePromises = faces?.FaceRecords?.map(async (faceRecord) => {
            console.log({ faceRecord });
            const faceId = faceRecord.Face?.FaceId;
            if (!faceId) return;

            await dynamoDB
              .send(
                new PutItemCommand({
                  TableName: FACES_TABLE_NAME as string,
                  Item: {
                    id: { S: faceId },
                    eventId: { S: eventId },
                    image: { S: photoName },
                    ttl: {
                      N: getTtlTime(EVENTS_RETENTION_DAYS).toString(),
                    },
                  },
                })
              )
              .catch((err) => console.log("error in put item in dynamodb", err));
          });
          await Promise.all(facePromises);
        }
      }
    }
  } catch (error: any) {
    console.error("Error processing S3 event:", error);
    throw new error();
  }
};
