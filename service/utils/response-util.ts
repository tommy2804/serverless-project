import { APIGatewayProxyResult } from "aws-lambda/trigger/api-gateway-proxy";

const defaultHeaders = {
  "Content-Type": "text/plain",
  "Access-Control-Allow-Origin": "*",
};

interface IHeaders {
  [header: string]: boolean | number | string;
}

export interface IMultiHeaders {
  [header: string]: Array<boolean | number | string>;
}

const buildResponse = (
  body: string,
  statusCode: number = 200,
  additionalHeaders: IHeaders = {},
  multiValueHeaders: IMultiHeaders = {}
): APIGatewayProxyResult => ({
  statusCode,
  body,
  headers: { ...defaultHeaders, ...additionalHeaders },
  multiValueHeaders,
});

export { buildResponse };
