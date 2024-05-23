import { Rekognition, CreateCollectionCommand } from "@aws-sdk/client-rekognition";

const { REGION } = process.env;

const rekognition = new Rekognition({ region: REGION });

export const createCollectionWithNameFallBack = async (
  collectionId: string,
  index: number = 0
): Promise<string> => {
  try {
    await rekognition.send(
      new CreateCollectionCommand({
        CollectionId: collectionId,
      })
    );
    return collectionId;
  } catch (err: any) {
    if (JSON.stringify(err).includes("ResourceAlreadyExistsException") && index < 3) {
      console.log("collection already exist", collectionId);
      return createCollectionWithNameFallBack(collectionId + index, index + 1);
    } else {
      console.log("error creating collection", err);
      throw err;
    }
  }
};
