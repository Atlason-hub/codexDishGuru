export type Company = {
  id: string;
  companyKey: string;
  name: string;
  domain: string;
  streetId?: number | null;
  street: string;
  number: string;
  cityId: number;
  cityName: string;
  logoUrl?: string;
};

export type CompanyRow = {
  id: string;
  company_key: string;
  name: string;
  domain: string;
  street_id?: number | null;
  street: string;
  number: string;
  city_id: number;
  city_name: string;
  logo_url?: string | null;
  created_at?: string;
};

export type CityOption = {
  Id: number;
  Name: string;
  IsBigCity: boolean;
};

export type StreetOption = {
  Id: number;
  Name: string;
};
