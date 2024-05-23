import { DynamoDB, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Permission } from "../../../interfaces";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { UpdateEventDTO } from "../../../interfaces";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const { EVENTS_TABLE_NAME, REGION } = process.env;

const dynamoDB = new DynamoDB({ region: REGION });

const updateEventLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const decodedToken = decodeIdTokenFromEvent(event);
  const organization = decodedToken?.["custom:organization"];
  const { event: Event } = JSON.parse(event.body as string);
  const {
    eventId,
    eventName,
    eventDate,
    location,
    photographerName,
    website,
    instagram,
    facebook,
    isPublicEvent,
  } = Event as UpdateEventDTO;
  console.log("start update event");

  if (!eventId) {
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Missing event id",
      }),
      400
    );
  }

  const fieldsToCheck = [
    eventName,
    eventDate,
    location,
    photographerName,
    website,
    instagram,
    facebook,
    isPublicEvent,
  ];

  const hasAtLeastOneField = fieldsToCheck.some((field) => field !== null && field !== undefined);

  if (!hasAtLeastOneField) {
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "No fields to update",
      }),
      400
    );
  }
  const fieldsTooLong = [location, photographerName, website, instagram, facebook].some(
    (field) => field && field.length > 200
  );

  if (fieldsTooLong || (eventName && eventName.length > 25)) {
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Fields too long",
      }),
      400
    );
  }

  try {
    const eventDb = await dynamoDB.send(
      new GetItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: eventId },
          organization: { S: organization },
        },
        ProjectionExpression: "giftFields",
      })
    );
    const { giftFields } = unmarshall(eventDb.Item || {});

    const updateExpression = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expressionAttributeValues: any = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expressionAttributeNames: any = {};

    if (eventName) {
      updateExpression.push("#eventName = :eventName");
      expressionAttributeValues[":eventName"] = { S: eventName };
      expressionAttributeNames["#eventName"] = "name";
    }

    if (eventDate) {
      updateExpression.push("#eventDate = :eventDate");
      expressionAttributeValues[":eventDate"] = { S: eventDate };
      expressionAttributeNames["#eventDate"] = "event_date";
    }

    if ((location || location === "") && !giftFields?.includes("location")) {
      updateExpression.push("#location = :location");
      expressionAttributeValues[":location"] = { S: location };
      expressionAttributeNames["#location"] = "location";
    }

    if (
      (photographerName || photographerName === "") &&
      !giftFields?.includes("photographerName")
    ) {
      updateExpression.push("#photographerName = :photographerName");
      expressionAttributeValues[":photographerName"] = { S: photographerName };
      expressionAttributeNames["#photographerName"] = "photographer_name";
    }
    if ((website || website === "") && !giftFields?.includes("website")) {
      updateExpression.push("#website = :website");
      expressionAttributeValues[":website"] = { S: website };
      expressionAttributeNames["#website"] = "website";
    }
    if ((instagram || instagram === "") && !giftFields?.includes("instagram")) {
      updateExpression.push("#instagram = :instagram");
      expressionAttributeValues[":instagram"] = { S: instagram };
      expressionAttributeNames["#instagram"] = "instagram";
    }
    if ((facebook || facebook === "") && !giftFields?.includes("facebook")) {
      updateExpression.push("#facebook = :facebook");
      expressionAttributeValues[":facebook"] = { S: facebook };
      expressionAttributeNames["#facebook"] = "facebook";
    }
    if (isPublicEvent !== undefined) {
      updateExpression.push("#isPublicEvent = :isPublicEvent");
      expressionAttributeValues[":isPublicEvent"] = { BOOL: isPublicEvent };
      expressionAttributeNames["#isPublicEvent"] = "isPublicEvent";
    }
    if (updateExpression.length === 0) {
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: "No fields to update",
        }),
        400
      );
    }
    const fixedUpdateExpression = `SET ${updateExpression.join(", ")}`;

    const newEvent = await dynamoDB.send(
      new UpdateItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: eventId },
          organization: { S: organization },
        },
        UpdateExpression: fixedUpdateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );
    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: "Event updated successfully",
        event: newEvent.Attributes,
      })
    );
  } catch (err) {
    console.error(err);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Error updating event",
      }),
      501
    );
  }
};

export const handler = validateCsrf(
  validatePermissions(updateEventLambda, Permission.MANAGE_EVENTS)
);
