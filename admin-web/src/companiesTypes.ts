export type Company = {
  id: string;
  name: string;
  domain: string;
  street: string;
  number: string;
  cityId: number;
  cityName: string;
  logoUrl?: string;
};

export type CompanyRow = {
  id: string;
  name: string;
  domain: string;
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
