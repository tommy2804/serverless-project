import { decodeIdTokenFromEvent } from '../utils/token-utils';
import { XSRF_TOKEN_KEY } from '../constants';
import { buildResponse } from '../utils/response-util';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const getCsrfFromHeader = (event: APIGatewayProxyEvent): string | undefined => {
  console.log('start get csrf from header');
  try {
    console.log(event.headers);
    const csrfToken = event.headers[XSRF_TOKEN_KEY.toLocaleLowerCase()];
    console.log('csrfToken', csrfToken);
    return csrfToken;
  } catch (err) {
    console.log('error in csrf cookie', err);
    return '';
  }
};

const getCsrfFromIdToken = async (event: APIGatewayProxyEvent): Promise<string | null> => {
  try {
    const payload = await decodeIdTokenFromEvent(event);
    console.log('Succefully got csrf from idToken');
    return payload?.[XSRF_TOKEN_KEY];
  } catch (err) {
    console.error('erorr in decoding', err);
    return null;
  }
};

const isCsrfValid = async (event: APIGatewayProxyEvent): Promise<boolean> => {
  const csrfFromToken = await getCsrfFromIdToken(event);
  if (!csrfFromToken) return false;
  const csrfFromCookie = getCsrfFromHeader(event);
  return csrfFromCookie === csrfFromToken;
};

function validateCsrf(handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>) {
  return async (event: APIGatewayProxyEvent) => {
    const csrfValidation = await isCsrfValid(event);
    if (!csrfValidation) {
      console.log('csrf is not valid');
      return buildResponse(
        JSON.stringify({
          success: false,
          message: 'Invalid csrf token',
        }),
        400,
      );
    }
    return handler(event);
  };
}

export default validateCsrf;
