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
  notes: string | null
  created_at: string
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
