import {
  BatchWriteItemCommand,
  QueryCommand,
  DynamoDBClient,
  BatchWriteItemCommandInput,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { buildResponse } from "../../../utils/response-util";
import validatePermissions from "../../../decorators/permissions-decorator";
import { Permission } from "../../../interfaces";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { RekognitionClient, DeleteCollectionCommand } from "@aws-sdk/client-rekognition";

const {
  REGION,
  EVENTS_TABLE_NAME,
  CUSTOMERS_TABLE_NAME,
  SNS_TOPIC_ARN,
  USER_POOL_ID,
  ORGANIZATIONS_TABLE_NAME,
} = process.env;

const dynamoDBClient = new DynamoDBClient({ region: REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
const rekognition = new RekognitionClient({ region: REGION });

// async function batchDelete(eventIds: string[]): Promise<void> {
//   const batchSize = 25;
//   const totalEvents = eventIds.length;

//   for (let i = 0; i < totalEvents; i += batchSize) {
//     const eventsBatch = eventIds.slice(i, i + batchSize);

//     const deleteRequests = eventsBatch.map((eventId) => ({
//       DeleteRequest: {
//         Key: {
//           id: { S: eventId },
//           organization: { S: '-' },
//         },
//       },
//     }));

//     const deleteEventsParams: BatchWriteItemCommandInput = {
//       RequestItems: {
//         [EVENTS_TABLE_NAME as string]: deleteRequests,
//       },
//     };

//     await dynamoDBClient.send(new BatchWriteItemCommand(deleteEventsParams));

//     console.log(`Batch ${i / batchSize + 1} processed successfully`);
//   }
// }

const deleteOrganizationLambda = async (event: APIGatewayProxyEvent) => {
  try {
    console.log("Start delete organization");
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];

    const organizationEventsResponse = await dynamoDBClient.send(
      new QueryCommand({
        TableName: EVENTS_TABLE_NAME as string,
        KeyConditionExpression: "organization = :organization",
        ExpressionAttributeValues: {
          ":organization": { S: organization },
        },
      })
    );

    console.log("Found events", organizationEventsResponse.Count);

    const eventsIds = JSON.stringify(
      organizationEventsResponse?.Items?.map((event) => {
        return event.id.S;
      })
    );

    const snsClient = new SNSClient({ region: REGION });

    const snsMessageAttributes = {
      eventIds: {
        DataType: "String.Array",
        StringValue: eventsIds,
      },
      organization: {
        DataType: "String",
        StringValue: organization,
      },
    };

    const response = await snsClient.send(
      new PublishCommand({
        Message: "send sns message to activate queues",
        TopicArn: SNS_TOPIC_ARN,
        MessageAttributes: snsMessageAttributes,
      })
    );

    const deleteCollectionsPromises = JSON.parse(eventsIds).map((eventId: string) =>
      rekognition.send(new DeleteCollectionCommand({ CollectionId: eventId }))
    );

    console.log("Message sent successfully:", response);

    const eventsToDelete = organizationEventsResponse.Items || [];
    const deleteEvents = eventsToDelete.map((item) => ({
      DeleteRequest: {
        Key: {
          id: { S: item.id.S },
          organization: { S: organization },
        },
      },
    }));

    const deleteEventsParams: BatchWriteItemCommandInput = {
      RequestItems: {
        [EVENTS_TABLE_NAME as string]: deleteEvents.map((deleteRequest) => ({
          DeleteRequest: {
            Key: {
              id: { S: deleteRequest.DeleteRequest.Key.id.S || "" },
              organization: { S: deleteRequest.DeleteRequest.Key.organization.S || "" },
            },
          },
        })),
      },
    };

    const deleteEventsMirrorsParams: BatchWriteItemCommandInput = {
      RequestItems: {
        [EVENTS_TABLE_NAME as string]: deleteEvents.map((deleteRequest) => ({
          DeleteRequest: {
            Key: {
              id: { S: deleteRequest.DeleteRequest.Key.id.S || "" },
              organization: { S: "-" },
            },
          },
        })),
      },
    };

    // Todo: handle more then 25 items
    await Promise.all([
      dynamoDBClient.send(new BatchWriteItemCommand(deleteEventsParams)),
      dynamoDBClient.send(new BatchWriteItemCommand(deleteEventsMirrorsParams)),
      deleteCollectionsPromises,
    ]);

    console.log("events have been deleted successfully");

    const usersRes = await dynamoDBClient.send(
      new QueryCommand({
        TableName: CUSTOMERS_TABLE_NAME as string,
        KeyConditionExpression: "organization = :organization",
        ExpressionAttributeValues: {
          ":organization": { S: organization },
        },
      })
    );

    if (usersRes.Count === 0) {
      return buildResponse(
        JSON.stringify({ message: "no users under organization to delete" }),
        200
      );
    }

    console.log("Found users", usersRes.Count);

    const usersRecords = usersRes.Items || [];

    const deleteUsers = usersRecords.map((item) => ({
      DeleteRequest: {
        Key: {
          id: { S: item.id.S || "" },
          organization: { S: organization },
        },
      },
    }));

    const deleteUsersParams: BatchWriteItemCommandInput = {
      RequestItems: {
        [CUSTOMERS_TABLE_NAME as string]: deleteUsers.map((deleteRequest) => ({
          DeleteRequest: {
            Key: {
              id: { S: deleteRequest.DeleteRequest.Key.id.S || "" },
              organization: { S: deleteRequest.DeleteRequest.Key.organization.S || "" },
            },
          },
        })),
      },
    };

    await dynamoDBClient.send(new BatchWriteItemCommand(deleteUsersParams));

    const deleteUserPromises = usersRecords.map((userItem) => {
      const username = userItem.id.S;

      if (username) {
        return cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: USER_POOL_ID as string,
            Username: username,
          })
        );
      }

      return Promise.resolve();
    });

    await Promise.all(deleteUserPromises);

    console.log("Users have been deleted successfully");

    await dynamoDBClient.send(
      new DeleteItemCommand({
        TableName: ORGANIZATIONS_TABLE_NAME as string,
        Key: {
          id: { S: organization },
        },
      })
    );
    console.error("Organization has been delete successfully");

    return buildResponse(
      JSON.stringify({
        success: true,
        error: false,
        message: "Organization deleted successfully",
      })
    );
  } catch (error) {
    console.error("Error:", error);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Error deleting organization",
      }),
      501
    );
  }
};

export const handler = validatePermissions(deleteOrganizationLambda, Permission.MANAGE_EVENTS);
