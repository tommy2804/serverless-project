import validateCsrf from "../../decorators/csrf-decorator";
import validatePermissions from "../../decorators/permissions-decorator";
import { APIGatewayProxyEvent } from "aws-lambda";
import { buildResponse } from "../../utils/response-util";
import { decodeIdTokenFromEvent } from "../../utils/token-utils";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { EventImagesStatus, Permission } from "../../interfaces";

const { REGION, EVENTS_TABLE_NAME } = process.env;
const dynamoDBClient = new DynamoDBClient({ region: REGION });

const finishUploadingLambda = async (event: APIGatewayProxyEvent) => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const { eventId } = JSON.parse(event.body as string);

    await dynamoDBClient.send(
      new UpdateItemCommand({
        TableName: EVENTS_TABLE_NAME,
        Key: {
          id: { S: eventId },
          organization: { S: organization },
        },
        UpdateExpression: "SET imagesStatus = :imagesStatus, missingPhotos = :missingPhotos",
        ExpressionAttributeValues: {
          ":imagesStatus": { S: EventImagesStatus.DONE },
          ":missingPhotos": { N: "0" },
        },
      })
    );

    return buildResponse(JSON.stringify({ success: true, err: false }));
  } catch (err) {
    console.log(err);
    return buildResponse(JSON.stringify({ success: false, err: true }), 502);
  }
};

export const handler = validateCsrf(
  validatePermissions(finishUploadingLambda, Permission.CREATE_EVENTS)
);
