import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { SQSEvent } from "aws-lambda";

import { buildResponse } from "../../../utils/response-util";

const { REGION, PHOTO_BUCKET } = process.env;

const s3Client = new S3Client({ region: REGION });

export const handler = async (event: SQSEvent) => {
  try {
    console.log("start deleting photos");
    const records = event.Records;

    for (const record of records) {
      const recordBody = JSON.parse(record.body);
      const organizationAttributeValue = recordBody?.MessageAttributes?.organization?.Value;
      const eventIdsAttributeValue: string[] = recordBody?.MessageAttributes?.eventIds?.Value
        ? JSON.parse(recordBody?.MessageAttributes?.eventIds?.Value)
        : [];

      console.log("Organization:", recordBody);

      if (eventIdsAttributeValue && organizationAttributeValue) {
        await Promise.all(
          eventIdsAttributeValue.map(async (eventId) => {
            console.log("Event ID:", eventId);

            const smallPrefix = `small/${organizationAttributeValue}/${eventId}/`;
            const mediumPrefix = `medium/${organizationAttributeValue}/${eventId}/`;
            const originalPrefix = `original/${organizationAttributeValue}/${eventId}/`;

            const listSmallObjectsParams: ListObjectsV2CommandInput = {
              Bucket: PHOTO_BUCKET,
              Prefix: smallPrefix,
            };

            const listMediumObjectsParams: ListObjectsV2CommandInput = {
              Bucket: PHOTO_BUCKET,
              Prefix: mediumPrefix,
            };

            const listOriginalObjectsParams: ListObjectsV2CommandInput = {
              Bucket: PHOTO_BUCKET,
              Prefix: originalPrefix,
            };

            const listParamsArray = [
              listSmallObjectsParams,
              listMediumObjectsParams,
              listOriginalObjectsParams,
            ];

            try {
              const responses = await Promise.all(
                listParamsArray.map((listParams) =>
                  s3Client.send(new ListObjectsV2Command(listParams))
                )
              );

              console.log("Successfully listed objects in S3 bucket");

              const deleteParamsArray = responses.map((response) => ({
                Bucket: PHOTO_BUCKET,
                Delete: {
                  Objects: response?.Contents?.map((object) => ({ Key: object.Key })) || [],
                },
              }));

              await Promise.all(
                deleteParamsArray.map((deleteParams) =>
                  s3Client.send(new DeleteObjectsCommand(deleteParams))
                )
              );

              const photoDeleted = deleteParamsArray[0]?.Delete?.Objects?.length;
              console.log("Delete objects response", photoDeleted);

              console.log("Successfully listed and deleted objects in S3 bucket for all sizes");
            } catch (error) {
              console.error("Error:", error);
              throw error;
            }
          })
        );
      } else {
        console.error("Organization attribute value or Event IDs are undefined or null.");
      }
    }

    console.log("Finished processing records");

    return buildResponse(JSON.stringify({ message: "photos deleted successfully" }), 200);
  } catch (error) {
    console.error("An error occurred:", error);
    return buildResponse(JSON.stringify({ message: "Error deleting photos" }), 500);
  }
};
