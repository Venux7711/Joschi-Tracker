export type StoolConsistency = 'normal' | 'soft' | 'diarrhea' | 'not_observed'
export type Appetite = 'good' | 'reduced' | 'none'
export type Activity = 'normal' | 'tired' | 'very_active'

export interface Cat {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export interface FeedingLog {
  id: string
  cat_id: string
  user_id: string
  logged_at: string
  food_brand: string
  food_type: string
  amount_grams: number | null
  treat_amount: number | null
  dry_food_amount: number | null
  extras: string | null
  notes: string | null
  created_at: string
}

export interface NutritionData {
  protein?: number    // Rohprotein %
  fat?: number        // Rohfett %
  fiber?: number      // Rohfaser %
  moisture?: number   // Feuchtigkeit %
  ash?: number        // Rohasche %
  calcium?: number    // Calcium g/kg
  phosphorus?: number // Phosphor g/kg
  sodium?: number     // Natrium g/kg
  magnesium?: number  // Magnesium g/kg
  taurine?: number    // Taurin mg/kg
}

export interface PantryItem {
  id: string
  cat_id: string
  user_id: string
  brand: string
  type: string
  quantity: number
  restock_date: string | null
  notes: string | null
  product_url: string | null
  nutrition: NutritionData | null
  created_at: string
  updated_at: string
}

export interface HealthLog {
  id: string
  cat_id: string
  user_id: string
  logged_at: string
  stool_consistency: StoolConsistency
  vomiting: boolean
  appetite: Appetite
  activity: Activity
  fur_issue: boolean
  notes: string | null
  created_at: string
}
