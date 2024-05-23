import validateCsrf from "../../../decorators/csrf-decorator";
import validatePermissions from "../../../decorators/permissions-decorator";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { buildResponse } from "../../../utils/response-util";
import { decodeIdTokenFromEvent } from "../../../utils/token-utils";
import { Actions, EventsLimitType, Permission, GIFT_EVENT_STATUS } from "../../../interfaces";
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  UpdateItemCommandInput,
  BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { createCollectionWithNameFallBack } from "../../../utils/rekognition-util";
import { EVENTS_RETENTION_DAYS } from "../../../../lib/constants/events";
import { CreateEventDTO, PaymentStatus, EventImagesStatus } from "../../../interfaces";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { isNegative, isNotExisted, isTrue, isFieldsTooLong } from "../../../utils/validations";
import { getTtlTime } from "../../../utils/date-util";
import { v4 as uuidv4 } from "uuid";

const {
  REGION,
  EVENTS_TABLE_NAME,
  CUSTOMERS_TABLE_NAME,
  ORGANIZATIONS_TABLE_NAME,
  HANDSHAKES_TABLE_NAME,
  GIFT_EVENTS_TABLE_NAME,
} = process.env;

const resolveEventWatermarkSize = (eventWatermarkSize?: number): string => {
  if (!eventWatermarkSize) return "1";
  if (typeof eventWatermarkSize !== "number") return "1";
  if (eventWatermarkSize < 0 || eventWatermarkSize > 10000) return "1";
  return eventWatermarkSize.toString();
};

const dynamoDBClient = new DynamoDBClient({ region: REGION });

const createResourcesLambda = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const decodedToken = decodeIdTokenFromEvent(event);
    const organization = decodedToken?.["custom:organization"];
    const username = decodedToken?.["cognito:username"];
    console.log("Start creating event process", { organization, username });
    const eventsLimitType = decodedToken?.["eventsLimitType"];
    const { event: Event } = JSON.parse(event.body as string);
    const {
      eventName,
      thtk,
      creditsToUse,
      giftCreditsToUse,
      eventDate,
      location,
      photographerName,
      website,
      instagram,
      facebook,
      selectedGiftEventId,
      selectedGiftEventOrgId,
      watermark,
      eventWatermarkSize,
      watermarkPosition,
      numberOfPhotos,
    } = Event as CreateEventDTO;
    let nameUrl = Event.nameUrl.trim() || uuidv4().substring(0, 8);
    console.log("event name url", nameUrl);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existNameUrl = await dynamoDBClient.send(
        new GetItemCommand({
          TableName: EVENTS_TABLE_NAME,
          Key: {
            id: { S: nameUrl },
            organization: { S: "-" },
          },
          ProjectionExpression: "id",
        })
      );
      console.log(`checking if event name url exist`);
      const exist = existNameUrl.Item;
      if (!exist) break;
      if (Event.nameUrl) {
        console.log(`event name url already exist, trying with another uuid { ${nameUrl} }`);
        nameUrl = `${Event.nameUrl}-${uuidv4().substring(0, 4)}`;
      } else {
        nameUrl = uuidv4().substring(0, 8);
      }
    }
    const isNegativeCreditsToUse = isNegative(creditsToUse as number, "creditsToUse");
    if (isNegativeCreditsToUse) return isNegativeCreditsToUse;
    const isMissingRequiredFields = isTrue(!eventName || !eventDate, "missing required fields");
    if (isMissingRequiredFields) return isMissingRequiredFields;
    const isShortFieldsTooLong = isFieldsTooLong(
      [eventName, nameUrl, location, photographerName] as string[],
      25
    );
    const isLongFieldsTooLong = isFieldsTooLong(
      [website, instagram, facebook, watermarkPosition] as string[],
      200
    );
    if (isShortFieldsTooLong || isLongFieldsTooLong)
      return isShortFieldsTooLong || (isLongFieldsTooLong as APIGatewayProxyResult);
    const nameUrlPattern = /[^A-Za-z0-9-]/;
    const isNamePattern = isTrue(
      nameUrlPattern.test(nameUrl),
      "Event Url Name includes forbidden chars"
    );
    if (isNamePattern) return isNamePattern as APIGatewayProxyResult;

    let numberOfPhotosToCreate = 0;

    // let coupon: Coupon | undefined;
    // if (couponId) {
    //   console.log("found coupon id", couponId);
    //   const couponRecord = await dynamoDBClient.send(
    //     new GetItemCommand({
    //       TableName: COUPONS_TABLE_NAME,
    //       Key: {
    //         id: { S: couponId },
    //       },
    //     })
    //   );
    //   if (couponRecord.Item) {
    //     console.log("found coupon record");
    //     coupon = unmarshall(couponRecord.Item as any) as Coupon;
    //     const { valid } = isCouponValid(coupon, organization);
    //     const { type, value } = coupon;
    //     let couponUse = false;
    //     if (valid) {
    //       if (!thtk) {
    //         // if thtk is present, the coupon is already used
    //         switch (type) {
    //           case CouponType.PHOTOS:
    //             numberOfPhotosToCreate += Math.min(value, numberOfPhotos || 0);
    //             couponUse = true;
    //             break;
    //           case CouponType.AMOUNT:
    //             const couponPhotos = Math.floor(value / PRICE_PER_PHOTO);
    //             numberOfPhotosToCreate += Math.min(couponPhotos, numberOfPhotos || 0);
    //             couponUse = true;
    //             break;
    //           default:
    //             break;
    //         }
    //         if (couponUse) await incrementCouponUses(couponId, dynamoDBClient);
    //       }
    //     }
    //   }
    // }

    let giftEventDefaults = {} as any;
    if (giftCreditsToUse && selectedGiftEventId && selectedGiftEventOrgId) {
      const isgiftCreditsToUseNegative = isNegative(giftCreditsToUse, "giftCreditsToUse");
      if (isgiftCreditsToUseNegative) return isgiftCreditsToUseNegative as APIGatewayProxyResult;

      console.log("gift event selected");
      const giftEventPromise = dynamoDBClient.send(
        new GetItemCommand({
          TableName: GIFT_EVENTS_TABLE_NAME,
          Key: {
            id: { N: String(selectedGiftEventId) },
            organization: { S: organization },
          },
        })
      );
      const giftOrganizationPromise = dynamoDBClient.send(
        new GetItemCommand({
          TableName: ORGANIZATIONS_TABLE_NAME as string,
          Key: {
            id: { S: selectedGiftEventOrgId as string },
          },
          ProjectionExpression:
            "id, #location, #name, photographerName, facebook, instagram, website, logo, mainImage",
          ExpressionAttributeNames: {
            "#location": "location",
            "#name": "name",
          },
        })
      );
      const [giftEvent, giftOrganization] = await Promise.all([
        giftEventPromise,
        giftOrganizationPromise,
      ]);

      console.log("found gift event and organization");
      const isNotExistedGiftEevent = isNotExisted(
        giftEvent.Item || giftOrganization.Item,
        "giftEvent",
        "gift event not found or not belong to organization"
      );
      if (isNotExistedGiftEevent) return isNotExistedGiftEevent as APIGatewayProxyResult;

      const { root, tokens, status } = unmarshall(giftEvent.Item as any);
      numberOfPhotosToCreate += Math.min(Number(tokens), giftCreditsToUse || 0);

      const isGiftEventActive = isTrue(
        status !== GIFT_EVENT_STATUS.ACTIVE,
        "gift event not active"
      );
      if (isGiftEventActive) return isGiftEventActive as APIGatewayProxyResult;
      const isGiftBelongToOrganization = isTrue(
        root !== selectedGiftEventOrgId,
        "gift event not belong to organization"
      );
      if (isGiftBelongToOrganization) return isGiftBelongToOrganization as APIGatewayProxyResult;
      const isNotEnoughTokens = isTrue(
        tokens < giftCreditsToUse,
        "not enough tokens in gift event"
      );
      if (isNotEnoughTokens) return isNotEnoughTokens as APIGatewayProxyResult;

      const { name, location, photographerName, website, instagram, facebook, logo, mainImage } =
        unmarshall(giftOrganization?.Item || {});
      giftEventDefaults = {
        name,
        location,
        photographerName,
        website,
        instagram,
        facebook,
        logo,
        mainImage,
      };
      dynamoDBClient.send(
        new UpdateItemCommand({
          TableName: GIFT_EVENTS_TABLE_NAME,
          Key: {
            id: { N: String(selectedGiftEventId) },
            organization: { S: organization },
          },
          UpdateExpression: "SET tokensUsed = :tokensUsed, #status = :used",
          ConditionExpression: "#status = :active AND tokens >= :tokensUsed",
          ExpressionAttributeValues: {
            ":tokensUsed": { N: giftCreditsToUse.toString() },
            ":used": { S: GIFT_EVENT_STATUS.USED },
            ":active": { S: GIFT_EVENT_STATUS.ACTIVE },
          },
          ExpressionAttributeNames: {
            "#status": "status",
          },
        })
      );
    }

    const updateCommand: UpdateItemCommandInput = {
      TableName: CUSTOMERS_TABLE_NAME,
      Key: {
        id: { S: username },
        organization: { S: organization },
      },
      UpdateExpression:
        "SET eventsCreated = list_append(if_not_exists(eventsCreated, :emptyList), :eventId)",
      ExpressionAttributeValues: {
        ":eventId": { L: [{ S: nameUrl }] },
        ":emptyList": { L: [] }, // TODO: only for backwards compatibility, remove when all users have eventsCreated
      },
    };
    if (eventsLimitType === EventsLimitType.NUMBER)
      updateCommand.ConditionExpression = "size(eventsCreated) < eventsLimit";

    try {
      await dynamoDBClient.send(new UpdateItemCommand(updateCommand));
    } catch (err: any) {
      console.log(err, err.code);
      if (eventsLimitType === EventsLimitType.NUMBER) {
        const reason = err.code === "ConditionalCheckFailedException" ? "limit" : "unknown";
        const errorCode = err.code === "ConditionalCheckFailedException" ? 403 : 502;
        return buildResponse(
          JSON.stringify({
            success: false,
            error: true,
            message: "You have reached your limit of events",
            reason,
          }),
          errorCode
        );
      }
    }

    console.log("Start creating rekognition collection and dynamoDB record");

    if (thtk) {
      console.log("found thtk", thtk);
      const handshakeRecord = await dynamoDBClient.send(
        new GetItemCommand({
          TableName: HANDSHAKES_TABLE_NAME,
          Key: {
            thtk: { S: thtk as string },
          },
          ProjectionExpression: "tokens, #status, organization",
          ExpressionAttributeNames: {
            "#status": "status",
          },
        })
      );
      console.log("handshakeRecord", handshakeRecord.Item);
      const {
        status,
        tokens,
        organization: payOrganization,
      } = unmarshall(handshakeRecord.Item || {});
      const isPaymentReady = status === PaymentStatus.READY && payOrganization === organization;
      numberOfPhotosToCreate += isPaymentReady ? Number(tokens) : 0;
    }
    if (creditsToUse) {
      console.log("found credits to use", creditsToUse);
      // remove tokens from organization if it has enough tokens
      await dynamoDBClient.send(
        new UpdateItemCommand({
          TableName: ORGANIZATIONS_TABLE_NAME as string,
          Key: {
            id: { S: organization },
          },
          UpdateExpression: "SET #tokens = #tokens - :tokens",
          ConditionExpression: "#tokens >= :tokens AND :tokens > :zero",
          ExpressionAttributeNames: {
            "#tokens": "tokens",
          },
          ExpressionAttributeValues: {
            ":tokens": { N: creditsToUse.toString() },
            ":zero": { N: "0" },
          },
        })
      );
      numberOfPhotosToCreate += creditsToUse;
    }
    console.log("setting gift event defaults", giftEventDefaults);
    const giftFields = [
      giftEventDefaults.location && "location",
      giftEventDefaults.photographerName && "photographerName",
      giftEventDefaults.website && "website",
      giftEventDefaults.instagram && "instagram",
      giftEventDefaults.facebook && "facebook",
    ]
      .filter(Boolean)
      .map((field: string) => ({ S: field }));
    console.log("trying to create collection with name", nameUrl);
    const finalName = await createCollectionWithNameFallBack(nameUrl);
    console.log("collection created", finalName);
    const eventItem = {
      id: { S: finalName },
      organization: { S: organization },
      username: { S: username },
      name: { S: eventName },
      number_of_photos: { N: `${numberOfPhotosToCreate}` }, // represent the total number of photos was paid for this event
      total_photos: { N: "0" }, // will count the number of photos was uploaded to this event
      photos_process: { L: [] },
      tokens: { L: [] }, // will count the number of photos was uploaded to this event
      time_created: { N: Date.now().toString() },
      selfies_taken: { N: "0" },
      photos_taken: { N: "0" },
      event_date: { S: eventDate },
      location: { S: giftEventDefaults.location || location || "" },
      photographer_name: { S: giftEventDefaults.photographerName || photographerName || "" },
      favorite_photos: { L: [] },
      nextEventPromotion: { S: "" },
      website: { S: giftEventDefaults.website || website || "" },
      instagram: { S: giftEventDefaults.instagram || instagram || "" },
      facebook: { S: giftEventDefaults.facebook || facebook || "" },
      imagesStatus: { S: EventImagesStatus.UPLOADING },
      ttl: { N: getTtlTime(EVENTS_RETENTION_DAYS).toString() },
      giftId: { S: selectedGiftEventId ? `${selectedGiftEventId}` : "" },
      giftFields: { L: giftFields }, // all fields that was taken from gift
      mainImage: { BOOL: giftEventDefaults.mainImage || false },
      logo: { BOOL: giftEventDefaults.logo || false },
      watermark: { BOOL: watermark || false },
      eventWatermarkSize: { N: resolveEventWatermarkSize(eventWatermarkSize) },
      watermarkPosition: { S: watermarkPosition || "" },
      // couponId: { S: couponId || "" },
    };
    const eventMirrorItem = {
      id: { S: finalName },
      organization: { S: "-" },
      belongsTo: { S: organization },
      ttl: { N: getTtlTime(EVENTS_RETENTION_DAYS).toString() },
    };
    const activity = {
      username,
      organization,
      action: Actions.CREATE_EVENT,
      resource: eventName,
    };
    console.log("creating resources", { eventItem, eventMirrorItem, activity });
    await Promise.all([
      dynamoDBClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [EVENTS_TABLE_NAME as string]: [
              {
                PutRequest: {
                  Item: eventMirrorItem as any,
                },
              },
              {
                PutRequest: {
                  Item: eventItem as any,
                },
              },
            ],
          },
        })
      ),
    ]);
    console.log("resourced created for id", finalName);
    if (thtk) {
      const updateHandshakeCommand: UpdateItemCommandInput = {
        TableName: HANDSHAKES_TABLE_NAME,
        Key: {
          thtk: { S: thtk as string },
        },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": { S: PaymentStatus.USED },
        },
      };
      await dynamoDBClient.send(new UpdateItemCommand(updateHandshakeCommand));
    }

    return buildResponse(JSON.stringify({ success: true, eventId: finalName }));
  } catch (err) {
    console.log(err);
    return buildResponse(JSON.stringify({ success: false, err: true }), 502);
  }
};

export const handler = validateCsrf(
  validatePermissions(createResourcesLambda, Permission.CREATE_EVENTS)
);
