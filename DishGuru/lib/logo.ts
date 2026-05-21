import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGO_CACHE_KEY = 'companyLogoCache';
const SUPABASE_BASE = 'https://pcamdhbgjbsnfwicyiqa.supabase.co';

type LogoResult = {
  logoUrl: string | null;
  logoPath: string | null;
};

type CompanyLogo = LogoResult & {
  domain: string | null;
  email: string | null;
  companyId: string | null;
  orderVendor: string | null;
  matchedBy: 'domain' | 'company_id' | 'none';
  appUserCompanyId: string | null;
  companyRowLogoUrl: string | null;
};

type CompanyRow = {
  id: string;
  domain: string | null;
  logo_url: string | null;
  order_vendor: string | null;
};

let activeSessionLogoKey: string | null = null;
let activeSessionLogo: CompanyLogo | null = null;
const sessionLogoListeners = new Set<(logo: CompanyLogo | null) => void>();

const publishSessionLogo = (logo: CompanyLogo | null) => {
  sessionLogoListeners.forEach((listener) => {
    try {
      listener(logo);
    } catch {}
  });
};

const toPublicObjectUrl = (bucket: string, objectPath: string) => {
  const fallback = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return { logoUrl: fallback.data?.publicUrl ?? null, logoPath: objectPath };
};

const normalizeStorageUrl = (raw: string) => {
  if (raw.includes('/storage/v1/render/image/public/')) {
    const parts = raw.split('/storage/v1/render/image/public/');
    if (parts.length === 2) {
      const [pathPart] = parts[1].split('?');
      const segments = pathPart.split('/');
      const bucket = segments[0];
      const objectPath = segments.slice(1).join('/');
      return toPublicObjectUrl(bucket, objectPath);
    }
  }

  if (raw.includes('/storage/v1/object/public/')) {
    const parts = raw.split('/storage/v1/object/public/');
    if (parts.length === 2) {
      const [pathPart] = parts[1].split('?');
      const segments = pathPart.split('/');
      const bucket = segments[0];
      const objectPath = segments.slice(1).join('/');
      return toPublicObjectUrl(bucket, objectPath);
    }
  }

  return null;
};

const normalizeLogo = (raw: string | null | undefined): LogoResult => {
  if (!raw) return { logoUrl: null, logoPath: null };
  if (raw.startsWith('data:')) return { logoUrl: raw, logoPath: raw };
  if (raw.startsWith('//')) return { logoUrl: `https:${raw}`, logoPath: raw };
  const normalizedStorage = normalizeStorageUrl(raw);
  if (normalizedStorage) return normalizedStorage;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return { logoUrl: raw, logoPath: raw };
  if (raw.startsWith('/')) return { logoUrl: `${SUPABASE_BASE}${raw}`, logoPath: raw };
  return { logoUrl: `${SUPABASE_BASE}/${raw}`, logoPath: raw };
};

const transformLogoUrl200 = (raw: string | null | undefined): LogoResult => {
  if (!raw) return { logoUrl: null, logoPath: null };

  if (raw.includes('/api/logo?path=')) {
    const pathParam = raw.split('path=').pop();
    if (pathParam) {
      const decodedPath = decodeURIComponent(pathParam);
      return toPublicObjectUrl('company-logos', decodedPath);
    }
  }

  const normalizedStorage = normalizeStorageUrl(raw);
  if (normalizedStorage) return normalizedStorage;

  if (!raw.startsWith('http') && !raw.startsWith('//') && !raw.startsWith('/')) {
    const segments = raw.split('/');
    const bucket = segments[0] === 'companies' ? 'company-logos' : 'company-logos';
    return toPublicObjectUrl(bucket, raw);
  }

  return normalizeLogo(raw);
};

export const cacheLogo = async (value: LogoResult) => {
  await AsyncStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(value));
};

export const clearCachedLogo = async () => {
  await AsyncStorage.removeItem(LOGO_CACHE_KEY);
};

const buildScopedLogoCacheKey = (cacheKey?: string | null) =>
  cacheKey ? `${LOGO_CACHE_KEY}:${cacheKey}` : LOGO_CACHE_KEY;

export const cacheScopedLogo = async (value: LogoResult, cacheKey?: string | null) => {
  await AsyncStorage.setItem(buildScopedLogoCacheKey(cacheKey), JSON.stringify(value));
};

export const clearScopedLogo = async (cacheKey?: string | null) => {
  await AsyncStorage.removeItem(buildScopedLogoCacheKey(cacheKey));
};

export const loadCachedLogo = async (cacheKey?: string | null): Promise<LogoResult> => {
  try {
    const scopedKey = buildScopedLogoCacheKey(cacheKey);
    const raw = await AsyncStorage.getItem(scopedKey);
    if (!raw && cacheKey) {
      const fallbackRaw = await AsyncStorage.getItem(LOGO_CACHE_KEY);
      if (!fallbackRaw) return { logoUrl: null, logoPath: null };
      const parsed = JSON.parse(fallbackRaw) as LogoResult;
      return {
        logoUrl: parsed.logoUrl ? normalizeLogo(parsed.logoUrl).logoUrl : null,
        logoPath: parsed.logoPath,
      };
    }
    if (!raw) return { logoUrl: null, logoPath: null };
    const parsed = JSON.parse(raw) as LogoResult;
    return {
      logoUrl: parsed.logoUrl ? normalizeLogo(parsed.logoUrl).logoUrl : null,
      logoPath: parsed.logoPath,
    };
  } catch {
    return { logoUrl: null, logoPath: null };
  }
};

export const getEmailDomain = (value: string | null | undefined) => {
  if (!value) return null;
  const atIndex = value.lastIndexOf('@');
  if (atIndex === -1) return null;
  const domain = value.slice(atIndex + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
};

export const getLogoCacheScope = (userId: string | null, email: string | null, guestModeEnabled: boolean) => {
  if (guestModeEnabled) return 'guest';
  return getEmailDomain(email) ?? userId ?? null;
};

export const getSessionLogoKey = (userId: string | null, email: string | null) => {
  if (!userId) return null;
  return `${userId}:${email?.trim().toLowerCase() ?? ''}`;
};

const emptyCompanyLogo = (email: string | null): CompanyLogo => ({
  logoUrl: null,
  logoPath: null,
  domain: null,
  email,
  companyId: null,
  orderVendor: null,
  matchedBy: 'none',
  appUserCompanyId: null,
  companyRowLogoUrl: null,
});

const toCompanyLogo = async (
  company: CompanyRow | null,
  email: string | null,
  matchedBy: CompanyLogo['matchedBy'],
  appUserCompanyId: string | null
): Promise<CompanyLogo> => {
  if (!company) {
    const empty = emptyCompanyLogo(email);
    empty.matchedBy = matchedBy;
    empty.appUserCompanyId = appUserCompanyId;
    await cacheLogo({ logoUrl: empty.logoUrl, logoPath: empty.logoPath });
    return empty;
  }

  const result = transformLogoUrl200(company.logo_url ?? null);
  await cacheLogo(result);
  return {
    logoUrl: result.logoUrl,
    logoPath: result.logoPath,
    domain: company.domain ?? null,
    email,
    companyId: company.id ?? null,
    orderVendor: company.order_vendor ?? null,
    matchedBy,
    appUserCompanyId,
    companyRowLogoUrl: company.logo_url ?? null,
  };
};

const fetchCompanyByDomain = async (domain: string | null) => {
  if (!domain) return null;
  const { data: company } = await supabase
    .from('companies')
    .select('id, domain, logo_url, order_vendor')
    .ilike('domain', domain)
    .limit(1)
    .maybeSingle();
  return (company as CompanyRow | null) ?? null;
};

const fetchCompanyById = async (companyId: string | null) => {
  if (!companyId) return null;
  const { data: company } = await supabase
    .from('companies')
    .select('id, domain, logo_url, order_vendor')
    .eq('id', companyId)
    .maybeSingle();
  return (company as CompanyRow | null) ?? null;
};

export const resolveCompanyLogoForUser = async (
  userId: string | null,
  email: string | null
): Promise<CompanyLogo> => {
  if (!userId) {
    return emptyCompanyLogo(email);
  }

  const domain = getEmailDomain(email);
  const companyByDomain = await fetchCompanyByDomain(domain);
  if (companyByDomain) {
    return toCompanyLogo(companyByDomain, email, 'domain', null);
  }

  const { data: profile } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const appUserCompanyId = profile?.company_id ?? null;
  const companyById = await fetchCompanyById(appUserCompanyId);
  return toCompanyLogo(companyById, email, appUserCompanyId ? 'company_id' : 'none', appUserCompanyId);
};

export const primeSessionCompanyLogo = (
  userId: string | null,
  email: string | null,
  logo: CompanyLogo | null
) => {
  activeSessionLogoKey = getSessionLogoKey(userId, email);
  activeSessionLogo = logo;
  publishSessionLogo(logo);
};

export const clearSessionCompanyLogo = () => {
  activeSessionLogoKey = null;
  activeSessionLogo = null;
  publishSessionLogo(null);
};

export const getSessionCompanyLogoSnapshot = () => activeSessionLogo;

export const subscribeSessionCompanyLogo = (listener: (logo: CompanyLogo | null) => void) => {
  sessionLogoListeners.add(listener);
  return () => {
    sessionLogoListeners.delete(listener);
  };
};

export const loadSessionCompanyLogo = async (
  userId: string | null,
  email: string | null,
  options?: { forceRefresh?: boolean }
): Promise<CompanyLogo> => {
  const sessionKey = getSessionLogoKey(userId, email);
  if (!options?.forceRefresh && sessionKey && activeSessionLogoKey === sessionKey && activeSessionLogo) {
    return activeSessionLogo;
  }

  const resolved = await resolveCompanyLogoForUser(userId, email);
  primeSessionCompanyLogo(userId, email, resolved);
  return resolved;
};

export const clearPersistedLogoForIdentity = async (userId: string | null, email: string | null) => {
  const scopedKeys = new Set<string>();
  const sessionScope = getLogoCacheScope(userId, email, false);
  if (sessionScope) scopedKeys.add(sessionScope);
  if (userId) scopedKeys.add(userId);
  const domain = getEmailDomain(email);
  if (domain) scopedKeys.add(domain);

  await Promise.all([
    clearCachedLogo(),
    ...Array.from(scopedKeys).map((key) => clearScopedLogo(key)),
  ]);
};

export const fetchCompanyLogoForCurrentUser = async (): Promise<CompanyLogo> => {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id ?? null;
  const email = data.session?.user?.email ?? null;
  return loadSessionCompanyLogo(userId, email);
};

export const resolveLogoUrl = (raw: string | null | undefined) => transformLogoUrl200(raw).logoUrl;

export { normalizeLogo };
