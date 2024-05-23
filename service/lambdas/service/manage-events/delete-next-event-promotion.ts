import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { Permission } from "../../../interfaces";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const { REGION, TABLE_NAME, BUCKET_NAME } = process.env;
const dynamoDBClient = new DynamoDBClient({ region: REGION });
const s3Client = new S3Client({ region: process.env.REGION });

const removeNextEventPromotionLambda = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const eventId = event.queryStringParameters?.eventId;
    if (!eventId) {
      console.log("missing eventId");
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "missing eventId",
        }),
        400
      );
    }
    const removeNextEvent = dynamoDBClient.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: {
          id: { S: eventId },
          organization: { S: organization },
        },
        UpdateExpression: "REMOVE #nextEvent",
        ExpressionAttributeNames: {
          "#nextEvent": "nextEventPromotion",
        },
      })
    );

    const deleteFromS3 = s3Client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: ["original", "resized"].map((size) => ({
            Key: `organization-assets/${size}/${organization}/${eventId}/next-event-logo`,
          })),
        },
      })
    );
    await Promise.all([removeNextEvent, deleteFromS3]);
    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: "successfully deleted next event promotion",
      }),
      200
    );
  } catch (error: unknown) {
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
  validatePermissions(removeNextEventPromotionLambda, Permission.MANAGE_EVENTS)
);
