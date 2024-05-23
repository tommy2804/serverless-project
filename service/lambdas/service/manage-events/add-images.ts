import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { buildResponse } from "../../../utils/response-util";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { EventImagesStatus, Permission } from "../../../interfaces";
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { PaymentStatus } from "../../../interfaces";
import { isNegative, isTrue } from "../../../utils/validations";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const { REGION, EVENTS_TABLE_NAME, ORGANIZATIONS_TABLE_NAME } = process.env;
const dynamoDBClient = new DynamoDBClient({ region: REGION });

const addImagesLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const { id, thtk, creditsToUse } = JSON.parse(event.body as string);
    console.log("start add images", { id, thtk, creditsToUse, organization });

    const isNegativeCreditsToUse = isNegative(creditsToUse as number, "creditsToUse");
    if (isNegativeCreditsToUse) return isNegativeCreditsToUse;
    const isMissingRequiredFields = isTrue(!id, "missing required fields");
    if (isMissingRequiredFields) return isMissingRequiredFields;

    let numberOfPhotosToCreate = 0;

    if (creditsToUse) {
      console.log("creditsToUse found");
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
      console.log("tokens removed from organization");
      numberOfPhotosToCreate += creditsToUse;
    }
    console.log("increase number of photos to create", numberOfPhotosToCreate);
    await dynamoDBClient.send(
      new UpdateItemCommand({
        TableName: EVENTS_TABLE_NAME as string,
        Key: {
          id: { S: id as string },
          organization: { S: organization as string },
        },
        UpdateExpression:
          "SET number_of_photos = number_of_photos + :numberOfPhotosToCreate, imagesStatus = :imagesStatus",
        ExpressionAttributeValues: {
          ":numberOfPhotosToCreate": { N: numberOfPhotosToCreate.toString() },
          ":imagesStatus": { S: EventImagesStatus.UPLOADING },
        },
      })
    );
    console.log("photos added to event");

    return buildResponse(
      JSON.stringify({
        success: true,
        err: false,
        numberOfPhotosToCreate,
      })
    );
  } catch (err) {
    console.log(err);
    return buildResponse(JSON.stringify({ success: false, err: true }), 502);
  }
};

export const handler = validateCsrf(validatePermissions(addImagesLambda, Permission.MANAGE_EVENTS));
