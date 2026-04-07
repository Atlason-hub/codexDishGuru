export type Company = {
  id: string;
  companyKey: string;
  name: string;
  domain: string;
  orderVendor: OrderVendor;
  streetId?: number | null;
  street: string;
  number: string;
  cityId: number;
  cityName: string;
  logoUrl?: string;
};

export type OrderVendor = "10bis" | "Cibus" | "Wolt" | "Other";

export type CompanyRow = {
  id: string;
  company_key: string;
  name: string;
  domain: string;
  order_vendor?: OrderVendor | null;
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
