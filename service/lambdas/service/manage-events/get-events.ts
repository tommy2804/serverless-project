import {
  DynamoDB,
  QueryCommand,
  BatchGetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import { EventImagesStatus } from "../../../interfaces";

const { REGION, TABLE_NAME } = process.env;
const dynamoDB = new DynamoDB({ region: REGION });

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    console.log("Start get events");
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];

    console.log("calling db with params");
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME as string,
        KeyConditionExpression: "#itemOrg = :organization",
        ExpressionAttributeNames: {
          "#itemOrg": "organization",
          "#location": "location",
          "#name": "name",
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: {
          ":organization": { S: organization },
        },
        ProjectionExpression:
          "id, #name, event_date, logo, giftRoot, number_of_photos, total_photos, photos_process, #location, username, time_created, photographer_name, imagesStatus, missingPhotos, lastUpdated, logoVersion, #ttl",
      })
    );
    console.log("got response from db");
    const unmarshalledItems = result.Items?.map((item) => unmarshall(item));

    // write processPhotos to totalPhotos
    const completedEvents = unmarshalledItems?.filter(
      (item) =>
        item.photos_process?.length > 0 &&
        item.imagesStatus === EventImagesStatus.DONE &&
        item.lastUpdated < Date.now() - 1000 * 60 * 3
    );
    if (completedEvents?.length) {
      const updatePromises = completedEvents?.map(async (item): Promise<any> => {
        return dynamoDB.send(
          new UpdateItemCommand({
            TableName: TABLE_NAME as string,
            Key: {
              id: { S: item.id },
              organization: { S: organization },
            },
            UpdateExpression:
              "SET total_photos = total_photos + :photos_process_length, photos_process = :photos_process, tokens = :tokens, number_of_photos = :zero",
            ExpressionAttributeValues: {
              ":photos_process_length": { N: item.photos_process?.length.toString() },
              ":photos_process": { L: [] },
              ":tokens": { L: [] },
              ":zero": { N: "0" },
            },
          })
        );
      });
      updatePromises && (await Promise.all(updatePromises));
    }

    const unCompletedUploads = unmarshalledItems?.filter(
      (item) =>
        item.imagesStatus === EventImagesStatus.UPLOADING &&
        item.lastUpdated < Date.now() - 1000 * 60 * 3
    ); // every photo presign updtate lastUpdated, so if lastUpdated is older than 3 min, it means that the upload was suspended
    if (unCompletedUploads?.length) {
      const uncompletedEvents = await dynamoDB.send(
        new BatchGetItemCommand({
          RequestItems: {
            [TABLE_NAME as string]: {
              Keys: unCompletedUploads.map((item) => ({
                id: { S: item.id },
                organization: { S: organization },
              })),
              ProjectionExpression: "id, photos_process",
            },
          },
        })
      );
      const uncompletedEventsUnmarshalled = uncompletedEvents.Responses?.[
        TABLE_NAME as string
      ]?.map((item) => unmarshall(item));
      // add diffs of photo not uploaded to orinal events
      const updatePromises = unmarshalledItems
        ?.filter((item) => item.imagesStatus === EventImagesStatus.UPLOADING)
        ?.map(async (item): Promise<any> => {
          const uncompletedEvent = uncompletedEventsUnmarshalled?.find(
            (event) => event.id === item.id
          );
          if (uncompletedEvent) {
            console.log("event", { uncompletedEvent, item });
            console.log("photos_process", uncompletedEvent.photos_process);
            console.log("number_of_photos", item.number_of_photos);
            item.missingPhotos = item.number_of_photos - uncompletedEvent.photos_process?.length;
            console.log("missing photos", item.missingPhotos);
            const newStatus =
              item.missingPhotos === 0 ? EventImagesStatus.DONE : EventImagesStatus.SUSPENDED;
            console.log("new status", newStatus);
            return dynamoDB
              .send(
                new UpdateItemCommand({
                  TableName: TABLE_NAME as string,
                  Key: {
                    id: { S: item.id },
                    organization: { S: organization },
                  },
                  UpdateExpression:
                    "SET imagesStatus = :imagesStatus, missingPhotos = :missingPhotos", // , tokens = :photos_process',
                  ExpressionAttributeValues: {
                    ":missingPhotos": { N: (item.missingPhotos || 0).toString() },
                    ":imagesStatus": { S: newStatus },
                    // ':photos_process': {
                    //   L:
                    //     uncompletedEvent.photos_process?.map((photo: string) => ({ S: photo })) || [],
                    // },
                  },
                })
              )
              .catch((err) => console.log("error updating event", err));
          }
          return null;
        });
      updatePromises && (await Promise.all(updatePromises));
    }
    const sortedItems = unmarshalledItems?.sort((a, b) => b.time_created - a.time_created);

    return buildResponse(
      JSON.stringify({
        events: sortedItems,
      }),
      200
    );
  } catch (error) {
    console.error("Error:", error);
    return buildResponse(JSON.stringify({ message: "An error occurred" }), 500);
  }
};
