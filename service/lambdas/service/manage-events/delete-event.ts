import {
  DynamoDB,
  BatchWriteItemCommand,
  DeleteItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { RekognitionClient, DeleteCollectionCommand } from "@aws-sdk/client-rekognition";
import { APIGatewayProxyEvent } from "aws-lambda";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { Actions, Permission } from "../../../interfaces";

const { REGION, PHOTO_BUCKET, EVENTS_TABLE_NAME, FACES_TABLE_NAME } = process.env;

const dynamoDB = new DynamoDB({ region: REGION });
const rekognition = new RekognitionClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

async function batchDeleteFaces(
  faceItems: (string | undefined)[],
  tableName: string,
  eventId: string
) {
  const chunkSize = 25;
  for (let i = 0; i < faceItems.length; i += chunkSize) {
    const chunk = faceItems.slice(i, i + chunkSize).filter((item) => !!item) as string[];
    await dynamoDB.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
            DeleteRequest: {
              Key: {
                id: { S: item },
                eventId: { S: eventId },
              },
            },
          })),
        },
      })
    );
  }
}

const deleteEventLambda = async (event: APIGatewayProxyEvent) => {
  try {
    console.log("Start delete event", event);
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const username = decodedToken?.["cognito:username"];
    const eventId = event.queryStringParameters?.id;

    if (!eventId) {
      console.log("Event ID not provided");
      return buildResponse(JSON.stringify({ message: "Event ID not provided" }), 400);
    }
    console.log("found event id", eventId);

    const deleteOriginal = dynamoDB.send(
      new DeleteItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: eventId },
          organization: { S: organization },
        },
        ReturnValues: "ALL_OLD",
      })
    );

    const deleteMirror = dynamoDB.send(
      new DeleteItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: eventId },
          organization: { S: "-" },
        },
        ReturnValues: "ALL_OLD",
      })
    );

    const queryFaces = dynamoDB.send(
      new QueryCommand({
        TableName: FACES_TABLE_NAME as string,
        KeyConditionExpression: "eventId = :eventId",
        ExpressionAttributeValues: {
          ":eventId": { S: eventId },
        },
      })
    );

    const [deletedItem, faceItems] = await Promise.all([deleteOriginal, queryFaces, deleteMirror]);
    console.log("deleted event from dynamodb");

    const faceItemsToDelete = faceItems.Items?.map((item) => item.id.S);
    if (faceItemsToDelete?.length) {
      await batchDeleteFaces(faceItemsToDelete, FACES_TABLE_NAME as string, eventId);
      console.log("deleted faces from dynamodb");
    }

    await Promise.all([rekognition.send(new DeleteCollectionCommand({ CollectionId: eventId }))]);
    console.log("deleted event from rekognition");

    const smallListParams = {
      Bucket: PHOTO_BUCKET,
      Prefix: `small/${organization}/${eventId}/`,
    };
    const mediumListParams = {
      Bucket: PHOTO_BUCKET,
      Prefix: `medium/${organization}/${eventId}/`,
    };
    const originalListParams = {
      Bucket: PHOTO_BUCKET,
      Prefix: `original/${organization}/${eventId}/`,
    };
    console.log("calling s3 with list params", mediumListParams, originalListParams);
    const [smallListResponse, mediumListResponse, originalListResponse] = await Promise.all([
      s3Client.send(new ListObjectsV2Command(smallListParams)),
      s3Client.send(new ListObjectsV2Command(mediumListParams)),
      s3Client.send(new ListObjectsV2Command(originalListParams)),
    ]);
    const fullList = [
      ...(smallListResponse.Contents || []),
      ...(mediumListResponse.Contents || []),
      ...(originalListResponse.Contents || []),
    ];
    console.log("got response from s3, list length:", fullList.length);
    if (fullList.length > 0) {
      const objectsToDelete = fullList.map((object) => ({
        Key: object.Key,
      }));

      const deleteResponse = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: PHOTO_BUCKET,
          Delete: {
            Objects: objectsToDelete,
          },
        })
      );
      console.log("Objects deleted from s3:", deleteResponse.Deleted?.length);
    } else {
      console.log("No objects to delete from s3");
    }

    return buildResponse(JSON.stringify({ message: "Event deleted successfully" }), 200);
  } catch (error) {
    console.error("Error:", error);
    return buildResponse(JSON.stringify({ message: "An error occurred" }), 500);
  }
};

export const handler = validateCsrf(
  validatePermissions(deleteEventLambda, Permission.MANAGE_EVENTS)
);
