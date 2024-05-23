import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  BatchWriteItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { Permission } from "../../../interfaces";

const { EVENTS_TABLE_NAME, FACES_TABLE_NAME, REGION, PHOTO_BUCKET } = process.env;

const dynamoDB = new DynamoDBClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

async function batchDeleteFaces(faceItems: any[], tableName: string) {
  const chunkSize = 25;
  for (let i = 0; i < faceItems.length; i += chunkSize) {
    const chunk = faceItems.slice(i, i + chunkSize);

    await dynamoDB.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [tableName]: chunk.map((faceItem) => ({
            DeleteRequest: {
              Key: {
                eventId: { S: faceItem.eventId.S },
                id: { S: faceItem.id.S },
              },
            },
          })),
        },
      })
    );
  }
}

const deletePhotosLambda = async (event: APIGatewayProxyEvent) => {
  try {
    console.log("Start delete event", event);
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const { eventId, photos } = JSON.parse(event.body || "{}");

    if (!eventId) {
      console.log("Event ID not provided");
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "Event ID not provided",
        }),
        400
      );
    }
    if (!photos || photos.length === 0) {
      console.log("Photos not provided");
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "Photos not provided",
        }),
        400
      );
    }
    if (!Array.isArray(photos) || photos.some((photo) => typeof photo !== "string")) {
      console.log("Photos is not an array or some of the photos is not a string");
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "Photos is not an array or some of the photos is not a string",
        }),
        400
      );
    }
    if (photos.length > 20) {
      console.log("Photos array is too long", photos.length);
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "Photos array is too long",
        }),
        400
      );
    }

    const smallListParams = photos.map((photo) => ({
      Key: `small/${organization}/${eventId}/${photo}`,
    }));
    const mediumListParams = photos.map((photo) => ({
      Key: `medium/${organization}/${eventId}/${photo}`,
    }));
    const originalListParams = photos.map((photo) => ({
      Key: `original/${organization}/${eventId}/${photo}`,
    }));

    const fullList = [...smallListParams, ...originalListParams];
    console.log("Full list about to delete", fullList);

    const [s3MediumListResponse] = await Promise.all(
      [mediumListParams, fullList].map((list) =>
        s3Client.send(
          new DeleteObjectsCommand({
            Bucket: PHOTO_BUCKET,
            Delete: {
              Objects: list,
            },
          })
        )
      )
    );
    const photoDeleted = s3MediumListResponse.Deleted?.length;
    console.log("Delete objects response", photoDeleted);
    console.log("S3 response", eventId);
    const faceItemsRequests = photos.map((photo) =>
      dynamoDB.send(
        new QueryCommand({
          TableName: FACES_TABLE_NAME as string,
          KeyConditionExpression: "eventId = :eventId",
          FilterExpression: "image = :photo",
          ExpressionAttributeValues: {
            ":eventId": { S: eventId },
            ":photo": { S: photo },
          },
        })
      )
    );
    const responses = await Promise.all(faceItemsRequests);
    console.log("Responses", responses);
    const faceItems = responses.reduce((acc: any[], cur: any) => {
      const items = cur.Items?.filter((item: string) => item) || [];
      return [...acc, ...items];
    }, []);

    console.log("Face items", faceItems.length);

    const batchDeleteFacesPromise = batchDeleteFaces(faceItems, FACES_TABLE_NAME as string);
    console.log("deleted faces from table");

    const updateEvent = dynamoDB.send(
      new UpdateItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: eventId },
          organization: { S: organization },
        },
        UpdateExpression: "SET total_photos = total_photos - :num",
        ExpressionAttributeValues: {
          ":num": { N: `${photoDeleted}` },
        },
      })
    );
    await Promise.all([batchDeleteFacesPromise, updateEvent]);

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: "Photos deleted successfully",
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

export const handler = validateCsrf(
  validatePermissions(deletePhotosLambda, Permission.MANAGE_EVENTS)
);
