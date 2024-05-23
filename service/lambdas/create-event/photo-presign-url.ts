import { APIGatewayProxyEvent } from "aws-lambda";
import { buildResponse } from "../../utils/response-util";
import { createPutPresignedUrl } from "../../utils/photos-util";
import { decodeIdTokenFromEvent } from "../../utils/token-utils";
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import validateCsrf from "../../decorators/csrf-decorator";
import validatePermissions from "../../decorators/permissions-decorator";
import { Permission, PresignUrlFile } from "../../interfaces";

const { REGION, BUCKET_NAME, EVENTS_TABLE_NAME } = process.env;
const dynamoDBClient = new DynamoDBClient({ region: REGION });

const MAX_AMMOUNT = 20;

interface Result {
  success: boolean;
  err: boolean;
  fileName: string;
  reason: string;
  presignUrl: string;
}

const handleSingleFile = async (
  fileName: string,
  fileSize: number,
  eventId: string,
  organization: string,
  tableName: string
) => {
  const command = new UpdateItemCommand({
    TableName: tableName,
    Key: {
      id: { S: eventId },
      organization: { S: organization },
    },
    UpdateExpression: "SET tokens = list_append(tokens, :token), lastUpdated = :lastUpdated",
    ConditionExpression: "size(tokens) < number_of_photos AND NOT contains(tokens, :tokenstr)",
    ExpressionAttributeValues: {
      ":token": { L: [{ S: fileName }] },
      ":tokenstr": { S: fileName },
      ":lastUpdated": { N: String(new Date().getTime()) },
    },
  });
  const result = {
    success: false,
    err: false,
    fileName,
    reason: "",
    presignUrl: "",
  };
  try {
    const updateResult = await dynamoDBClient.send(command);
    console.log("Counter updated successfully:", updateResult);
    result.success = true;
  } catch (error) {
    console.error("Error updating counter:", error);
    const getCommand = new GetItemCommand({
      TableName: EVENTS_TABLE_NAME as string,
      Key: {
        id: { S: eventId },
        organization: { S: organization },
      },
    });
    const response = await dynamoDBClient.send(getCommand).catch(() => null);
    if (!response?.Item) result.err = true;
    else {
      const item = response.Item;
      console.log({ item });
      const numbrOfTokens = item.tokens?.L?.length;
      if (numbrOfTokens && Number(item.number_of_photos?.N) <= numbrOfTokens)
        result.reason = "limit";
      else if (item.tokens?.L?.some((el) => el.S === fileName)) result.reason = "duplicate";
      else result.err = true;
    }
  }
  if (result.success) {
    const presignUrl = await createPutPresignedUrl({
      bucket: BUCKET_NAME as string,
      folderName: eventId,
      fileName,
      fileSize,
      prefix: `original/${organization}/`,
    }).catch((err) => console.log(err));

    result.success = !!presignUrl;
    result.err = !presignUrl;
    result.presignUrl = presignUrl || "";
    if (!presignUrl) result.reason = "presign";
  }
  return result;
};

const photoPresignLambda = async (event: APIGatewayProxyEvent) => {
  const { files, folderName: eventId } = JSON.parse(event.body as string);
  const decodedToken = decodeIdTokenFromEvent(event);
  const organization = decodedToken?.["custom:organization"];
  if (!files || !eventId) {
    console.log("fileNames or folderName not provided", {
      files,
      eventId,
    });
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: "fileNames or folderName not provided",
      }),
      501
    );
  }

  if (!typeof Array.isArray(files) || files.length > MAX_AMMOUNT) {
    console.log("fileNames is not an array or is too long", {
      files,
    });
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: "fileNames is not an array or is too long",
      }),
      501
    );
  }
  const validFiles = files.filter(
    (file: PresignUrlFile) => file.fileName && file.fileSize && file.fileSize <= 100 * 1024 * 1024
  ); // 100MB
  if (validFiles.length === 0) {
    console.log("no valid files, no name, no size or too big", {
      files,
    });
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: "no valid files",
      }),
      501
    );
  }

  const results = [] as Result[];
  for (const file of validFiles) {
    const { fileName, fileSize } = file;
    const result = await handleSingleFile(
      fileName,
      fileSize,
      eventId,
      organization,
      EVENTS_TABLE_NAME as string
    );
    if (!result.success && result.reason === "limit") break;
    results.push(result);
  }

  return buildResponse(
    JSON.stringify({
      success: results.every((result: Result) => result.success),
      err: results.some((result: Result) => result.err),
      results,
    }),
    200
  );
};

export const handler = validateCsrf(
  validatePermissions(photoPresignLambda, Permission.CREATE_EVENTS)
);
