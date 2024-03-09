import { ID_TOKEN_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN, XSRF_TOKEN_KEY } from "../../service/constants";
import { IMultiHeaders } from "../../service/utils/response-util";


export const emptyCookiesResponse = (domain: string): IMultiHeaders => ({
  'Set-Cookie': [
    `${ID_TOKEN_KEY}=; domain=.${domain}; path=/; secure; HttpOnly; SameSite=Strict; maxAge=0`,
    `${ACCESS_TOKEN_KEY}=; domain=.${domain}; path=/; secure; HttpOnly; SameSite=Strict; maxAge=0`,
    `${REFRESH_TOKEN}=; domain=.${domain}; path=/auth/refreshToken; secure; HttpOnly; SameSite=Strict; maxAge=0`,
    `${XSRF_TOKEN_KEY}=; domain=.${domain}; path=/; secure; SameSite=Strict; maxAge=0`,
  ],
});
