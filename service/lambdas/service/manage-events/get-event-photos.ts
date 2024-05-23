import { APIGatewayProxyEvent } from "aws-lambda";
import { S3Client, ListObjectsV2Command, ListObjectsV2CommandInput } from "@aws-sdk/client-s3";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";

const { REGION, PHOTO_BUCKET } = process.env;
const s3Client = new S3Client({ region: REGION });

const getPhotoId = (id?: string): string => {
  if (!id) return "";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, organization, eventId, photoId] = id.split("/");
  return photoId;
};

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    console.log("Start listing objects in S3 bucket");

    // Extract required information from the event (e.g., organization and eventId)
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const { eventId, marker } = event.queryStringParameters || {};
    if (!eventId) {
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

    const prefix = `small/${organization}/${eventId}/`;

    const listObjectsParams: ListObjectsV2CommandInput = {
      Bucket: PHOTO_BUCKET,
      Prefix: prefix,
      MaxKeys: 100,
    };
    if (marker) listObjectsParams["ContinuationToken"] = marker;

    const response = await s3Client.send(new ListObjectsV2Command(listObjectsParams));
    const photos = response.Contents
      ? response.Contents.map((object) => getPhotoId(object.Key))
      : [];
    console.log("Successfully listed objects in S3 bucket");
    console.log(response.IsTruncated, response.NextContinuationToken);

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        photos,
        lastKey: response.IsTruncated ? response.NextContinuationToken : null,
      }),
      200
    );
  } catch (error) {
    console.error("Error:", error);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "An error occurred",
      }),
      500
    );
  }
};
