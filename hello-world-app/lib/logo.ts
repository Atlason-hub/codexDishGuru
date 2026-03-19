import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGO_CACHE_KEY = 'companyLogoCache';
const SUPABASE_BASE = 'https://snbreqnndprgbfgiiynd.supabase.co';

type LogoResult = {
  logoUrl: string | null;
  logoPath: string | null;
};

type CompanyLogo = LogoResult & {
  domain: string | null;
  email: string | null;
};

const normalizeLogo = (raw: string | null | undefined): LogoResult => {
  if (!raw) return { logoUrl: null, logoPath: null };
  if (raw.startsWith('data:')) return { logoUrl: raw, logoPath: raw };
  if (raw.startsWith('//')) return { logoUrl: `https:${raw}`, logoPath: raw };
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
      const { data } = supabase.storage
        .from('companies')
        .getPublicUrl(decodedPath, { transform: { width: 200, height: 200 } });
      if (data?.publicUrl) return { logoUrl: data.publicUrl, logoPath: decodedPath };
      const fallback = supabase.storage.from('companies').getPublicUrl(decodedPath);
      return { logoUrl: fallback.data?.publicUrl ?? null, logoPath: decodedPath };
    }
  }

  if (raw.includes('/storage/v1/object/public/')) {
    const parts = raw.split('/storage/v1/object/public/');
    if (parts.length === 2) {
      const tail = parts[1];
      const segments = tail.split('/');
      const bucket = segments[1];
      const objectPath = segments.slice(2).join('/');
      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(objectPath, { transform: { width: 200, height: 200 } });
      if (data?.publicUrl) return { logoUrl: data.publicUrl, logoPath: objectPath };
      const fallback = supabase.storage.from(bucket).getPublicUrl(objectPath);
      return { logoUrl: fallback.data?.publicUrl ?? null, logoPath: objectPath };
    }
  }

  return normalizeLogo(raw);
};

const cacheLogo = async (value: LogoResult) => {
  await AsyncStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(value));
};

export const loadCachedLogo = async (): Promise<LogoResult> => {
  try {
    const raw = await AsyncStorage.getItem(LOGO_CACHE_KEY);
    if (!raw) return { logoUrl: null, logoPath: null };
    return JSON.parse(raw) as LogoResult;
  } catch {
    return { logoUrl: null, logoPath: null };
  }
};

export const fetchCompanyLogoForCurrentUser = async (): Promise<CompanyLogo> => {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  const email = data.session?.user?.email ?? null;
  if (!userId) return { logoUrl: null, logoPath: null, domain: null, email };
  const { data: profile } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();
  const companyId = profile?.company_id;
  if (!companyId) {
    return fetchLogoByDomain(email, email);
  }
  const { data: company } = await supabase
    .from('companies')
    .select('logo_url, logo, domain')
    .eq('id', companyId)
    .maybeSingle();
  const rawLogo = company?.logo_url ?? company?.logo ?? null;
  const result = transformLogoUrl200(rawLogo);
  await cacheLogo(result);
  return {
    logoUrl: result.logoUrl,
    logoPath: result.logoPath,
    domain: company?.domain ?? null,
    email,
  };
};

const fetchLogoByDomain = async (email: string | null, fallbackEmail: string | null): Promise<CompanyLogo> => {
  if (!fallbackEmail?.includes('@')) return { logoUrl: null, logoPath: null, domain: null, email: fallbackEmail };
  const domain = fallbackEmail.split('@')[1].toLowerCase();
  const { data: company } = await supabase
    .from('companies')
    .select('logo_url, logo, domain')
    .ilike('domain', domain)
    .limit(1)
    .maybeSingle();
  const rawLogo = company?.logo_url ?? company?.logo ?? null;
  const result = transformLogoUrl200(rawLogo);
  await cacheLogo(result);
  return { logoUrl: result.logoUrl, logoPath: result.logoPath, domain: company?.domain ?? null, email };
};

export { normalizeLogo };
