import { DynamoDB } from "aws-sdk";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Permission } from "../../../interfaces";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validateCsrf from "../../../decorators/csrf-decorator";
import { UpdateItemInput } from "aws-sdk/clients/dynamodb";
import validatePermissions from "../../../decorators/permissions-decorator";
import { UpdateEventDTO } from "../../../interfaces/event-dto";

const { EVENTS_TABLE_NAME, REGION } = process.env;

const oldDynamoDB = new DynamoDB.DocumentClient({ region: REGION });

const updateEventLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const decodedToken = decodeIdTokenFromEvent(event);
  const organization = decodedToken?.["custom:organization"];
  const { event: Event } = JSON.parse(event.body as string);
  const {
    eventId,
    eventName,
    nameUrl,
    eventDate,
    location,
    photographerName,
    website,
    instagram,
    facebook,
  } = Event as UpdateEventDTO;

  console.log("start update user");

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
  try {
    const updateExpression = [];
    const expressionAttributeValues: any = {};
    const expressionAttributeNames: any = {};

    if (eventName) {
      updateExpression.push("#eventName = :eventName");
      expressionAttributeValues[":eventName"] = eventName;
      expressionAttributeNames["#eventName"] = "name";
    }
    if (nameUrl) {
      updateExpression.push("#nameUrl = :nameUrl");
      expressionAttributeValues[":nameUrl"] = nameUrl;
      expressionAttributeNames["#nameUrl"] = "name_url";
    }

    if (eventDate) {
      updateExpression.push("#eventDate = :eventDate");
      expressionAttributeValues[":eventDate"] = eventDate;
      expressionAttributeNames["#eventDate"] = "event_date";
    }

    if (location) {
      updateExpression.push("#location = :location");
      expressionAttributeValues[":location"] = location;
      expressionAttributeNames["#location"] = "location";
    }

    if (photographerName) {
      updateExpression.push("#photographerName = :photographerName");
      expressionAttributeValues[":photographerName"] = photographerName;
      expressionAttributeNames["#photographerName"] = "photographer_name";
    }
    if (website) {
      updateExpression.push("#website = :website");
      expressionAttributeValues[":website"] = website;
      expressionAttributeNames["#website"] = "website";
    }
    if (instagram) {
      updateExpression.push("#instagram = :instagram");
      expressionAttributeValues[":instagram"] = instagram;
      expressionAttributeNames["#instagram"] = "instagram";
    }
    if (facebook) {
      updateExpression.push("#facebook = :facebook");
      expressionAttributeValues[":facebook"] = facebook;
      expressionAttributeNames["#facebook"] = "facebook";
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

    const oldDynamoDBParams: UpdateItemInput = {
      TableName: EVENTS_TABLE_NAME as string,
      Key: {
        id: { S: eventId },
        organization: { S: organization },
      },
      UpdateExpression: fixedUpdateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    };

    const newEvent = await oldDynamoDB.update(oldDynamoDBParams).promise();

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
