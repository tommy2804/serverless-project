import { DynamoDBClient, BatchWriteItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { SQSEvent } from "aws-lambda";
import { buildResponse } from "../../../utils/response-util";

const { FACES_TABLE_NAME, REGION } = process.env;

const dynamoDBClient = new DynamoDBClient({ region: REGION });

export async function batchDeleteFaces(faceItems: any[], tableName: string) {
  const chunkSize = 25;
  for (let i = 0; i < faceItems.length; i += chunkSize) {
    const chunk = faceItems.slice(i, i + chunkSize);

    await dynamoDBClient.send(
      new BatchWriteItemCommand({
        RequestItems: {
          [tableName]: chunk.map((faceItem) => ({
            DeleteRequest: {
              Key: {
                eventId: { S: faceItem.eventId.S },
                id: { S: faceItem.id.S },
              },
            },
          })),
        },
      })
    );
  }
}

export const handler = async (event: SQSEvent) => {
  try {
    const records = event.Records;
    console.log("Start deleting faces");

    for (const record of records) {
      const recordBody = JSON.parse(record.body);
      const organizationAttributeValue = recordBody?.MessageAttributes?.organization?.Value;
      const eventIdsAttributeValue: string[] = recordBody?.MessageAttributes?.eventIds?.Value
        ? JSON.parse(recordBody?.MessageAttributes?.eventIds?.Value)
        : [];

      console.log("Organization:", organizationAttributeValue);
      console.log("Event IDs:", eventIdsAttributeValue);

      if (eventIdsAttributeValue.length > 0 && organizationAttributeValue) {
        await Promise.all(
          eventIdsAttributeValue.map(async (eventId) => {
            try {
              console.log("Event ID:", eventId);

              const faceItemsResponse = await dynamoDBClient.send(
                new QueryCommand({
                  TableName: FACES_TABLE_NAME as string,
                  KeyConditionExpression: "eventId = :eventId",
                  ExpressionAttributeValues: {
                    ":eventId": { S: eventId },
                  },
                })
              );
              console.log("Responses of the faces response", faceItemsResponse);

              const faceItems = faceItemsResponse.Items || [];

              console.log("Faces items", faceItems.length);

              await batchDeleteFaces(faceItems, FACES_TABLE_NAME as string);
              console.log("Deleted faces from table for Event ID:", eventId);
            } catch (error) {
              console.error("Error processing Event ID:", eventId, "Error:", error);
            }
          })
        );
      } else {
        console.error(
          "Organization attribute value is undefined or null or no event IDs provided."
        );
      }
    }

    console.log("Finished processing records");

    return buildResponse(JSON.stringify({ message: "Faces deleted successfully" }), 200);
  } catch (error) {
    console.error("An error occurred:", error);
    return buildResponse(JSON.stringify({ message: "Error deleting faces" }), 500);
  }
};
