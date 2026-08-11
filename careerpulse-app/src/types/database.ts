/** Matches the `companies` table in Supabase. */
export interface Company {
  id: string;
  name: string;
  careers_url: string;
  detected_platform: string | null;
  platform_slug: string | null;
  detection_method: 'direct_url' | 'guess_verify' | 'homepage_scan' | null;
  last_scraped_at: string | null;
  created_at: string;
}

/** Matches the `jobs` table in Supabase. */
export interface Job {
  id: string;
  company_id: string;
  external_id: string | null;
  title: string;
  location: string | null;
  department: string | null;
  url: string;
  posted_date: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
}

/** Matches the `subscriptions` table in Supabase. */
export interface Subscription {
  id: string;
  user_id: string;
  company_id: string;
  created_at: string;
}

export interface CompanyWithSubscription extends Company {
  isSubscribed: boolean;
}

export interface GroupedJobs {
  companyId: string;
  companyName: string;
  jobs: Job[];
}

export function isSupportedPlatform(
  platform: string | null,
): boolean {
  return platform !== null && platform !== 'none' && platform.trim().length > 0;
}

export type ApplicationStatus = 'applied' | 'interviewing' | 'rejected';

export interface Application {
  id: string;
  user_id: string;
  job_id: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export interface TrackedJob {
  applicationId: string;
  status: ApplicationStatus;
  job: Job;
  companyName: string;
  updated_at?: string;
}

export interface TrackedJobsGrouped {
  status: ApplicationStatus;
  jobs: TrackedJob[];
}
