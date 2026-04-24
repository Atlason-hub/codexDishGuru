import { Locale } from './locale';

export const buildAuthRedirectUrl = (locale: Locale) =>
  `dishguru://auth-callback?lang=${locale}`;

const getCombinedParams = (url: string) => {
  const combined = new URLSearchParams();
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  if (queryIndex >= 0) {
    const query = url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
    const queryParams = new URLSearchParams(query);
    queryParams.forEach((value, key) => combined.set(key, value));
  }

  if (hashIndex >= 0) {
    const hash = url.slice(hashIndex + 1);
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => combined.set(key, value));
  }

  return combined;
};

export type ParsedAuthRedirect = {
  lang: Locale | null;
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  confirmed: boolean;
  errorCode: string | null;
  errorDescription: string | null;
};

export const parseAuthRedirectUrl = (url: string): ParsedAuthRedirect => {
  const params = getCombinedParams(url);
  const lang = params.get('lang');

  return {
    lang: lang === 'en' || lang === 'he' ? lang : null,
    type: params.get('type'),
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    confirmed: params.get('confirmed') === '1',
    errorCode: params.get('error_code'),
    errorDescription: params.get('error_description'),
  };
};
