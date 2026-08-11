import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { fetchCompanies, toggleSubscription, fetchDiscoverAnalytics, DiscoverAnalytics } from '../api';
import {
  CompanyWithSubscription,
  isSupportedPlatform,
} from '../types/database';
import { CompanyLogo } from '../components/CompanyLogo';
import { Toast } from '../components/Toast';
import { ContactUsModal } from './ContactUsModal';

import { useTheme, useStyles } from '../context/ThemeContext';
import type { Colors } from '../context/ThemeContext';

interface Props {
  userId: string;
}

export function CompanyListScreen({ userId }: Props) {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const styles = useStyles((c: Colors) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    listContent: {
      paddingVertical: 12,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      backgroundColor: c.background,
    },
    loadingText: {
      marginTop: 12,
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: '400',
    },
    error: {
      color: c.error,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 16,
      fontWeight: '500',
    },
    bannerError: {
      backgroundColor: c.surface,
      color: c.error,
      borderBottomWidth: 1,
      borderColor: c.border,
      padding: 12,
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
    },
    retryButton: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 6,
    },
    retryText: {
      color: c.text,
      fontWeight: '500',
      fontSize: 14,
    },
    emptyBody: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 2,
      elevation: c.shadowOpacity > 0 ? 1 : 0,
    },
    rowSubscribed: {
      borderLeftWidth: 4,
      borderLeftColor: c.primary,
    },
    rowMain: {
      flex: 1,
      gap: 4,
    },
    companyName: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    companyMeta: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '400',
    },
    toggleButton: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      minWidth: 86,
      alignItems: 'center',
    },
    toggleButtonActive: {
      backgroundColor: c.background,
      borderColor: c.border,
    },
    toggleButtonDisabled: {
      backgroundColor: c.background,
      borderColor: c.background,
    },
    toggleText: {
      color: c.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    toggleTextActive: {
      color: c.textSecondary,
      fontWeight: '500',
    },
    toggleTextDisabled: {
      color: c.textSecondary,
    },
    rowGrid: {
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    gridCard: {
      width: '48%',
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 2,
      elevation: c.shadowOpacity > 0 ? 1 : 0,
    },
    gridCardSubscribed: {
      borderColor: c.primary,
      backgroundColor: c.primarySubtle,
    },
    companyNameGrid: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
      marginTop: 12,
      marginBottom: 4,
      textAlign: 'center',
    },
    companyMetaGrid: {
      fontSize: 11,
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: 12,
      height: 30, // uniform height
    },
    pillContainer: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 16,
      gap: 8,
    },
    filterPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterPillActive: {
      backgroundColor: c.primarySubtle,
      borderColor: c.primary,
    },
    filterPillText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    filterPillTextActive: {
      color: c.primaryText,
    },
    searchContainer: {
      marginHorizontal: 16,
      marginBottom: 12,
    },
    searchInput: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
    },
    analyticsHeader: {
      backgroundColor: c.surface,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 2,
      elevation: c.shadowOpacity > 0 ? 1 : 0,
    },
    analyticsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      marginBottom: 12,
    },
    analyticsEmpty: {
      fontSize: 14,
      color: c.textSecondary,
    },
    analyticsLoadingText: {
      marginTop: 8,
      fontSize: 13,
      color: c.textSecondary,
      textAlign: 'center',
    },
    analyticsMetricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    analyticsMetric: {
      flex: 1,
      alignItems: 'center',
    },
    analyticsMetricDivider: {
      width: 1,
      height: 32,
      backgroundColor: c.border,
    },
    analyticsMetricValue: {
      fontSize: 24,
      fontWeight: '700',
      color: c.primary,
    },
    analyticsMetricLabel: {
      fontSize: 12,
      color: c.textSecondary,
      marginTop: 2,
      textAlign: 'center',
    },
    analyticsSubtitle: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    recentJobRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    recentJobMain: {
      flex: 1,
      paddingRight: 12,
    },
    recentJobTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: c.text,
      lineHeight: 20,
    },
    recentJobCompany: {
      fontSize: 12,
      color: c.textSecondary,
      marginTop: 2,
    },
    recentJobTime: {
      fontSize: 12,
      color: c.textSecondary,
    },
    footerContainer: {
      padding: 24,
      alignItems: 'center',
      marginTop: 8,
      backgroundColor: c.background,
    },
    footerText: {
      fontSize: 14,
      color: c.textSecondary,
      marginBottom: 12,
      textAlign: 'center',
    },
    footerButton: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    footerButtonText: {
      color: c.primary,
      fontWeight: '600',
      fontSize: 14,
    },
  }));
  const [companies, setCompanies] = useState<CompanyWithSubscription[]>([]);
  const [analytics, setAnalytics] = useState<DiscoverAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyCompanyId, setBusyCompanyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'All' | 'Following' | 'Supported' | 'Support coming soon'>('All');
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [contactVisible, setContactVisible] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [comps, stats] = await Promise.all([
        fetchCompanies(userId),
        fetchDiscoverAnalytics()
      ]);
      setCompanies(comps);
      setAnalytics(stats);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load data.';
      setError(message);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        if (companies.length === 0) setLoading(true);
        await loadData();
        if (!cancelled) setLoading(false);
      })();

      return () => {
        cancelled = true;
      };
    }, [loadData, companies.length])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleToggle(company: CompanyWithSubscription) {
    if (!isSupportedPlatform(company.detected_platform)) return;

    setBusyCompanyId(company.id);
    setError(null);

    try {
      await toggleSubscription(
        userId,
        company.id,
        company.isSubscribed,
      );
      const isFollowing = !company.isSubscribed;

      setCompanies((prev) =>
        prev.map((c) =>
          c.id === company.id
            ? { ...c, isSubscribed: isFollowing }
            : c,
        ),
      );

      setToastMsg(isFollowing ? `You started following ${company.name}` : `You unfollowed ${company.name}`);
      setToastVisible(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update subscription.';
      setError(message);
    } finally {
      setBusyCompanyId(null);
    }
  }

  if (loading && companies.length === 0 && !analytics) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.textSecondary} />
        <Text style={styles.loadingText}>Loading discover data…</Text>
      </View>
    );
  }

  if (error && companies.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const filteredCompanies = companies.filter(c => {
    const textMatch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!textMatch) return false;

    if (activeFilter === 'Following') return c.isSubscribed;
    if (activeFilter === 'Supported') return isSupportedPlatform(c.detected_platform);
    if (activeFilter === 'Support coming soon') return !isSupportedPlatform(c.detected_platform);

    return true; // All
  });

  const filterOptions = ['All', 'Following', 'Supported', 'Support coming soon'] as const;

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.bannerError}>{error}</Text> : null}

      <FlatList
        data={filteredCompanies}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.rowGrid}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <View>
            {loading && !analytics ? (
              <View style={styles.analyticsHeader}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={styles.analyticsLoadingText}>Loading recent activity…</Text>
              </View>
            ) : analytics ? (
              <View style={styles.analyticsHeader}>
                <Text style={styles.analyticsTitle}>Activity This Week</Text>
                {analytics.newJobsCount === 0 ? (
                  <Text style={styles.analyticsEmpty}>
                    No new jobs have been posted in the last 7 days.
                  </Text>
                ) : (
                  <>
                    <View style={styles.analyticsMetricsRow}>
                      <View style={styles.analyticsMetric}>
                        <Text style={styles.analyticsMetricValue}>{analytics.newJobsCount}</Text>
                        <Text style={styles.analyticsMetricLabel}>new jobs this week</Text>
                      </View>
                      <View style={styles.analyticsMetricDivider} />
                      <View style={styles.analyticsMetric}>
                        <Text style={styles.analyticsMetricValue}>{analytics.newCompaniesCount}</Text>
                        <Text style={styles.analyticsMetricLabel}>companies posted this week</Text>
                      </View>
                    </View>
                    <Text style={styles.analyticsSubtitle}>Recently posted</Text>
                    {analytics.recentJobs.map((job) => (
                      <View key={job.id} style={styles.recentJobRow}>
                        <View style={styles.recentJobMain}>
                          <Text style={styles.recentJobTitle}>{job.title}</Text>
                          <Text style={styles.recentJobCompany}>{job.companyName}</Text>
                        </View>
                        <Text style={styles.recentJobTime}>
                          {formatRelativeTime(job.first_seen_at)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : null}

            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search companies..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillContainer}>
              {filterOptions.map(opt => (
                <Pressable
                  key={opt}
                  style={[styles.filterPill, activeFilter === opt && styles.filterPillActive]}
                  onPress={() => setActiveFilter(opt)}
                >
                  <Text style={[styles.filterPillText, activeFilter === opt && styles.filterPillTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyBody}>
              {searchQuery ? "No companies matched your search." : "No companies yet. Run the backend sync to populate the database."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const supported = isSupportedPlatform(item.detected_platform);
          const busy = busyCompanyId === item.id;

          return (
            <Pressable
              style={[styles.gridCard, item.isSubscribed && styles.gridCardSubscribed]}
              onPress={() => navigation.navigate('CompanyDetail', { companyId: item.id, companyName: item.name })}
            >
              <CompanyLogo careersUrl={item.careers_url} companyName={item.name} size={64} colors={colors} grayedOut={!supported} />

              <Text style={styles.companyNameGrid} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.companyMetaGrid} numberOfLines={2}>
                {supported && item.detected_platform
                  ? `Powered by ${item.detected_platform.charAt(0).toUpperCase() + item.detected_platform.slice(1)}`
                  : 'Unsupported'}
              </Text>

              <Pressable
                style={[
                  styles.toggleButton,
                  item.isSubscribed && styles.toggleButtonActive,
                  !supported && styles.toggleButtonDisabled,
                ]}
                onPress={() => handleToggle(item)}
                disabled={!supported || busy}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text
                    style={[
                      styles.toggleText,
                      item.isSubscribed && styles.toggleTextActive,
                      !supported && styles.toggleTextDisabled,
                    ]}
                  >
                    {item.isSubscribed ? 'Following' : 'Follow'}
                  </Text>
                )}
              </Pressable>
            </Pressable>
          );
        }}
        ListFooterComponent={
          filteredCompanies.length > 0 ? (
            <View style={styles.footerContainer}>
              <Text style={styles.footerText}>Don't see a company you're looking for?</Text>
              <Pressable style={styles.footerButton} onPress={() => setContactVisible(true)}>
                <Text style={styles.footerButtonText}>Request it</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
      <Toast visible={toastVisible} message={toastMsg} onHide={() => setToastVisible(false)} />
      <ContactUsModal
        visible={contactVisible}
        onClose={() => setContactVisible(false)}
        userId={userId}
        title="Request a Company"
        initialCategory="Request a company"
      />
    </View>
  );
}

function formatRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export { formatRelativeTime }
