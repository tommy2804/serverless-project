import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new S3Client({ region: process.env.REGION });

interface IPresignedUrl {
  bucket: string;
  folderName: string;
  fileName: string;
  fileSize: number;
  prefix?: string;
}

export const createPutPresignedUrl = ({
  bucket,
  folderName,
  fileName,
  fileSize,
  prefix,
}: IPresignedUrl): Promise<string> => {
  const folderNameWithSlash = folderName ? `${folderName}/` : '';
  console.log('createPutPresignedUrl', fileSize);
  const key = `${prefix || ''}${folderNameWithSlash}${fileName}`;
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'image/jpeg',
    ContentLength: fileSize,
  });
  return getSignedUrl(client, command, {
    expiresIn: 3600,
  });
};
