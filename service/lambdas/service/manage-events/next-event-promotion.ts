import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { Permission } from "../../../interfaces";

const { REGION, TABLE_NAME } = process.env;
const dynamoDBClient = new DynamoDBClient({ region: REGION });

const nextEventPromotionLambda = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const { nextEvent, eventId } = JSON.parse(event.body as string);
    const { name, date, location, website } = nextEvent;
    if (!name || !date || !location || !website) {
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
      [name, date, location, website].some(
        (field) => typeof field !== "string" || field.length > 50
      )
    ) {
      console.log("invalid fields");
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "Too long fields",
        }),
        400
      );
    }
    const resolvedEvent = JSON.stringify({
      name,
      date,
      location,
      website,
    });

    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        id: { S: eventId },
        organization: { S: organization },
      },
      UpdateExpression: "SET #nextEvent = :nextEventValue",
      ExpressionAttributeNames: {
        "#nextEvent": "nextEventPromotion",
      },
      ExpressionAttributeValues: {
        ":nextEventValue": { S: resolvedEvent },
      },
    });

    await dynamoDBClient.send(command);

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: "successfully updated next event promotion",
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
  validatePermissions(nextEventPromotionLambda, Permission.MANAGE_EVENTS)
);
