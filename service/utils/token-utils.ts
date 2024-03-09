import { APIGatewayProxyEvent } from 'aws-lambda';
import { JwtPayload, decode } from 'jsonwebtoken';

const decodeIdTokenFromEvent = (event: APIGatewayProxyEvent): JwtPayload | null => {
  const token = event.headers?.Authorization?.split(' ')?.[1];
  if (!token) {
    console.log('Could not fine token');
    return null;
  }
  console.log('start decode token');
  return decode(token) as JwtPayload;
};

export { decodeIdTokenFromEvent };
