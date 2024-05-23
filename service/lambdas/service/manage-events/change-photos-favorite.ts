import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { Permission } from "../../../interfaces";

const { REGION, TABLE_NAME } = process.env;
const dynamoDBClient = new DynamoDBClient({ region: REGION });

const setEventFavoritePhotosLambda = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const { eventId, photosToAdd, photosToRemove } = JSON.parse(event.body as string);
    const change = photosToAdd ? "add" : "remove";
    const photos = photosToAdd || photosToRemove;
    if (!eventId || !photos) {
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
    if (
      !Array.isArray(photos) ||
      photos.length === 0 ||
      photos.length > 20 ||
      !photos.every(
        (photo: string) => typeof photo === "string" && photo.length > 0 && photo.length < 200
      )
    ) {
      console.log("invalid photos");
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "invalid photos",
        }),
        400
      );
    }

    const commonParams = {
      TableName: TABLE_NAME,
      Key: {
        id: { S: eventId },
        organization: { S: organization },
      },
    };

    const eventitem = await dynamoDBClient.send(
      new GetItemCommand({
        ...commonParams,
        ProjectionExpression: "#favoritePhotos",
        ExpressionAttributeNames: {
          "#favoritePhotos": "favorite_photos",
        },
      })
    );
    const favoritePhotos = eventitem.Item?.favorite_photos.L;

    if (change === "add") {
      console.log("adding photos", photos.length);
      const updatedFavoritePhotosSet = [
        ...new Set([...(favoritePhotos?.map((photo: any) => photo.S) || []), ...photos]),
      ];
      const updatedFavoritePhotos = updatedFavoritePhotosSet.map((photo: string) => ({ S: photo }));
      await dynamoDBClient.send(
        new UpdateItemCommand({
          ...commonParams,
          UpdateExpression: `SET favorite_photos = :photos`,
          ExpressionAttributeValues: {
            ":photos": { L: updatedFavoritePhotos },
          },
        })
      );
    } else {
      console.log("removing photos", photos.length);
      const updatedFavoritePhotos = favoritePhotos?.filter(
        (photo: any) => !photos.includes(photo.S)
      );
      await dynamoDBClient.send(
        new UpdateItemCommand({
          ...commonParams,
          UpdateExpression: `SET #favoritePhotos = :photos`,
          ExpressionAttributeNames: {
            "#favoritePhotos": "favorite_photos",
          },
          ExpressionAttributeValues: {
            ":photos": { L: updatedFavoritePhotos as any[] },
          },
        })
      );
    }

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: "successfully updated favorite photos",
      }),
      200
    );
  } catch (error: any) {
    console.error("Error:", error);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Error",
      }),
      500
    );
  }
};

export const handler = validateCsrf(
  validatePermissions(setEventFavoritePhotosLambda, Permission.MANAGE_EVENTS)
);
