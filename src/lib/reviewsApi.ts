import type { Review, ReviewDraft } from './reviews';
import { supabase } from './supabase';

// Database calls for reviews. Each returns the error and HTTP status, like recipes.ts.

export interface CallResult {
  error: unknown;
  status: number | undefined;
}

const UNIQUE_VIOLATION = '23505';

// Row-level security answers a refused update or delete with 0 rows and no error; that counts as failed.
const NO_ROWS = new Error('no rows changed');

interface ReviewRow {
  id: string;
  author_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  author: { display_name: string | null } | null;
}

export async function fetchReviews(recipeId: string): Promise<CallResult & { reviews: Review[] }> {
  const { data, error, status } = await supabase
    .from('reviews')
    .select('id,author_id,rating,body,created_at,author:profiles(display_name)')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false });
  if (error) return { reviews: [], error, status };
  const rows = (data ?? []) as unknown as ReviewRow[];
  return {
    reviews: rows.map((r) => ({
      id: r.id,
      authorId: r.author_id,
      authorName: r.author?.display_name ?? null,
      rating: r.rating,
      body: r.body,
      createdAt: r.created_at,
    })),
    error: null,
    status,
  };
}

export interface RatingSummary {
  avg: number | null;
  count: number;
}

export async function fetchRatingSummary(recipeId: string): Promise<CallResult & { summary: RatingSummary }> {
  const { data, error, status } = await supabase
    .from('recipes')
    .select('rating_avg,rating_count')
    .eq('id', recipeId)
    .maybeSingle();
  if (error) return { summary: { avg: null, count: 0 }, error, status };
  const row = data as unknown as { rating_avg: number | string | null; rating_count: number } | null;
  return {
    summary: { avg: row?.rating_avg == null ? null : Number(row.rating_avg), count: row?.rating_count ?? 0 },
    error: null,
    status,
  };
}

export type CreateResult = CallResult & { duplicate: boolean };

export async function createReview(recipeId: string, draft: ReviewDraft): Promise<CreateResult> {
  const { error, status } = await supabase
    .from('reviews')
    .insert({ recipe_id: recipeId, rating: draft.rating, body: draft.body });
  // author_id comes from the column default (auth.uid()); the policy checks it.
  const duplicate = error?.code === UNIQUE_VIOLATION;
  return { error: duplicate ? null : error, status, duplicate };
}

export async function updateReview(id: string, draft: ReviewDraft): Promise<CallResult> {
  const { data, error, status } = await supabase
    .from('reviews')
    .update({ rating: draft.rating, body: draft.body })
    .eq('id', id)
    .select('id');
  if (error) return { error, status };
  if (!data || data.length === 0) return { error: NO_ROWS, status: 200 };
  return { error: null, status };
}

export async function deleteReview(id: string): Promise<CallResult> {
  const { data, error, status } = await supabase.from('reviews').delete().eq('id', id).select('id');
  if (error) return { error, status };
  if (!data || data.length === 0) return { error: NO_ROWS, status: 200 };
  return { error: null, status };
}
