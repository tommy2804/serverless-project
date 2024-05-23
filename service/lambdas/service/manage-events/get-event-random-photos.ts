import { APIGatewayProxyEvent } from "aws-lambda";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import { getRandomPhotos } from "../../../utils/photo-utils";

const { PHOTO_BUCKET } = process.env;

const NUMBER_OF_PHOTOS = 3;

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    console.log("Start get event random photos");
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const eventId = event.queryStringParameters?.eventId || "";
    console.log({ organization, eventId });

    const randomPhotos = await getRandomPhotos(
      PHOTO_BUCKET as string,
      `small/${organization}/${eventId}/`,
      NUMBER_OF_PHOTOS
    );

    console.log("successfully retrieved random photos");

    const cacheHeaders = randomPhotos.length > 2 ? { "Cache-Control": "max-age=600" } : undefined;

    return buildResponse(
      JSON.stringify({
        randomPhotos,
      }),
      200,
      cacheHeaders
    );
  } catch (error) {
    console.error("Error:", error);
    return buildResponse(JSON.stringify({ message: "An error occurred" }), 500);
  }
};
