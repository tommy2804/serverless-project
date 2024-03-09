import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  ID_TOKEN_KEY,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN,
  XSRF_TOKEN_KEY,
  UserStatus,
} from "../../constants";
import { JwtPayload, decode } from "jsonwebtoken";
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
  AdminGetUserCommand,
  InitiateAuthCommand,
  AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { TOMMY_ENV, getDomainByEnv } from "../../../utils/env-utils";
import { buildResponse } from "../../utils";

const { USER_POOL_ID, CLIENT_APP_ID, REGION, DEPLOY_ENV } = process.env;
const domain = getDomainByEnv(DEPLOY_ENV as TOMMY_ENV);

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

export const handler = async function (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const { username, password } = JSON.parse(event.body as string);
    if (!username || !password) {
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

    const user = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID as string,
        Username: lowerUsername as string,
      })
    );
    const userStatus = user?.UserStatus;
    if (userStatus === UserStatus.UNCONFIRMED) {
      return buildResponse(
        JSON.stringify({
          success: false,
          err: false,
          action: UserStatus.UNCONFIRMED,
          destination: user.UserAttributes?.find((attr: AttributeType) => attr.Name === "email")
            ?.Value,
          message: "User must confirm his email before sign in",
        })
      );
    }
    const response = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: CLIENT_APP_ID as string,
        AuthParameters: {
          USERNAME: lowerUsername as string,
          PASSWORD: password as string,
        },
      })
    );
    console.log("USER_PASSWORD_AUTH process got response", response);
    if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      return buildResponse(
        JSON.stringify({
          success: false,
          err: false,
          action: UserStatus.FORCE_CHANGE_PASSWORD,
          message: "User must change password before sign in",
        })
      );
    }
    if (response.ChallengeName === "SMS_MFA") {
      return buildResponse(
        JSON.stringify({
          success: false,
          err: false,
          action: UserStatus.CONFIRM_MFA,
          destination: response.ChallengeParameters?.CODE_DELIVERY_DESTINATION,
          message: "User must confirm MFA before sign in",
          session: response.Session,
        })
      );
    }

    const expiration = user.UserAttributes?.find(
      (attr: AttributeType) => attr.Name === "custom:expiration"
    )?.Value;
    if (expiration) {
      const expirationDate = new Date(expiration);
      const now = new Date();
      if (now > expirationDate) {
        const command = new AdminUserGlobalSignOutCommand({
          UserPoolId: USER_POOL_ID as string,
          Username: lowerUsername as string,
        });
        await cognitoClient.send(command);
        return buildResponse(
          JSON.stringify({
            success: false,
            err: false,
            action: UserStatus.EXPIRED,
            message: "User is expired",
          }),
          401
        );
      }
    }

    const idToken = response.AuthenticationResult?.IdToken;
    const refreshToken = response.AuthenticationResult?.RefreshToken;
    const accessToken = response.AuthenticationResult?.AccessToken;
    const payload = decode(idToken as string) as JwtPayload;
    const csrfToken = payload[XSRF_TOKEN_KEY];

    return buildResponse(
      JSON.stringify({ success: true }),
      200,
      {},
      {
        "Set-Cookie": [
          `${ID_TOKEN_KEY}=${idToken}; domain=.${domain}; path=/; secure; HttpOnly; SameSite=Strict`,
          `${ACCESS_TOKEN_KEY}=${accessToken}; domain=.${domain}; path=/; secure; HttpOnly; SameSite=Strict`,
          `${REFRESH_TOKEN}=${refreshToken}; domain=.${domain}; path=/auth/refreshToken; secure; HttpOnly; SameSite=Strict`,
          `${XSRF_TOKEN_KEY}=${csrfToken}; domain=.${domain}; path=/; secure; SameSite=Strict`,
        ],
      }
    );
  } catch (err: any) {
    console.log(err, "from catch");
    if (err.code === "NotAuthorizedException" || err.code === "UserNotFoundException") {
      return buildResponse(
        JSON.stringify({
          success: false,
          err: false,
          message: "Wrong username or password",
          code: "NotAuthorizedException", // client should not know if user exists
        }),
        401
      );
    }
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: "Error in sign in proccess",
      }),
      502
    );
  }
};
