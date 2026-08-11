import { supabase } from '../lib/supabase';
import type {
  Company,
  CompanyWithSubscription,
  GroupedJobs,
  Job,
} from '../types/database';

/** Ensure a profiles row exists (required before inserting subscriptions). */
async function ensureProfile(userId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from('profiles').insert({ id: userId });
  if (error) {
    throw new Error(
      `Could not create profile. You may need a database trigger on auth.users — see SETUP.md. (${error.message})`,
    );
  }
}

/** Fetch all companies with the current user's subscription status. */
export async function fetchCompanies(
  userId: string,
): Promise<CompanyWithSubscription[]> {
  const [companiesResult, subsResult] = await Promise.all([
    supabase.from('companies').select('*').order('name'),
    supabase.from('subscriptions').select('company_id').eq('user_id', userId),
  ]);

  if (companiesResult.error) {
    throw new Error(companiesResult.error.message);
  }
  if (subsResult.error) {
    throw new Error(subsResult.error.message);
  }

  const subscribedIds = new Set(
    (subsResult.data ?? []).map((s) => s.company_id),
  );

  return (companiesResult.data as Company[]).map((company) => ({
    ...company,
    isSubscribed: subscribedIds.has(company.id),
  }));
}

/** Subscribe or unsubscribe the user from a company. */
export async function toggleSubscription(
  userId: string,
  companyId: string,
  isCurrentlySubscribed: boolean,
): Promise<void> {
  if (isCurrentlySubscribed) {
    const { error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('company_id', companyId);

    if (error) throw new Error(error.message);
    return;
  }

  await ensureProfile(userId);

  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    company_id: companyId,
  });

  if (error) throw new Error(error.message);
}

/** Fetch subscribed companies and their active job counts for the current user */
export async function fetchMyJobsOverview(userId: string) {
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('company_id, companies(id, name, careers_url)')
    .eq('user_id', userId);

  if (subsError) throw new Error(subsError.message);
  if (!subs?.length) return [];

  // Fetch company views for this user
  let viewsData: any[] | null = null;
  try {
    const { data, error } = await supabase
      .from('company_views')
      .select('company_id, last_viewed_at')
      .eq('user_id', userId);
    if (!error) viewsData = data;
  } catch (err) {
    console.log('company_views table likely does not exist yet', err);
  }

  const viewsMap: Record<string, string> = {};
  if (viewsData) {
    for (const v of viewsData) {
      viewsMap[v.company_id] = v.last_viewed_at;
    }
  }

  type SubRow = {
    company_id: string;
    companies: { id: string; name: string; careers_url?: string } | { id: string; name: string; careers_url?: string }[] | null;
  };

  const subRows = subs as SubRow[];
  const counts: Record<string, number> = {};
  const newCounts: Record<string, number> = {};

  await Promise.all(
    subRows.map(async (s) => {
      const { count, error } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', s.company_id)
        .eq('is_active', true);

      if (error) throw new Error(error.message);
      counts[s.company_id] = count ?? 0;

      const lastViewedAt = viewsMap[s.company_id];
      if (lastViewedAt) {
        const { count: newCount } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', s.company_id)
          .eq('is_active', true)
          .gt('first_seen_at', lastViewedAt);
        newCounts[s.company_id] = newCount ?? 0;
      }
    })
  );

  return subRows.map((s) => {
    const companyData = Array.isArray(s.companies) ? s.companies[0] : s.companies;
    return {
      companyId: s.company_id,
      companyName: companyData?.name ?? 'Unknown company',
      careersUrl: companyData?.careers_url ?? '',
      jobCount: counts[s.company_id] || 0,
      newJobsCount: viewsMap[s.company_id] ? (newCounts[s.company_id] || 0) : null,
      lastViewedAt: viewsMap[s.company_id] || null,
    };
  }).sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export async function fetchCompanyDetailInfo(userId: string, companyId: string) {
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (companyError) throw new Error(companyError.message);

  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (subError) throw new Error(subError.message);

  return {
    ...company,
    isSubscribed: !!sub
  } as CompanyWithSubscription;
}

export async function recordCompanyView(userId: string, companyId: string) {
  await ensureProfile(userId);

  try {
    const { error } = await supabase.from('company_views').upsert(
      {
        user_id: userId,
        company_id: companyId,
        last_viewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id, company_id' }
    );
    if (error) console.log('company_views table likely does not exist yet', error);
  } catch (e) {
    console.log('Error recording view', e);
  }
}

/** Fetch active jobs for companies the user is subscribed to, grouped by company. (Deprecated but kept if needed) */
export async function fetchMyJobs(userId: string): Promise<GroupedJobs[]> {
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('company_id, companies(id, name)')
    .eq('user_id', userId);

  if (subsError) throw new Error(subsError.message);
  if (!subs?.length) return [];

  type SubRow = {
    company_id: string;
    companies: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const subRows = subs as SubRow[];
  const companyIds = subRows.map((s) => s.company_id);
  const nameById = new Map(
    subRows.map((s) => {
      const company = Array.isArray(s.companies) ? s.companies[0] : s.companies;
      return [s.company_id, company?.name ?? 'Unknown company'] as const;
    }),
  );

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('*')
    .in('company_id', companyIds)
    .eq('is_active', true)
    .order('posted_date', { ascending: false, nullsFirst: false });

  if (jobsError) throw new Error(jobsError.message);

  const grouped = new Map<string, Job[]>();
  for (const job of (jobs ?? []) as Job[]) {
    const list = grouped.get(job.company_id) ?? [];
    list.push(job);
    grouped.set(job.company_id, list);
  }

  return companyIds
    .filter((id) => grouped.has(id))
    .map((companyId) => ({
      companyId,
      companyName: nameById.get(companyId) ?? 'Unknown company',
      jobs: grouped.get(companyId) ?? [],
    }));
}

/** Fetch all active jobs for a single company bypassing the 1000 default limit */
export async function fetchCompanyJobs(companyId: string): Promise<Job[]> {
  const allJobs: Job[] = [];
  let from = 0;
  const step = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('posted_date', { ascending: false, nullsFirst: false })
      .range(from, from + step - 1);

    if (error) throw new Error(error.message);

    if (data && data.length > 0) {
      allJobs.push(...(data as Job[]));
      from += step;
      if (data.length < step) {
        keepFetching = false;
      }
    } else {
      keepFetching = false;
    }
  }

  return allJobs;
}

/** Set application status for a job (upsert) */
export async function setApplicationStatus(
  userId: string,
  jobId: string,
  status: 'applied' | 'interviewing' | 'rejected',
): Promise<void> {
  await ensureProfile(userId);

  // Note: we update the updated_at timestamp manually since we're using a single upsert
  const { error } = await supabase.from('applications').upsert(
    {
      user_id: userId,
      job_id: jobId,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id, job_id' }
  );

  if (error) throw new Error(error.message);
}

/** Clear application status for a job (delete) */
export async function clearApplicationStatus(userId: string, jobId: string): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('user_id', userId)
    .eq('job_id', jobId);

  if (error) throw new Error(error.message);
}

/** Fetch user's tracked applications grouped by status */
export async function fetchMyApplications(userId: string) {
  const { data, error } = await supabase
    .from('applications')
    .select(
      `
      id,
      status,
      job:jobs (
        id,
        title,
        location,
        url,
        company:companies(name)
      )
    `
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  // Parse and group by status
  const grouped: Record<string, any[]> = {
    applied: [],
    interviewing: [],
    rejected: [],
  };

  for (const row of data || []) {
    // The foreign key relationships can sometimes wrap in arrays if not perfectly one-to-one or based on PostgREST shape
    const jobData = Array.isArray(row.job) ? row.job[0] : row.job;
    const companyData = Array.isArray(jobData?.company) ? jobData.company[0] : jobData?.company;

    if (row.status && grouped[row.status] && jobData) {
      grouped[row.status].push({
        applicationId: row.id,
        status: row.status,
        job: jobData,
        companyName: companyData?.name ?? 'Unknown company',
      });
    }
  }

  return grouped;
}

export interface DiscoverAnalytics {
  newJobsCount: number;
  newCompaniesCount: number;
  recentJobs: {
    id: string;
    title: string;
    companyName: string;
    first_seen_at: string;
  }[];
}

export async function fetchLatestSyncTime(): Promise<string | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('last_scraped_at')
    .order('last_scraped_at', { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) return null;
  return data?.[0]?.last_scraped_at ?? null;
}

export async function fetchDiscoverAnalytics(): Promise<DiscoverAnalytics> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startIso = sevenDaysAgo.toISOString();

  const { count: newJobsCount, error: countError } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .gte('first_seen_at', startIso)
    .eq('is_active', true);

  if (countError) throw new Error(`jobs count error: ${countError.message}`);

  // Cleanest efficient approach for unique companies without fetching: 
  // We use PostgREST's inner join capability to count distinct companies 
  // that have at least one matching active job today.
  const { count: newCompaniesCount, error: compError } = await supabase
    .from('companies')
    .select('id, jobs!inner(id)', { count: 'exact', head: true })
    .gte('jobs.first_seen_at', startIso)
    .eq('jobs.is_active', true);

  if (compError) throw new Error(`companies count error: ${compError.message}`);

  const { data: recentJobsData, error: recentError } = await supabase
    .from('jobs')
    .select('id, title, first_seen_at, company:companies(name)')
    .eq('is_active', true)
    .order('first_seen_at', { ascending: false })
    .limit(5);

  if (recentError) throw new Error(recentError.message);

  const recentJobs = (recentJobsData || []).map((row: any) => {
    const companyData = Array.isArray(row.company) ? row.company[0] : row.company;
    return {
      id: row.id,
      title: row.title,
      companyName: companyData?.name ?? 'Unknown company',
      first_seen_at: row.first_seen_at,
    };
  });

  return {
    newJobsCount: newJobsCount ?? 0,
    newCompaniesCount: newCompaniesCount ?? 0,
    recentJobs,
  };
}
