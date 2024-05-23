import { APIGatewayProxyEvent } from "aws-lambda";
import { S3Client, ListObjectsV2Command, ListObjectsV2CommandInput } from "@aws-sdk/client-s3";
import { buildResponse } from "../../../utils/response-util";
import { DynamoDB, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const { REGION, PHOTO_BUCKET, EVENTS_TABLE_NAME } = process.env;
const s3Client = new S3Client({ region: REGION });
const dynamoDB = new DynamoDB({ region: REGION });

const getPhotoId = (id?: string): string => {
  if (!id) return "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, organization, eventId, photoId] = id.split("/");
  return photoId;
};

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    console.log("Start listing objects in S3 bucket");
    const { eventId, marker } = event.queryStringParameters || {};
    if (!eventId) {
      console.log("missing required fields");
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "missing required fields",
        }),
        400
      );
    }
    const eventMirrorRecord = await dynamoDB.send(
      new GetItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: eventId },
          organization: { S: "-" },
        },
      })
    );
    console.log("got mirror record", eventMirrorRecord.Item);
    const belongsTo = eventMirrorRecord.Item?.belongsTo.S;
    if (!belongsTo) {
      console.log("Event not fo", eventId);
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "event not found",
        }),
        400
      );
    }

    const eventRecordPromise = dynamoDB.send(
      new GetItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: eventId },
          organization: { S: belongsTo },
        },
        ProjectionExpression: "isPublicEvent, total_photos",
      })
    );

    const eventRecord = await eventRecordPromise;

    console.log(eventRecord, "eventRecord");

    if (!eventRecord.Item) {
      console.log("Event not found", eventId);
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "event record not found",
        }),
        400
      );
    }

    const unmarshallEvent = unmarshall(eventRecord.Item || {});
    console.log("Successfully listed objects in S3 bucket", unmarshallEvent);
    if (!unmarshallEvent.isPublicEvent) {
      console.log("Event not public", eventId);
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "event is not public",
        }),
        400
      );
    }

    const prefix = `small/${belongsTo}/${eventId}/`;

    const listObjectsParams: ListObjectsV2CommandInput = {
      Bucket: PHOTO_BUCKET,
      Prefix: prefix,
      MaxKeys: 20,
    };
    if (marker) listObjectsParams["ContinuationToken"] = marker;

    const response = await s3Client.send(new ListObjectsV2Command(listObjectsParams));
    const photos = response.Contents
      ? response.Contents.map((object) => getPhotoId(object.Key))
      : [];
    const total = unmarshallEvent.total_photos || 0;

    console.log("Successfully listed objects in S3 bucket", unmarshallEvent);
    console.log(response.IsTruncated, response.NextContinuationToken);

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        photos,
        lastKey: response.IsTruncated ? response.NextContinuationToken : null,
        total,
      }),
      200
    );
  } catch (error) {
    console.error("Error:", error);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "An error occurred",
      }),
      501
    );
  }
};
