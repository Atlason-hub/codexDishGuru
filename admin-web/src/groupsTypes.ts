import type { OrderVendor } from "./companiesTypes";

export type Group = {
  id: string;
  groupKey: string;
  name: string;
  joinCode: string;
  usersCount: number;
  createdAt?: string;
  orderVendor: OrderVendor;
  streetId?: number | null;
  street: string;
  number: string;
  cityId: number;
  cityName: string;
  logoUrl?: string;
};

export type GroupRow = {
  id: string;
  company_key: string;
  name: string;
  join_code: string;
  users_count?: number | null;
  created_at?: string;
  order_vendor?: OrderVendor | null;
  street_id?: number | null;
  street: string;
  number: string;
  city_id: number;
  city_name: string;
  logo_url?: string | null;
};

