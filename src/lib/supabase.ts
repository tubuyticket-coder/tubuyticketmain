import { createClient } from '@supabase/supabase-js';

export const supabasePublishableKey = 'sb_publishable_hOnT2e5OCeaMHbDfaA1Q0g_vLKZnHvX';

export const supabase = createClient(
  'https://uxhtnxixwusuwnudonyf.supabase.co',
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);

export type EventRecord = {
  id: string;
  organizer_id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  cover_image_url: string | null;
  organizer_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  event_date: string;
  start_time: string;
  end_time: string | null;
  venue: string;
  town: string | null;
  county: string | null;
  location_description?: string | null;
  terms?: string | null;
  edge_function_url?: string | null;
  callback_url?: string | null;
  status: string;
};

export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  quantity_total: number;
  quantity_sold: number;
  quantity_reserved: number;
  max_per_customer: number;
  is_enabled: boolean;
  is_sold_out: boolean;
  sales_start?: string | null;
  sales_end?: string | null;
};
