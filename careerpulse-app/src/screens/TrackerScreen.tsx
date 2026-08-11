import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
    Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { fetchMyApplications } from '../api';
import type { TrackedJob } from '../types/database';
import { useStyles, useTheme } from '../context/ThemeContext';
import type { Colors } from '../context/ThemeContext';

interface Props {
    userId: string;
}

export function TrackerScreen({ userId }: Props) {
    const { colors } = useTheme();
    const styles = useStyles((c: Colors) => ({
        container: {
            flex: 1,
            backgroundColor: c.background,
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
            lineHeight: 20,
        },
        linkButton: {
            backgroundColor: c.surface,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: c.border,
        },
        linkButtonText: {
            color: c.text,
            fontWeight: '500',
            fontSize: 14,
        },
        section: {
            backgroundColor: c.surface,
            marginHorizontal: 16,
            marginTop: 16,
            borderRadius: 8,
            padding: 16,
            borderWidth: 1,
            borderColor: c.border,
            borderLeftWidth: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: c.shadowOpacity,
            shadowRadius: 2,
            elevation: c.shadowOpacity > 0 ? 1 : 0,
        },
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 8,
        },
        sectionIndicator: {
            width: 8,
            height: 8,
            borderRadius: 4,
            marginRight: 8,
        },
        sectionTitle: {
            fontSize: 16,
            fontWeight: '700',
            color: c.text,
            flex: 1,
        },
        sectionCount: {
            fontSize: 13,
            color: c.textSecondary,
            fontWeight: '500',
            backgroundColor: c.background,
            borderWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 12,
        },
        emptySectionText: {
            color: c.textSecondary,
            fontSize: 13,
            paddingVertical: 8,
        },
        jobRow: {
            flexDirection: 'row',
            alignItems: 'center',
            borderTopWidth: 1,
            borderTopColor: c.border,
            paddingVertical: 12,
            gap: 12,
        },
        rowMain: {
            flex: 1,
            gap: 2,
        },
        jobTitle: {
            fontSize: 16,
            fontWeight: '600',
            color: c.text,
        },
        jobMeta: {
            fontSize: 13,
            color: c.textSecondary,
        },
        jobMetaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
        },
        statusIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: c.background,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.border,
        },
        statusDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
        },
        statusText: {
            fontSize: 12,
            fontWeight: '500',
        },
    }));

    const [groupedApps, setGroupedApps] = useState<Record<string, TrackedJob[]>>({
        applied: [],
        interviewing: [],
        rejected: [],
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setError(null);
        try {
            const data = await fetchMyApplications(userId);
            setGroupedApps(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
        }
    }, [userId]);

    useEffect(() => {
        let isSubscribed = true;
        loadData().finally(() => {
            if (isSubscribed) setLoading(false);
        });
        return () => { isSubscribed = false; };
    }, [loadData]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [loadData]);

    const openJobUrl = (url: string | null) => {
        if (url) {
            Linking.openURL(url).catch((err) =>
                console.error('Failed to open job URL:', err)
            );
        }
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading applications...</Text>
            </View>
        );
    }

    const hasAnyJobs =
        groupedApps.applied.length > 0 ||
        groupedApps.interviewing.length > 0 ||
        groupedApps.rejected.length > 0;

    if (!hasAnyJobs) {
        return (
            <View style={styles.centered}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Feather name="folder-minus" size={48} color={colors.border} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyTitle}>No Applications Yet</Text>
                <Text style={styles.emptyBody}>
                    Your saved jobs and active applications will appear here. Find roles on the Discover tab to get started.
                </Text>
            </View>
        );
    }

    const SECTIONS = [
        { key: 'interviewing', title: 'Interviewing', data: groupedApps.interviewing, color: colors.statusInterviewing },
        { key: 'applied', title: 'Applied', data: groupedApps.applied, color: colors.statusApplied },
        { key: 'rejected', title: 'Rejected', data: groupedApps.rejected, color: colors.statusRejected },
    ];

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
        >
            {error && <Text style={styles.bannerError}>{error}</Text>}
            <View style={{ height: 8 }} />

            {SECTIONS.map((section) => (
                <View key={section.key} style={[styles.section, { borderLeftColor: section.color }]}>
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionIndicator, { backgroundColor: section.color }]} />
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionCount}>{section.data.length}</Text>
                    </View>

                    {section.data.length === 0 ? (
                        <Text style={styles.emptySectionText}>No jobs here currently.</Text>
                    ) : (
                        section.data.map((item, index) => (
                            <Pressable
                                key={item.applicationId}
                                style={[
                                    styles.jobRow,
                                    index === 0 && { borderTopWidth: 0, marginTop: 4 }
                                ]}
                                onPress={() => openJobUrl(item.job.url)}
                            >
                                <View style={styles.rowMain}>
                                    <Text style={[styles.jobTitle, { color: colors.primary }]} numberOfLines={1}>{item.job.title}</Text>
                                    <View style={styles.jobMetaRow}>
                                        <Text style={styles.jobMeta}>{item.companyName}</Text>
                                        <View style={styles.statusIndicator}>
                                            <View style={[styles.statusDot, { backgroundColor: section.color }]} />
                                            <Text style={[styles.statusText, { color: section.color }]}>{section.title}</Text>
                                        </View>
                                    </View>
                                </View>
                                <Feather name="external-link" size={16} color={colors.primary} />
                            </Pressable>
                        ))
                    )}
                </View>
            ))}

            <View style={{ height: 24 }} />
        </ScrollView>
    );
}
