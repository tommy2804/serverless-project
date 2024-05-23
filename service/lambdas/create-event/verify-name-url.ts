import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { buildResponse } from "../../utils/response-util";

const { REGION, TABLE_NAME } = process.env;

const dynamoDB = new DynamoDBClient({ region: REGION }); // Replace with your desired region

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const nameUrl = event.queryStringParameters?.nameUrl;

  if (!nameUrl)
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing name parameter" }),
    };

  try {
    const nameUrlCheck = await dynamoDB.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: {
          id: { S: nameUrl },
          organization: { S: "-" },
        },
        ProjectionExpression: "id",
      })
    );
    const exist = nameUrlCheck.Item ? true : false;

    return buildResponse(JSON.stringify({ exist }));
  } catch (error) {
    console.error("Error:", error);
    return buildResponse(JSON.stringify({ message: "An error occurred" }), 501);
  }
};
