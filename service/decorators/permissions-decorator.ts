import { buildResponse } from "../utils/response-util";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { decodeIdTokenFromEvent } from "../utils/token-utils";
import { Permission } from "../interfaces";

function validatePermissions(
  handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>,
  permissionRequired: Permission
) {
  return async (event: APIGatewayProxyEvent) => {
    console.log("start validate permissions");
    const decodedToken = decodeIdTokenFromEvent(event);
    const isRoot = decodedToken?.["custom:root"] === "true";
    const permissions = decodedToken?.["custom:permissions"];
    const username = decodedToken?.["cognito:username"];
    const fixedPermissions = permissions && JSON.parse(permissions);
    if (!isRoot && !fixedPermissions?.includes(permissionRequired)) {
      console.log("user is not authorized to perform this action", username, permissionRequired);
      return buildResponse(
        JSON.stringify({
          error: true,
          success: false,
          message: "You are not authorized to perform this action",
          action: permissionRequired,
        }),
        400
      );
    } else {
      return handler(event);
    }
  };
}

export default validatePermissions;
