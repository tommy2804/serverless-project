import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { RestApi, Cors, CfnAuthorizer, AuthorizationType } from "aws-cdk-lib/aws-apigateway";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { runtime } from "../../service/constants";
import { createApiResource } from "./../../utils/api";
import {
  createCognitoPolicyFunction,
  createLambdaBasicRole,
  getTablePolicy,
} from "../../utils/roles-util";
import { Table } from "aws-cdk-lib/aws-dynamodb";

interface AuthConstructProps {
  usersTable: Table;
  organizationTable: Table;
  giftsTable: Table;
  userPoolId: string;
  DEFAULT_LAMBDA_ENV: any;
}

export class AuthConstruct extends Construct {
  public readonly authorizer: CfnAuthorizer;
  public readonly signUpLambda: NodejsFunction;
  public readonly signInLambda: NodejsFunction;
  public readonly signOutLambda: NodejsFunction;
  public readonly refreshLambda: NodejsFunction;
  public readonly isLoggedInLambda: NodejsFunction;
  public readonly forceChangePasswordLambda: NodejsFunction;
  public readonly verifyEmailLambda: NodejsFunction;
  public readonly resendConfirmationCodeLambda: NodejsFunction;
  public readonly forgotPasswordLambda: NodejsFunction;
  public readonly resetPasswordLambda: NodejsFunction;
  public readonly resetPasswordAuthLambda: NodejsFunction;
  public readonly refreshTokenCodeLambda: NodejsFunction;
  public readonly getUserDetailsLambda: NodejsFunction;
  public readonly getUserLambda: NodejsFunction;
  public readonly getUserGiftsLambda: NodejsFunction;
  public readonly getUserOrganizationsLambda: NodejsFunction;
  public readonly getUserGiftsForOrganizationLambda: NodejsFunction;

  constructor(scope: Construct, id: string, authConstructProps: AuthConstructProps) {
    super(scope, id);
    const stack = Stack.of(this);

    const { usersTable, organizationTable, giftsTable, userPoolId, DEFAULT_LAMBDA_ENV } =
      authConstructProps;

    const USERS_TABLE_NAME = usersTable.tableName;
    const ORGANIZATION_TABLE_NAME = organizationTable.tableName;
    const GIFT_EVENTS_TABLE_NAME = giftsTable.tableName;

    const userPoolArn = `arn:aws:cognito-idp:${stack.region}:${stack.account}:userpool/${userPoolId}`;

    const createCognitoPolicy = createCognitoPolicyFunction(
      stack.region,
      stack.account,
      userPoolId
    );

    const signInLambdRole = createLambdaBasicRole(this, "SignInLambdaRole");
    signInLambdRole.addToPolicy(createCognitoPolicy(["AdminGetUser", "AdminUserGlobalSignOut"]));

    this.signUpLambda = new NodejsFunction(this, "SignUp", {
      runtime,
      entry: "service/lambdas/auth/signup.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        USERS_TABLE_NAME: USERS_TABLE_NAME,
        ORGANIZATION_TABLE_NAME: ORGANIZATION_TABLE_NAME,
      },
      memorySize: 256,
      timeout: Duration.seconds(30),
      role: signInLambdRole,
    });

    const putUsers = getTablePolicy(stack, USERS_TABLE_NAME, [
      "dynamodb:PutItem",
      "dynamodb:readItem",
    ]);
    const putOrganizations = getTablePolicy(stack, ORGANIZATION_TABLE_NAME, [
      "dynamodb:PutItem",
      "dynamodb:readItem",
    ]);
    this.signUpLambda.addToRolePolicy(putUsers);
    this.signUpLambda.addToRolePolicy(putOrganizations);

    this.signInLambda = new NodejsFunction(this, "SignIn", {
      runtime,
      entry: "service/lambdas/auth/signin.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      memorySize: 256,
      timeout: Duration.seconds(30),
      role: signInLambdRole,
    });

    const forceChangePasswordLambdRole = createLambdaBasicRole(
      this,
      "forceChangePasswordLambdaRole"
    );
    forceChangePasswordLambdRole.addToPolicy(
      createCognitoPolicy(["AdminGetUser", "AdminInitiateAuth", "AdminRespondToAuthChallenge"])
    );

    this.forceChangePasswordLambda = new NodejsFunction(this, "ForceChangePassword", {
      runtime,
      entry: "service/lambdas/auth/forceChangePassword.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        USERS_TABLE_NAME: USERS_TABLE_NAME,
      },
      memorySize: 256,
      timeout: Duration.seconds(30),
      role: forceChangePasswordLambdRole,
    });
    const updateUserstTable = getTablePolicy(stack, USERS_TABLE_NAME, ["dynamodb:UpdateItem"]);
    this.forceChangePasswordLambda.addToRolePolicy(updateUserstTable);

    this.isLoggedInLambda = new NodejsFunction(this, "IsLoggedIn", {
      runtime,
      entry: "service/lambdas/auth/isLoggedIn.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        GIFT_EVENTS_TABLE_NAME: GIFT_EVENTS_TABLE_NAME,
      },
      memorySize: 256,
    });
    const queryGiftsTable = getTablePolicy(stack, GIFT_EVENTS_TABLE_NAME, ["dynamodb:Query"]);
    this.isLoggedInLambda.addToRolePolicy(queryGiftsTable);

    this.verifyEmailLambda = new NodejsFunction(this, "VerifyEmail", {
      runtime,
      entry: "service/lambdas/auth/verifyEmail.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: USERS_TABLE_NAME,
      },
      memorySize: 256,
      timeout: Duration.seconds(10),
    });

    const resendConfirmationCodeLambdaRole = createLambdaBasicRole(
      this,
      "ResendConfirmationCodeLambdaRole"
    );
    resendConfirmationCodeLambdaRole.addToPolicy(createCognitoPolicy(["ResendConfirmationCode"]));

    this.resendConfirmationCodeLambda = new NodejsFunction(this, "ResendConfirmationCode", {
      runtime,
      entry: "service/lambdas/auth/resendConfirmationCode.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      role: resendConfirmationCodeLambdaRole,
    });

    this.forgotPasswordLambda = new NodejsFunction(this, "ForgotPassword", {
      runtime,
      entry: "service/lambdas/auth/forgotPassword.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    this.resetPasswordLambda = new NodejsFunction(this, "ResetPassword", {
      runtime,
      entry: "service/lambdas/auth/resetPassword.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    this.resetPasswordAuthLambda = new NodejsFunction(this, "ResetPasswordAuth", {
      runtime,
      entry: "service/lambdas/auth/resetPasswordAuth.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const refreshTokenCodeLambdaRole = createLambdaBasicRole(this, "RefreshTokenLambdaRole");
    refreshTokenCodeLambdaRole.addToPolicy(createCognitoPolicy(["AdminUserGlobalSignOut"]));

    this.refreshTokenCodeLambda = new NodejsFunction(this, "RefreshToken", {
      runtime,
      entry: "service/lambdas/auth/refreshToken.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      memorySize: 256,
      role: refreshTokenCodeLambdaRole,
    });

    this.getUserDetailsLambda = new NodejsFunction(this, "GetUserDetails", {
      runtime,
      entry: "service/lambdas/auth/get-cognito-details.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const verifyPhoneLambda = new NodejsFunction(this, "VerifyPhone", {
      runtime,
      entry: "service/lambdas/auth/verify-phone.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const signOutLambdaRole = createLambdaBasicRole(this, "SignOutLambdaRole");
    signOutLambdaRole.addToPolicy(createCognitoPolicy(["AdminUserGlobalSignOut"]));

    this.signOutLambda = new NodejsFunction(this, "SignOut", {
      runtime,
      entry: "service/lambdas/auth/signOut.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
      role: signOutLambdaRole,
    });

    const smsMfaLambda = new NodejsFunction(this, "SmsMfa", {
      runtime,
      entry: "service/lambdas/auth/sms-mfa.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const updateMfaLambda = new NodejsFunction(this, "UpdateMfa", {
      runtime,
      entry: "service/lambdas/auth/update-mfa.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });

    const updatePhoneLambda = new NodejsFunction(this, "UpdatePhone", {
      runtime,
      entry: "service/lambdas/auth/update-phone.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
      },
    });
    // wafConstruct.applyWafToApiGw(this, authApi, "Auth");

    // createApiResource(authRoute, 'POST', smsMfaLambda, 'smsMfa');
    // createApiResource(authRoute, 'POST', updateMfaLambda, 'updateMfa', authorizer);
    // createApiResource(authRoute, 'POST', updatePhoneLambda, 'updatePhone', authorizer);
    // createApiResource(authRoute, 'POST', verifyPhoneLambda, 'verifyPhone', authorizer);
  }
}
