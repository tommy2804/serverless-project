import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import {
  CognitoIdentityProviderClient,
  SignUpRequest,
  SignUpCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDB, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { buildResponse } from "../../utils";

const { CLIENT_APP_ID, REGION, USERS_TABLE_NAME, MEMBERS_TABLE_NAME } = process.env;

const dynamoDB = new DynamoDB({ region: REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log("start signup");
  console.log("event", CLIENT_APP_ID, USERS_TABLE_NAME, MEMBERS_TABLE_NAME, REGION);

  const { memberName, username, email, password } = JSON.parse(event.body as string);
  console.log(" required fields", { memberName, username, email, password });

  if (!username || !email || !password) {
    console.log("Missing required fields", { memberName, username, email, password });
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Missing required fields",
      }),
      400
    );
  }
  const lowerUsername = username.toLowerCase();
  const lowerEmail = email.toLowerCase();

  // const user = await cognitoClient.send(
  //   new AdminGetUserCommand({
  //     Username: lowerUsername as string,
  //     UserPoolId: CLIENT_APP_ID,
  //   })
  // );

  // change to real function
  const exist = null;
  if (exist) {
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Username already exists",
      }),
      400
    );
  }

  const memberUuid = uuidv4();

  const signUpParams: SignUpRequest = {
    ClientId: CLIENT_APP_ID,
    Username: lowerUsername,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: lowerEmail },
      { Name: "custom:root", Value: "true" },
    ],
    ValidationData: [{ Name: "email", Value: lowerEmail }],
  };

  try {
    const signUpResponse = await cognitoClient.send(new SignUpCommand(signUpParams));
    console.log("User sign up successful:", signUpResponse.UserSub);

    const putUser = dynamoDB.send(
      new PutItemCommand({
        TableName: USERS_TABLE_NAME,
        Item: {
          id: { S: lowerUsername },
          email: { S: lowerEmail },
          member: { S: memberUuid },
          role: { S: "admin" },
          root: { BOOL: true },
          created_on: { S: new Date().toISOString() },
          eventsCreated: { L: [] },
        },
        ConditionExpression: "attribute_not_exists(id)",
      })
    );

    const putMember = dynamoDB.send(
      new PutItemCommand({
        TableName: MEMBERS_TABLE_NAME,
        Item: {
          id: { S: memberUuid },
          name: { S: username },
          rootUser: { S: lowerEmail },
          tokens: { N: "0" },
          giftsEvents: { L: [] },
        },
        ConditionExpression: "attribute_not_exists(id)",
      })
    );

    await Promise.all([putUser, putMember]);

    return buildResponse(
      JSON.stringify({
        success: true,
      })
    );
  } catch (error: any) {
    console.error("Error signing up user:", error);
    if (error.name === "InvalidPasswordException" || error.name === "UsernameExistsException") {
      return buildResponse(
        JSON.stringify({
          success: false,
          error: true,
          message: error.message,
        }),
        400
      );
    }
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
      }),
      501
    );
  }
};
