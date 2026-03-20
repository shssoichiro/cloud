'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatDollars,
  formatIsoDateString_UsaDateOnlyFormat,
  fromMicrodollars,
  formatLargeNumber,
} from '@/lib/utils';
import { useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StreakCalendar } from '@/components/profile/StreakCalendar';
import { UsageWarning } from '@/components/usage/UsageWarning';
import type { UsageTableColumn, UsageTableRow } from '@/components/usage/UsageTableBase';
import { UsageTableBase } from '@/components/usage/UsageTableBase';
import { PageLayout } from '@/components/PageLayout';
import { extractRepoFromGitUrl } from '@/components/cloud-agent/utils/git-utils';
import { formatDate, formatRelativeTime } from '@/lib/admin-utils';

import { useTRPC } from '@/lib/trpc/utils';

type Period = 'week' | 'month' | 'year' | 'all';

type UsageData = {
  date: string;
  model?: string;
  total_cost: number;
  request_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_write_tokens: number;
  total_cache_hit_tokens: number;
};

type UsageResponse = {
  usage: UsageData[];
};

type UsageTab = 'overview' | 'sessions';

type SessionUsageTableRow = UsageTableRow & {
  id: string;
  sessionId: string | null;
  source: string | null;
  lastUsedAt: string;
  title: string | null;
  createdOnPlatform: string | null;
  gitUrl: string | null;
  organizationId: string | null;
  cost: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheHits: number;
};

const tabTriggerClass =
  'text-muted-foreground hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-0 py-3 text-sm font-medium transition-colors data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none';

function isSessionUsageTableRow(row: UsageTableRow): row is SessionUsageTableRow {
  return (
    typeof row.id === 'string' &&
    'sessionId' in row &&
    (typeof row.sessionId === 'string' || row.sessionId === null) &&
    'source' in row &&
    (typeof row.source === 'string' || row.source === null) &&
    typeof row.lastUsedAt === 'string'
  );
}

function formatUsageSource(source: string | null): string {
  if (source === null) {
    return 'Unknown Source';
  }

  switch (source) {
    case 'slack':
      return 'Slack';
    case 'discord':
      return 'Discord';
    case 'security-agent':
      return 'Security Agent';
    case 'embeddings':
      return 'Embeddings';
    case 'direct-gateway':
      return 'Direct Gateway';
    case 'bot':
      return 'Bot';
    default:
      return source
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function formatSessionPlatform(createdOnPlatform: string | null): string | null {
  if (createdOnPlatform === null) {
    return null;
  }

  switch (createdOnPlatform) {
    case 'cloud-agent':
      return 'Cloud';
    case 'cli':
      return 'CLI';
    case 'agent-manager':
      return 'Agent Manager';
    case 'slack':
      return 'Slack';
    default:
      return createdOnPlatform;
  }
}

function getSessionChatHref(sessionId: string, organizationId: string | null): string {
  const sessionIdParam = encodeURIComponent(sessionId);
  if (organizationId) {
    return `/organizations/${organizationId}/cloud/chat?sessionId=${sessionIdParam}`;
  }

  return `/cloud/chat?sessionId=${sessionIdParam}`;
}

async function fetchUsageData(
  groupByModel: boolean,
  viewType: string,
  period: Period
): Promise<UsageResponse> {
  const response = await fetch(
    `/api/profile/usage?groupByModel=${groupByModel}&viewType=${viewType}&period=${period}`
  );
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }
    throw new Error('Failed to fetch usage data');
  }
  const data: UsageResponse | { error: string } = await response.json();
  if ('error' in data) {
    throw new Error(data.error);
  }
  return data;
}

function calculateTotals(usage: UsageData[]) {
  return usage.reduce(
    (totals, item) => ({
      totalCost: totals.totalCost + fromMicrodollars(item.total_cost),
      totalRequests: totals.totalRequests + item.request_count,
      totalTokens: totals.totalTokens + item.total_input_tokens + item.total_output_tokens,
    }),
    { totalCost: 0, totalRequests: 0, totalTokens: 0 }
  );
}

function calculateStreak(usageData: UsageData[]): number {
  // Create a set of dates that have usage (any requests > 0)
  const usageDates = new Set(
    usageData.filter(item => item.request_count > 0).map(item => item.date)
  );

  if (usageDates.size === 0) return 0;

  let streak = 0;
  const today = new Date();

  // Check consecutive days starting from today going backwards
  for (let i = 0; i < 365; i++) {
    // Max 365 days to prevent infinite loop
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dateString = checkDate.toISOString().split('T')[0]; // YYYY-MM-DD format

    if (usageDates.has(dateString)) {
      streak++;
    } else {
      // If this is the first day (today) and no usage, streak is 0
      // If we've already started counting and hit a gap, break
      break;
    }
  }

  return streak;
}

function transformUsageDataForStreakCalendar(
  usageData: UsageData[]
): { date: string; count: number }[] {
  // Create a map of date -> total request count for that date
  const dateRequestMap = new Map<string, number>();

  // Aggregate request counts by date (in case we have multiple entries per date when groupByModel is true)
  usageData.forEach(item => {
    const currentCount = dateRequestMap.get(item.date) || 0;
    dateRequestMap.set(item.date, currentCount + item.request_count);
  });

  // Generate data for the past 12 weeks (84 days)
  const streakData: { date: string; count: number }[] = [];
  const today = new Date();

  for (let i = 83; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format

    const requestCount = dateRequestMap.get(dateString) || 0;

    streakData.push({
      date: dateString,
      count: requestCount,
    });
  }

  return streakData;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Past Week',
  month: 'Past Month',
  year: 'Past Year',
  all: 'All Time',
};

export default function UsagePage() {
  const router = useRouter();
  const trpc = useTRPC();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [groupByModel, setGroupByModel] = useState(false);
  const [viewType, setViewType] = useState<string>('personal');
  const [period, setPeriod] = useState<Period>('week');
  const tabParam = searchParams.get('tab');
  const activeTab: UsageTab = tabParam === 'sessions' ? 'sessions' : 'overview';
  const [sessionsPage, setSessionsPage] = useState<number>(1);

  const handleTabChange = (nextTab: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextTab === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const {
    data: usageData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['usage-data', groupByModel, viewType, period],
    queryFn: () => fetchUsageData(groupByModel, viewType, period),
  });

  const { data: autocompleteMetrics, isLoading: isLoadingAutocompleteMetrics } = useQuery(
    trpc.user.getAutocompleteMetrics.queryOptions({ viewType, period })
  );

  const { data: organizations } = useQuery(trpc.organizations.list.queryOptions());

  const {
    data: sessionUsageHistory,
    isLoading: isLoadingSessionUsageHistory,
    error: sessionUsageHistoryError,
  } = useQuery({
    ...trpc.user.getSessionUsageHistory.queryOptions({
      viewType,
      period,
      page: sessionsPage,
      limit: 100,
    }),
    enabled: activeTab === 'sessions',
  });

  useEffect(() => {
    setSessionsPage(1);
  }, [viewType, period]);

  // Redirect to sign-in page if user is not authenticated
  useEffect(() => {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      router.push('/users/sign_in?callbackPath=/usage');
    }
  }, [error, router]);

  const periodLabel = PERIOD_LABELS[period];

  if (isLoading) {
    return (
      <PageLayout title="Usage">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-4 lg:col-span-2">
            {/* First row - Total metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            </div>

            {/* Second row - Autocomplete metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-28" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-28" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Streak calendar spanning both rows */}
          <div className="lg:row-span-2">
            <Card className="h-full">
              <CardContent className="pt-6">
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 84 }).map((_, i) => (
                    <Skeleton key={i} className="h-3 w-3 rounded-sm" />
                  ))}
                </div>
                <div className="mt-4 text-center">
                  <Skeleton className="mx-auto h-6 w-32" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-full max-w-md" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-muted-foreground border-b">
                    <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                      Date
                    </th>
                    <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                      Cost
                    </th>
                    <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                      Requests
                    </th>
                    <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                      Input Tokens
                    </th>
                    <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                      Output Tokens
                    </th>
                    <th className="text-muted-foreground px-6 py-3 text-left text-xs font-medium tracking-wider uppercase">
                      Cache Hits
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-muted-foreground divide-y">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Skeleton className="h-5 w-20" />
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Skeleton className="h-5 w-12" />
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                      <td className="px-6 py-4 text-sm whitespace-nowrap">
                        <Skeleton className="h-5 w-16" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  if (error) {
    // If it's an unauthorized error, show loading while redirecting
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return (
        <PageLayout title="Usage">
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground text-lg">Redirecting to sign in...</div>
          </div>
        </PageLayout>
      );
    }

    return (
      <PageLayout title="Usage">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="text-lg text-red-600">
            Error: {error instanceof Error ? error.message : 'An error occurred'}
          </div>
          <Button onClick={() => refetch()} variant="outline">
            Try Again
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (!usageData) {
    return (
      <PageLayout title="Usage">
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground text-lg">No usage data available</div>
        </div>
      </PageLayout>
    );
  }

  const { totalCost, totalRequests, totalTokens } = calculateTotals(usageData.usage);
  const streak = calculateStreak(usageData.usage);
  const streakCalendarData = transformUsageDataForStreakCalendar(usageData.usage);

  // Prepare table data
  const tableColumns: UsageTableColumn[] = [
    {
      key: 'date',
      label: 'Date',
      render: value => formatIsoDateString_UsaDateOnlyFormat(value as string),
    },
    ...(groupByModel
      ? [
          {
            key: 'model',
            label: 'Model',
            render: (value: unknown) => (value as string) || 'Unknown',
          },
        ]
      : []),
    {
      key: 'cost',
      label: 'Cost',
      render: value => formatDollars(fromMicrodollars(value as number)),
    },
    {
      key: 'requests',
      label: 'Requests',
      render: value => (value as number).toLocaleString(),
    },
    {
      key: 'inputTokens',
      label: 'Input Tokens',
      render: value => formatLargeNumber(value as number, true),
    },
    {
      key: 'outputTokens',
      label: 'Output Tokens',
      render: value => formatLargeNumber(value as number, true),
    },
    {
      key: 'cacheHits',
      label: 'Cache Hits',
      render: value => formatLargeNumber(value as number, true),
    },
  ];

  const tableData: UsageTableRow[] = usageData.usage.map(item => ({
    id: `${item.date}-${item.model || 'all'}`,
    date: item.date,
    ...(groupByModel && { model: item.model }),
    cost: item.total_cost,
    requests: item.request_count,
    inputTokens: item.total_input_tokens,
    outputTokens: item.total_output_tokens,
    cacheHits: item.total_cache_hit_tokens,
  }));

  const renderViewTypeSelector = () => {
    if (!organizations || organizations.length === 0) {
      return null;
    }

    return (
      <Select value={viewType} onValueChange={setViewType}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="personal">Personal Only</SelectItem>
          <SelectItem value="all">All Usage</SelectItem>
          {organizations.map(org => (
            <SelectItem key={org.organizationId} value={org.organizationId}>
              {org.organizationName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const sessionTableColumns: UsageTableColumn[] = [
    {
      key: 'lastUsedAt',
      label: 'Last Used',
      render: value => {
        if (typeof value !== 'string') {
          return '—';
        }

        return (
          <div className="flex flex-col">
            <span>{formatRelativeTime(value)}</span>
            <span className="text-muted-foreground text-xs">{formatDate(value)}</span>
          </div>
        );
      },
    },
    {
      key: 'sessionId',
      label: 'Session',
      render: (_value, row) => {
        if (!isSessionUsageTableRow(row)) {
          return 'Unknown Session';
        }

        if (row.sessionId === null) {
          return (
            <div className="min-w-[260px] max-w-[360px]">
              <div className="text-foreground font-medium">{formatUsageSource(row.source)}</div>
              <div className="text-muted-foreground mt-1 text-xs">Source-backed usage</div>
            </div>
          );
        }

        const repository = extractRepoFromGitUrl(row.gitUrl);
        const platformLabel = formatSessionPlatform(row.createdOnPlatform);
        const metadataParts: string[] = [];

        if (repository) {
          metadataParts.push(repository);
        }

        if (platformLabel) {
          metadataParts.push(platformLabel);
        }

        const title = row.title?.trim() ? row.title : 'Untitled Session';
        const sessionHref = getSessionChatHref(row.sessionId, row.organizationId);

        return (
          <div className="min-w-[260px] max-w-[360px]">
            <Link href={sessionHref} className="text-foreground font-medium hover:underline">
              {title}
            </Link>
            <div className="text-muted-foreground mt-1 font-mono text-xs">ID: {row.sessionId}</div>
            {metadataParts.length > 0 && (
              <div className="text-muted-foreground mt-1 text-xs">{metadataParts.join(' • ')}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'cost',
      label: 'Cost',
      render: value =>
        typeof value === 'number' ? formatDollars(fromMicrodollars(value)) : formatDollars(0),
    },
    {
      key: 'requests',
      label: 'Requests',
      render: value => (typeof value === 'number' ? value.toLocaleString() : '0'),
    },
    {
      key: 'inputTokens',
      label: 'Input Tokens',
      render: value => (typeof value === 'number' ? formatLargeNumber(value, true) : '0'),
    },
    {
      key: 'outputTokens',
      label: 'Output Tokens',
      render: value => (typeof value === 'number' ? formatLargeNumber(value, true) : '0'),
    },
    {
      key: 'cacheHits',
      label: 'Cache Hits',
      render: value => (typeof value === 'number' ? formatLargeNumber(value, true) : '0'),
    },
  ];

  const sessionTableData: UsageTableRow[] =
    sessionUsageHistory?.sessions.map((session, index) => ({
      id: session.sessionId ?? `${session.source ?? 'source'}-${session.lastUsedAt}-${index}`,
      sessionId: session.sessionId,
      source: session.source,
      lastUsedAt: session.lastUsedAt,
      title: session.title,
      createdOnPlatform: session.createdOnPlatform,
      gitUrl: session.gitUrl,
      organizationId: session.organizationId,
      cost: session.totalCost,
      requests: session.requestCount,
      inputTokens: session.totalInputTokens,
      outputTokens: session.totalOutputTokens,
      cacheHits: session.totalCacheHitTokens,
    })) ?? [];

  const sessionsEmptyMessage =
    sessionUsageHistoryError instanceof Error
      ? sessionUsageHistoryError.message
      : isLoadingSessionUsageHistory
        ? 'Loading session usage history...'
        : 'No usage found with a recorded session or source';

  const sessionsPagination = sessionUsageHistory?.pagination;

  return (
    <PageLayout
      title="Usage"
      headerActions={
        <Tabs value={period} onValueChange={value => setPeriod(value as Period)}>
          <TabsList>
            <TabsTrigger value="week">Past Week</TabsTrigger>
            <TabsTrigger value="month">Past Month</TabsTrigger>
            <TabsTrigger value="year">Past Year</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 lg:col-span-2">
          {/* First row - Total metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cost ({periodLabel})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDollars(totalCost)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium whitespace-nowrap">
                  Requests ({periodLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatLargeNumber(totalRequests)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tokens ({periodLabel})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatLargeNumber(totalTokens)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Second row - Autocomplete metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Autocomplete Cost
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoadingAutocompleteMetrics ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    formatDollars(fromMicrodollars(autocompleteMetrics?.cost || 0))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium whitespace-nowrap">
                  Autocomplete Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoadingAutocompleteMetrics ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    formatLargeNumber(autocompleteMetrics?.requests || 0)
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Autocomplete Tokens
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoadingAutocompleteMetrics ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    formatLargeNumber(autocompleteMetrics?.tokens || 0)
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Streak calendar spanning both rows */}
        <div className="lg:row-span-2">
          <Card className="flex h-full flex-col">
            <CardContent className="flex flex-1 flex-col justify-center pt-6">
              <StreakCalendar streakData={streakCalendarData} currentStreak={streak} />
              <div className="mt-4 text-center">
                <div className="text-muted-foreground text-sm">Daily Coding Streak</div>
                <div className="text-3xl font-bold">
                  {streak} {streak === 1 ? 'day' : 'days'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="overview" className={tabTriggerClass}>
            Overview
          </TabsTrigger>
          <TabsTrigger value="sessions" className={tabTriggerClass}>
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <UsageTableBase
            title="Usage Overview"
            columns={tableColumns}
            data={tableData}
            emptyMessage="No usage data found"
            headerContent={<UsageWarning />}
            headerActions={
              <div className="flex items-center gap-2">
                {organizations && organizations.length > 0 && (
                  <Select value={viewType} onValueChange={setViewType}>
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal Only</SelectItem>
                      <SelectItem value="all">All Usage</SelectItem>
                      {organizations.map(org => (
                        <SelectItem key={org.organizationId} value={org.organizationId}>
                          {org.organizationName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant={groupByModel ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => setGroupByModel(false)}
                >
                  By Day
                </Button>
                <Button
                  variant={groupByModel ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGroupByModel(true)}
                >
                  By Model & Day
                </Button>
              </div>
            }
          />
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <UsageTableBase
            title="Session Usage"
            columns={sessionTableColumns}
            data={sessionTableData}
            emptyMessage={sessionsEmptyMessage}
            headerActions={
              <div className="flex items-center gap-2">{renderViewTypeSelector()}</div>
            }
          />

          {activeTab === 'sessions' && sessionsPagination && sessionsPagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSessionsPage(page => Math.max(1, page - 1))}
                disabled={isLoadingSessionUsageHistory || !sessionsPagination.hasPreviousPage}
              >
                Previous
              </Button>
              <div className="text-muted-foreground text-sm">
                Page {sessionsPagination.page} of {sessionsPagination.totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSessionsPage(page => page + 1)}
                disabled={isLoadingSessionUsageHistory || !sessionsPagination.hasNextPage}
              >
                Next
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
