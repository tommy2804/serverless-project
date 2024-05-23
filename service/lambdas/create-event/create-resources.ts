import validateCsrf from "../../decorators/csrf-decorator";
import validatePermissions from "../../decorators/permissions-decorator";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { buildResponse } from "../../utils/response-util";
import { decodeIdTokenFromEvent } from "../../utils/token-utils";
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  UpdateItemCommandInput,
  BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { createCollectionWithNameFallBack } from "../../utils/rekognition-util";
import {
  CreateEventDTO,
  EventImagesStatus,
  Actions,
  EventsLimitType,
  Permission,
} from "../../interfaces";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { isNegative, isNotExisted, isTrue, isFieldsTooLong } from "../../utils/validations";
import { getTtlTime } from "../../utils/date-util";

const { REGION, EVENTS_TABLE_NAME, USERS_TABLE_NAME, ORGANIZATIONS_TABLE_NAME } = process.env;

const EVENTS_RETENTION_DAYS = 184;

const dynamoDBClient = new DynamoDBClient({ region: REGION });

const createResourcesLambda = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const username = decodedToken?.["cognito:username"];
    const eventsLimitType = decodedToken?.["eventsLimitType"];
    const { event: Event } = JSON.parse(event.body as string);
    const { eventName, nameUrl, creditsToUse, eventDate, location } = Event as CreateEventDTO;

    const existNameUrl = await dynamoDBClient.send(
      new GetItemCommand({
        TableName: EVENTS_TABLE_NAME,
        Key: {
          id: { S: nameUrl },
          organization: { S: "-" },
        },
        ProjectionExpression: "id",
      })
    );
    const exist = existNameUrl.Item;
    const isNameUrlExist = isTrue(!!exist, "event name url already exist");
    if (isNameUrlExist) return isNameUrlExist as APIGatewayProxyResult;
    const isNegativeCreditsToUse = isNegative(creditsToUse as number, "creditsToUse");
    if (isNegativeCreditsToUse) return isNegativeCreditsToUse;
    const isMissingRequiredFields = isTrue(
      !eventName || !nameUrl || !eventDate,
      "missing required fields"
    );
    if (isMissingRequiredFields) return isMissingRequiredFields;
    const isShortFieldsTooLong = isFieldsTooLong([eventName, nameUrl, location] as string[], 25);

    if (isShortFieldsTooLong) return isShortFieldsTooLong as APIGatewayProxyResult;
    const namePattern = /^[\p{L}\p{N}\s.&'\-_]+$/u;
    const nameUrlPattern = /[^A-Za-z0-9-]/;
    const isNamePattern = isTrue(
      !namePattern.test(eventName) || nameUrlPattern.test(nameUrl),
      "event name or eventUrl includes forbidden chars"
    );
    if (isNamePattern) return isNamePattern as APIGatewayProxyResult;

    let giftEventDefaults = {} as any;
    let numberOfPhotosToCreate = 0;

    console.log("found gift event and organization");

    const updateCommand: UpdateItemCommandInput = {
      TableName: USERS_TABLE_NAME,
      Key: {
        id: { S: username },
        organization: { S: organization },
      },
      UpdateExpression:
        "SET eventsCreated = list_append(if_not_exists(eventsCreated, :emptyList), :eventId)",
      ExpressionAttributeValues: {
        ":eventId": { L: [{ S: nameUrl }] },
        ":emptyList": { L: [] }, // TODO: only for backwards compatibility, remove when all users have eventsCreated
      },
    };
    if (eventsLimitType === EventsLimitType.NUMBER)
      updateCommand.ConditionExpression = "size(eventsCreated) < eventsLimit";

    try {
      await dynamoDBClient.send(new UpdateItemCommand(updateCommand));
    } catch (err: any) {
      console.log(err, err.code);
      if (eventsLimitType === EventsLimitType.NUMBER) {
        const reason = err.code === "ConditionalCheckFailedException" ? "limit" : "unknown";
        const errorCode = err.code === "ConditionalCheckFailedException" ? 403 : 502;
        return buildResponse(
          JSON.stringify({
            success: false,
            error: true,
            message: "You have reached your limit of events",
            reason,
          }),
          errorCode
        );
      }
    }

    console.log("Start creating rekognition collection and dynamoDB record");
    if (creditsToUse) {
      // remove tokens from organization if it has enough tokens
      await dynamoDBClient.send(
        new UpdateItemCommand({
          TableName: ORGANIZATIONS_TABLE_NAME as string,
          Key: {
            id: { S: organization },
          },
          UpdateExpression: "SET #tokens = #tokens - :tokens",
          ConditionExpression: "#tokens >= :tokens AND :tokens > :zero",
          ExpressionAttributeNames: {
            "#tokens": "tokens",
          },
          ExpressionAttributeValues: {
            ":tokens": { N: creditsToUse.toString() },
            ":zero": { N: "0" },
          },
        })
      );
      numberOfPhotosToCreate += creditsToUse;
    }

    const finalName = await createCollectionWithNameFallBack(nameUrl);
    console.log(organization, eventName);
    const eventItem = {
      id: { S: finalName },
      organization: { S: organization },
      username: { S: username },
      name: { S: eventName },
      number_of_photos: { N: `${numberOfPhotosToCreate}` }, // represent the total number of photos was paid for this event
      total_photos: { N: "0" }, // will count the number of photos was uploaded to this event
      photos_process: { L: [] },
      tokens: { L: [] }, // will count the number of photos was uploaded to this event
      time_created: { N: Date.now().toString() },
      selfies_taken: { N: "0" },
      photos_taken: { N: "0" },
      event_date: { S: eventDate },
      location: { S: giftEventDefaults.location || location || "" },
      imagesStatus: { S: EventImagesStatus.UPLOADING },
      ttl: { N: getTtlTime(EVENTS_RETENTION_DAYS).toString() },
      mainImage: { BOOL: giftEventDefaults.mainImage || false },
    };
    const eventMirrorItem = {
      id: { S: finalName },
      organization: { S: "-" },
      belongsTo: { S: organization },
      ttl: { N: getTtlTime(EVENTS_RETENTION_DAYS).toString() },
    };
    const activity = {
      username,
      organization,
      action: Actions.CREATE_EVENT,
      resource: eventName,
    };
    await Promise.all([
      dynamoDBClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [EVENTS_TABLE_NAME as string]: [
              {
                PutRequest: {
                  Item: eventMirrorItem as any,
                },
              },
              {
                PutRequest: {
                  Item: eventItem as any,
                },
              },
            ],
          },
        })
      ),
    ]);
    console.log("resourced created for id", finalName);

    return buildResponse(JSON.stringify({ success: true, eventId: finalName }));
  } catch (err) {
    console.log(err);
    return buildResponse(JSON.stringify({ success: false, err: true }), 502);
  }
};

export const handler = validateCsrf(
  validatePermissions(createResourcesLambda, Permission.CREATE_EVENTS)
);
