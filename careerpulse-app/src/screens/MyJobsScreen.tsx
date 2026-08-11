import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { fetchMyJobsOverview } from '../api';
import { CompanyLogo } from '../components/CompanyLogo';
import { Feather } from '@expo/vector-icons';
import { useStyles, useTheme } from '../context/ThemeContext';
import type { Colors } from '../context/ThemeContext';

interface Props {
  userId: string;
  onBrowseCompanies: () => void;
}

export function MyJobsScreen({ userId, onBrowseCompanies }: Props) {
  const { colors } = useTheme();
  const styles = useStyles((c: Colors) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
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
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 8,
      color: c.text,
    },
    emptyBody: {
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    linkButton: {
      backgroundColor: c.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 6,
    },
    linkButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    list: {
      padding: 16,
      gap: 8,
    },
    card: {
      backgroundColor: c.surface,
      padding: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderLeftWidth: 4,
      borderLeftColor: c.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: c.shadowOpacity,
      shadowRadius: 2,
      elevation: c.shadowOpacity > 0 ? 1 : 0,
    },
    cardInfo: {
      gap: 4,
    },
    companyName: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    jobCount: {
      fontSize: 13,
      color: c.textSecondary,
      fontWeight: '400',
    },
    cardLayout: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    newBadge: {
      backgroundColor: c.primary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 12,
      marginLeft: 8,
    },
    newBadgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
    },
  }));

  const [overview, setOverview] = useState<{ companyId: string; companyName: string; jobCount: number; careersUrl?: string; newJobsCount?: number | null; lastViewedAt?: string | null; }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigation = useNavigation<any>();

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchMyJobsOverview(userId);
      setOverview(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load companies.';
      setError(message);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadData();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading && overview.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your companies...</Text>
      </View>
    );
  }

  if (error && overview.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.linkButton} onPress={handleRefresh}>
          <Text style={styles.linkButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (overview.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No companies yet</Text>
        <Text style={styles.emptyBody}>
          Follow companies on the Discover tab to see their open roles.
        </Text>
        <Pressable style={styles.linkButton} onPress={onBrowseCompanies}>
          <Text style={styles.linkButtonText}>Browse companies</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {error ? <Text style={styles.bannerError}>{error}</Text> : null}

      <View style={styles.list}>
        {overview.map((company) => (
          <Pressable
            key={company.companyId}
            style={styles.card}
            onPress={() => navigation.navigate('CompanyJobs', { companyId: company.companyId, companyName: company.companyName })}
          >
            <View style={styles.cardLayout}>
              <View style={{ marginRight: 12 }}>
                <CompanyLogo careersUrl={company.careersUrl} companyName={company.companyName} size={48} colors={colors} />
              </View>
              <View style={[styles.cardInfo, { flex: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.companyName} numberOfLines={1}>{company.companyName}</Text>
                  {typeof company.newJobsCount === 'number' && company.newJobsCount > 0 ? (
                    <View style={styles.newBadge}>
                      <Text style={styles.newBadgeText}>{company.newJobsCount} NEW</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.jobCount}>
                  {company.jobCount} open job{company.jobCount === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
