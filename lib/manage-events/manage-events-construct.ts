import { Construct } from "constructs";
import { Stack, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { createRekognitionLambdaRole } from "../../utils/roles-util";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

interface IProps {
  eventsTable: Table;
  organizationTable: Table;
  facesTable: Table;
  photosBucket: Bucket;
  organizationAssets: Bucket;
  DEFAULT_LAMBDA_ENV: any;
}

export class ManageEventsConstruct extends Construct {
  readonly getEeventsLambda: NodejsFunction;
  readonly getSingleEventLambda: NodejsFunction;
  readonly updateEventLambda: NodejsFunction;
  readonly deleteEventLambda: NodejsFunction;
  readonly getEventRandomPhotosLambda: NodejsFunction;
  readonly createNextEventPromotionLambda: NodejsFunction;
  readonly deleteNextEventPromotionLambda: NodejsFunction;
  readonly setEventFavoritePhotosLambda: NodejsFunction;
  readonly getEventPhotosLambda: NodejsFunction;
  readonly getPhotosPublicLambda: NodejsFunction;
  readonly createShareQrCodeLambda: NodejsFunction;
  readonly deletePhotosLambda: NodejsFunction;
  readonly addImageToEventLambda: NodejsFunction;
  readonly reportedPhotosTable: Table;

  constructor(scope: Construct, id: string, props: IProps) {
    super(scope, id);
    const stack = Stack.of(this);

    const {
      eventsTable,
      facesTable,
      photosBucket,
      organizationAssets,
      organizationTable,
      DEFAULT_LAMBDA_ENV,
    } = props;

    this.reportedPhotosTable = new Table(this, "reportedPhotosTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    this.getEeventsLambda = new NodejsFunction(this, "GetEventsLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/get-events.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: eventsTable.tableName,
      },
      timeout: Duration.seconds(10),
    });
    eventsTable.grant(
      this.getEeventsLambda,
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:UpdateItem"
    );

    this.getSingleEventLambda = new NodejsFunction(this, "GetSingleEvent", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/get-single-event.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: eventsTable.tableName,
      },
      timeout: Duration.seconds(10),
    });
    eventsTable.grant(this.getSingleEventLambda, "dynamodb:GetItem");

    this.updateEventLambda = new NodejsFunction(this, "UpdateEventLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/update-event.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        EVENTS_TABLE_NAME: eventsTable.tableName,
      },
      timeout: Duration.seconds(10),
    });
    eventsTable.grant(this.updateEventLambda, "dynamodb:UpdateItem", "dynamodb:GetItem");

    this.deleteEventLambda = new NodejsFunction(this, "DeleteEventsLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/delete-event.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        EVENTS_TABLE_NAME: eventsTable.tableName,
        FACES_TABLE_NAME: facesTable.tableName,

        PHOTO_BUCKET: photosBucket.bucketName,
      },
      timeout: Duration.seconds(10),
      role: createRekognitionLambdaRole(scope, "DeleteEventRole"),
    });
    eventsTable.grant(this.deleteEventLambda, "dynamodb:DeleteItem");
    facesTable.grant(this.deleteEventLambda, "dynamodb:BatchWriteItem", "dynamodb:Query");
    photosBucket.grantReadWrite(this.deleteEventLambda);

    this.createNextEventPromotionLambda = new NodejsFunction(this, "CreateNextEventPromotion", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/next-event-promotion.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: eventsTable.tableName,
        BUCKET_NAME: organizationAssets.bucketName,
      },
      timeout: Duration.seconds(10),
    });
    eventsTable.grantWriteData(this.createNextEventPromotionLambda);

    this.deleteNextEventPromotionLambda = new NodejsFunction(this, "DeleteNextEventPromotion", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/delete-next-event-promotion.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: eventsTable.tableName,
        BUCKET_NAME: organizationAssets.bucketName,
      },
      timeout: Duration.seconds(10),
    });
    eventsTable.grant(this.deleteNextEventPromotionLambda, "dynamodb:UpdateItem");
    organizationAssets.grantWrite(this.deleteNextEventPromotionLambda);

    this.setEventFavoritePhotosLambda = new NodejsFunction(this, "SetEventFavoritePhotos", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/change-photos-favorite.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        TABLE_NAME: eventsTable.tableName,
      },
      timeout: Duration.seconds(5),
    });
    eventsTable.grant(this.setEventFavoritePhotosLambda, "dynamodb:UpdateItem", "dynamodb:GetItem");

    this.getEventRandomPhotosLambda = new NodejsFunction(this, "GetEventRandomPhotos", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/get-event-random-photos.ts",
      environment: {
        REGION: stack.region,
        PHOTO_BUCKET: photosBucket.bucketName,
      },
      timeout: Duration.seconds(10),
    });
    photosBucket.grantRead(this.getEventRandomPhotosLambda);

    this.getEventPhotosLambda = new NodejsFunction(this, "GetEventPhotosLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/get-event-photos.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        PHOTO_BUCKET: photosBucket.bucketName,
      },
      timeout: Duration.seconds(10),
    });
    photosBucket.grantRead(this.getEventPhotosLambda);

    this.getPhotosPublicLambda = new NodejsFunction(this, "getPhotosPublicLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/get-photos-public.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        PHOTO_BUCKET: photosBucket.bucketName,
        EVENTS_TABLE_NAME: eventsTable.tableName,
      },
      memorySize: 256,
      timeout: Duration.seconds(10),
    });
    photosBucket.grantRead(this.getPhotosPublicLambda);
    eventsTable.grant(this.getPhotosPublicLambda, "dynamodb:GetItem");

    this.createShareQrCodeLambda = new NodejsFunction(this, "CreateShareQrCodeLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/create-share-qrcode.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        EVENTS_TABLE_NAME: eventsTable.tableName,
        BUCKET_NAME: organizationAssets.bucketName,
      },
      timeout: Duration.seconds(10),
    });
    eventsTable.grant(this.createShareQrCodeLambda, "dynamodb:UpdateItem");
    organizationAssets.grantWrite(this.createShareQrCodeLambda);

    this.deletePhotosLambda = new NodejsFunction(this, "DeletePhotosLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/delete-photos.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        EVENTS_TABLE_NAME: eventsTable.tableName,
        PHOTO_BUCKET: photosBucket.bucketName,
        FACES_TABLE_NAME: facesTable.tableName,
      },
    });
    eventsTable.grant(this.deletePhotosLambda, "dynamodb:UpdateItem");
    facesTable.grant(this.deletePhotosLambda, "dynamodb:BatchWriteItem", "dynamodb:Query");
    photosBucket.grantWrite(this.deletePhotosLambda);

    this.addImageToEventLambda = new NodejsFunction(this, "AddImageToEventLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: "service/lambdas/service/manage-events/add-images.ts",
      environment: {
        ...DEFAULT_LAMBDA_ENV,
        EVENTS_TABLE_NAME: eventsTable.tableName,
        ORGANIZATIONS_TABLE_NAME: organizationTable.tableName,
      },
    });
    eventsTable.grant(this.addImageToEventLambda, "dynamodb:UpdateItem");
    organizationTable.grant(this.addImageToEventLambda, "dynamodb:UpdateItem");
  }
}
