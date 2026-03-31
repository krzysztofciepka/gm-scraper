export interface ScrapeJob {
  id: string;
  city: string;
  search_query: string;
  status: "pending" | "running" | "completed" | "failed" | "blocked";
  grid_cells_total: number;
  grid_cells_completed: number;
  businesses_found: number;
  businesses_skipped: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Business {
  id: string;
  google_place_id: string;
  name: string;
  address: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  international_phone: string | null;
  website_url: string | null;
  rating: number | null;
  reviews_count: number;
  price_level: number | null;
  category: string;
  all_categories: string[];
  opening_hours: DayHours[] | null;
  temporarily_closed: boolean;
  permanently_closed: boolean;
  description: string | null;
  about: Record<string, string[]> | null;
  menu_url: string | null;
  reservation_url: string | null;
  order_url: string | null;
  owner_title: string | null;
  plus_code: string | null;
  street_view_available: boolean;
  scraped_at: string;
}

export interface DayHours {
  day: string;
  hours: string;
}

export interface BusinessPhoto {
  id: string;
  business_id: string;
  file_path: string;
  source_url: string;
  is_primary: boolean;
  order_index: number;
}

export interface BusinessReview {
  id: string;
  business_id: string;
  author: string;
  author_url: string | null;
  author_photo_url: string | null;
  rating: number;
  text: string;
  date: string;
  language: string | null;
  likes_count: number;
  owner_reply: { text: string; date: string } | null;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GridCell {
  bounds: BoundingBox;
  index: number;
}
