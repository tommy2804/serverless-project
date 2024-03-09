import { APIGatewayProxyResult } from 'aws-lambda';
import { buildResponse } from './response-util';

export const isNegative = (value: number, name: string): APIGatewayProxyResult | null => {
  if (value < 0) {
    console.log(`${name} is negative`, value);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: `${name} is negative: ${value}`,
      }),
      501,
    );
  }
  return null;
};

export const isNotExisted = (
  value: any,
  name?: string,
  message?: string,
): APIGatewayProxyResult | null => {
  const errorMessage = message || `${name} not provided`;
  if (!value) {
    console.log(errorMessage);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: errorMessage,
      }),
      501,
    );
  }
  return null;
};

export const isTrue = (value: boolean, message: string): APIGatewayProxyResult | null => {
  if (value) {
    console.log(message);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: message,
      }),
      501,
    );
  }
  return null;
};

export const isFieldsTooLong = (values: string[], length: number): APIGatewayProxyResult | null => {
  const tooLongValues = values.filter((value) => value && value.length > length);
  if (tooLongValues.length > 0) {
    console.log('Fields are too long', tooLongValues);
    return buildResponse(
      JSON.stringify({
        success: false,
        error: true,
        message: 'Fields are too long',
      }),
      501,
    );
  }
  return null;
};
