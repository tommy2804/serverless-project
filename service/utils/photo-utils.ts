import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const { REGION } = process.env;
const s3Client = new S3Client({ region: REGION });

// util function get bucket, prefix and number of photos, return random photos in bucket
export const getRandomPhotos = async (
  bucketName: string,
  folderPath: string,
  numberOfPhotos: number,
): Promise<string[]> => {
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: folderPath,
      MaxKeys: 100,
    }),
  );
  console.log('got response from s3');
  const publicObjects = response.Contents?.filter((obj) => obj.Key) || [];
  const numberOfRandomPhotos = Math.min(publicObjects.length, numberOfPhotos);
  if (publicObjects.length <= numberOfRandomPhotos) {
    return publicObjects.map((obj) => obj.Key || '');
  }

  const randomPhotos: string[] = [];
  while (randomPhotos.length < numberOfRandomPhotos && publicObjects.length > 0) {
    const randomIndex = Math.floor(Math.random() * publicObjects.length);
    const randomObject = publicObjects.splice(randomIndex, 1)[0];
    randomPhotos.push(randomObject.Key || '');
  }
  return randomPhotos;
};

export async function uploadImageToS3(imageContent: Buffer, fileName: string, buckatName: string) {
  try {
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: buckatName,
        Key: fileName,
        Body: imageContent,
      },
    });

    await upload.done();
    console.log('Image uploaded successfully to S3:', fileName);
  } catch (error) {
    console.error('Error uploading image to S3:', error);
    throw error;
  }
}
