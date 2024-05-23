import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import validateCsrf from "../../../decorators/csrf-decorator";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import { getDomainByEnv } from "../../../../utils/env-utils";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BWIPJS = require("bwip-js");

const { BUCKET_NAME, EVENTS_TABLE_NAME, REGION, DEPLOY_ENV } = process.env;

const s3 = new S3Client({ region: REGION });
const dynamoDBClient = new DynamoDBClient({ region: REGION });

const createShareQrCodeLambda = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const { eventId } = JSON.parse(event.body || "{}");

    const domain = "localhost:5173";

    const pngBuffer = await BWIPJS.toBuffer({
      bcid: "qrcode",
      text: `https://${domain}/${eventId}`,
      scale: 10,
      paddingleft: 6,
      paddingright: 6,
      paddingtop: 6,
      paddingbottom: 6,
      backgroundcolor: "FFFFFF",
    });

    const s3Command = new PutObjectCommand({
      Bucket: BUCKET_NAME as string,
      Key: `organization-assets/qrcodes/${organization}/${eventId}/qrcode.png`,
      Body: pngBuffer,
    });

    const command = new UpdateItemCommand({
      TableName: EVENTS_TABLE_NAME,
      Key: {
        id: { S: eventId },
        organization: { S: organization },
      },
      UpdateExpression: "SET qrcode = :attrValue",
      ExpressionAttributeValues: {
        ":attrValue": { BOOL: true },
      },
    });

    await Promise.all([s3.send(s3Command), dynamoDBClient.send(command)]);

    return buildResponse(
      JSON.stringify({
        success: true,
      })
    );
  } catch (error) {
    console.error("Error generating barcode:", error);
    return buildResponse(
      JSON.stringify({
        success: false,
        err: true,
        message: "Error generating barcode",
      }),
      501
    );
  }
};

export const handler = validateCsrf(createShareQrCodeLambda);
