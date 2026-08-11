import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { fetchCompanyDetailInfo, fetchCompanyJobs, toggleSubscription } from '../api';
import { CompanyWithSubscription, Job, isSupportedPlatform } from '../types/database';
import { CompanyLogo } from '../components/CompanyLogo';
import { Toast } from '../components/Toast';
import { useTheme, useStyles } from '../context/ThemeContext';
import { formatRelativeTime } from './CompanyListScreen';
import { Feather } from '@expo/vector-icons';
import type { Colors } from '../context/ThemeContext';

interface Props {
    userId: string;
}

export function CompanyDetailScreen({ userId }: Props) {
    const route = useRoute<any>();
    const navigation = useNavigation<any>();
    const { companyId } = route.params;

    const { colors } = useTheme();
    const styles = useStyles((c: Colors) => ({
        container: { flex: 1, backgroundColor: c.background },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },
        header: { alignItems: 'center', padding: 24, paddingTop: 32, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
        companyName: { fontSize: 24, fontWeight: '700', color: c.text, marginTop: 16, marginBottom: 4 },
        badgeContainer: { flexDirection: 'row', gap: 8, marginTop: 8 },
        badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, backgroundColor: c.primarySubtle, borderWidth: 1, borderColor: c.primaryText },
        badgeText: { fontSize: 12, fontWeight: '600', color: c.primaryText },
        buttonContainer: { marginTop: 24, width: '100%', maxWidth: 200 },
        // Unfollowed: outlined brass — surface bg, 1px brass border, brass text
        toggleButton: { backgroundColor: c.surface, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: c.primary },
        // Followed: subtle brass tint — clearly different from unfollowed, still restrained
        toggleButtonActive: { backgroundColor: c.primarySubtle, borderColor: c.primary },
        toggleButtonDisabled: { backgroundColor: c.background, borderColor: c.border },
        toggleText: { color: c.primary, fontSize: 15, fontWeight: '600' },
        toggleTextActive: { color: c.primaryText },
        toggleTextDisabled: { color: c.textSecondary },
        content: { padding: 16 },
        sectionTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 12 },
        jobCountText: { fontSize: 15, color: c.textSecondary, marginBottom: 16 },
        jobCard: { backgroundColor: c.surface, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: c.border, marginBottom: 8 },
        jobTitle: { fontSize: 16, fontWeight: '600', color: c.text },
        jobMeta: { fontSize: 13, color: c.textSecondary, marginTop: 4 },
        viewAllBtn: { marginTop: 12, paddingVertical: 14, backgroundColor: c.surface, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
        viewAllText: { fontSize: 15, fontWeight: '600', color: c.primary },
        unsupportedBox: { backgroundColor: c.surface, padding: 24, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', marginTop: 16 },
        unsupportedIcon: { marginBottom: 12 },
        unsupportedText: { fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22 },
        statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, marginVertical: 16 },
        statBox: { alignItems: 'center' },
        statValue: { fontSize: 18, fontWeight: '700', color: c.text },
        statLabel: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
        statDivider: { width: 1, height: 32, backgroundColor: c.border },
    }));

    const [company, setCompany] = useState<CompanyWithSubscription | null>(null);
    const [recentJobs, setRecentJobs] = useState<Job[]>([]);
    const [totalJobs, setTotalJobs] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [toastMsg, setToastMsg] = useState('');
    const [toastVisible, setToastVisible] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [companyData, jobsData] = await Promise.all([
                fetchCompanyDetailInfo(userId, companyId),
                fetchCompanyJobs(companyId)
            ]);
            setCompany(companyData);
            setTotalJobs(jobsData.length);
            setRecentJobs(jobsData.slice(0, 5));
        } catch (e) {
            console.warn(e);
        } finally {
            setLoading(false);
        }
    }, [userId, companyId]);
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const handleToggle = async () => {
        if (!company || !isSupportedPlatform(company.detected_platform)) return;
        setBusy(true);
        try {
            await toggleSubscription(userId, company.id, company.isSubscribed);
            const isFollowing = !company.isSubscribed;
            setCompany({ ...company, isSubscribed: isFollowing });

            setToastMsg(isFollowing ? `You started following ${company.name}` : `You unfollowed ${company.name}`);
            setToastVisible(true);
        } catch (e) {
            alert('Failed to update subscription');
        } finally {
            setBusy(false);
        }
    };

    if (loading || !company) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const supported = isSupportedPlatform(company.detected_platform);

    return (
        <View style={styles.container}>
            <ScrollView>
                <View style={styles.header}>
                    <CompanyLogo careersUrl={company.careers_url} companyName={company.name} size={80} colors={colors} grayedOut={!supported} />
                    <Text style={styles.companyName}>{company.name}</Text>

                    <View style={styles.badgeContainer}>
                        <View style={[styles.badge, !supported && { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Text style={[styles.badgeText, !supported && { color: colors.textSecondary }]}>
                                {supported && company.detected_platform ? `Powered by ${company.detected_platform.charAt(0).toUpperCase() + company.detected_platform.slice(1)}` : 'Unsupported'}
                            </Text>
                        </View>
                    </View>

                    {supported && (
                        <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>{totalJobs}</Text>
                                <Text style={styles.statLabel}>open roles</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statBox}>
                                <Text style={styles.statValue}>{company.last_scraped_at ? formatRelativeTime(company.last_scraped_at) : 'Never'}</Text>
                                <Text style={styles.statLabel}>last synced</Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.buttonContainer}>
                        <Pressable
                            style={[
                                styles.toggleButton,
                                company.isSubscribed && styles.toggleButtonActive,
                                !supported && styles.toggleButtonDisabled,
                            ]}
                            onPress={handleToggle}
                            disabled={!supported || busy}
                        >
                            {busy ? (
                                <ActivityIndicator size="small" color={company.isSubscribed ? colors.textSecondary : colors.surface} />
                            ) : (
                                <Text style={[
                                    styles.toggleText,
                                    company.isSubscribed && styles.toggleTextActive,
                                    !supported && styles.toggleTextDisabled
                                ]}>
                                    {company.isSubscribed ? 'Following' : 'Follow'}
                                </Text>
                            )}
                        </Pressable>
                    </View>
                </View>

                <View style={styles.content}>
                    {!supported ? (
                        <View style={styles.unsupportedBox}>
                            <Feather name="alert-circle" size={32} color={colors.textSecondary} style={styles.unsupportedIcon} />
                            <Text style={styles.unsupportedText}>
                                We don't support live tracking for this company yet.
                            </Text>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.sectionTitle}>Recent Roles</Text>
                            {recentJobs.length > 0 ? (
                                <>
                                    {recentJobs.map(job => (
                                        <View key={job.id} style={styles.jobCard}>
                                            <Text style={styles.jobTitle} numberOfLines={1}>{job.title}</Text>
                                            <Text style={styles.jobMeta}>{job.location || 'Remote'} • {formatRelativeTime(job.first_seen_at)}</Text>
                                        </View>
                                    ))}
                                    <Pressable
                                        style={styles.viewAllBtn}
                                        onPress={() => navigation.navigate('MyJobsStack', { screen: 'CompanyJobs', params: { companyId: company.id, companyName: company.name } })}
                                    >
                                        <Text style={styles.viewAllText}>View all {totalJobs} roles</Text>
                                    </Pressable>
                                </>
                            ) : (
                                <Text style={styles.jobCountText}>No open roles available right now.</Text>
                            )}
                        </>
                    )}
                </View>
            </ScrollView>

            <Toast visible={toastVisible} message={toastMsg} onHide={() => setToastVisible(false)} />
        </View>
    );
}
