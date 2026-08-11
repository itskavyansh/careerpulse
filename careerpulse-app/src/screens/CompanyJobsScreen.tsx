import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
    ScrollView,
    Modal,
    Pressable,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { fetchCompanyDetailInfo, fetchCompanyJobs, fetchMyApplications, setApplicationStatus, clearApplicationStatus, recordCompanyView } from '../api';
import type { Job, ApplicationStatus, CompanyWithSubscription } from '../types/database';
import { CompanyLogo } from '../components/CompanyLogo';
import { useTheme, useStyles } from '../context/ThemeContext';
import type { Colors } from '../context/ThemeContext';

interface Props {
    userId: string;
}

export function CompanyJobsScreen({ userId }: Props) {
    const { colors } = useTheme();
    const styles = useStyles((c: Colors) => ({
        container: { flex: 1, backgroundColor: c.background },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: c.background },
        header: { padding: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderColor: c.border },
        headerTitle: { fontSize: 20, fontWeight: '700', color: c.text },
        filtersContainer: { padding: 16, backgroundColor: c.surface, gap: 10, borderBottomWidth: 1, borderColor: c.border },
        input: { backgroundColor: c.background, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.text, borderWidth: 1, borderColor: c.border },
        remoteFilter: { flexDirection: 'row', gap: 8, marginTop: 4 },
        remoteBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: c.surface, alignItems: 'center', borderWidth: 1, borderColor: c.border },
        remoteBtnActive: { backgroundColor: c.primarySubtle, borderColor: c.primaryText },
        remoteBtnText: { color: c.textSecondary, fontWeight: '500', fontSize: 13 },
        remoteBtnTextActive: { color: c.primaryText },

        error: { color: c.error, fontSize: 14, textAlign: 'center', marginBottom: 12, fontWeight: '500' },
        loadingText: { marginTop: 12, color: c.textSecondary, fontSize: 14 },
        retryBtn: { backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: c.border },
        retryText: { color: c.text, fontWeight: '500', fontSize: 14 },
        emptyText: { textAlign: 'center', color: c.textSecondary, marginTop: 40, fontSize: 14 },

        headerInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        weeklyStat: { fontSize: 13, color: c.textSecondary, fontWeight: '500', marginTop: 8 },

        listContent: { padding: 16, gap: 8 },
        card: { backgroundColor: c.surface, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: c.shadowOpacity, shadowRadius: 2, elevation: c.shadowOpacity > 0 ? 1 : 0 },
        cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
        titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 10 },
        jobTitle: { fontSize: 16, fontWeight: '600', color: c.text, flexShrink: 1 },
        menuButton: { padding: 4, marginRight: -4, marginTop: -4 },
        jobMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
        jobMetaText: { fontSize: 13, color: c.textSecondary },

        statusIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: c.border },
        statusDot: { width: 6, height: 6, borderRadius: 3 },
        statusText: { fontSize: 12, fontWeight: '500' },

        pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 20, gap: 6 },
        pageButton: { minWidth: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
        pageButtonActive: { backgroundColor: c.background, borderColor: c.border },
        pageDisabled: { opacity: 0.5 },
        pageText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },
        pageTextActive: { color: c.text, fontWeight: '600' },
        pageEllipsis: { color: c.textSecondary, marginHorizontal: 4 },

        modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
        modalContent: { backgroundColor: c.surface, width: '100%', borderRadius: 12, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
        modalTitle: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 16, textAlign: 'center' },
        modalOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginBottom: 8, backgroundColor: c.background },
        modalOptionActive: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
        modalOptionText: { fontSize: 14, fontWeight: '500' },
        modalOptionClear: { backgroundColor: c.surface, marginTop: 8 },
        modalOptionClearText: { color: c.error, fontSize: 14, fontWeight: '500' }
    }));
    const route = useRoute<any>();
    const { companyId, companyName } = route.params || {};

    const [jobs, setJobs] = useState<Job[]>([]);
    const [companyInfo, setCompanyInfo] = useState<CompanyWithSubscription | null>(null);
    const [appsMap, setAppsMap] = useState<Record<string, ApplicationStatus>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusModalJob, setStatusModalJob] = useState<{ id: string; status: ApplicationStatus | undefined } | null>(null);

    // Filters
    const [search, setSearch] = useState('');
    const [remoteFilter, setRemoteFilter] = useState<'all' | 'remote' | 'onsite'>('all');

    // Pagination
    const [page, setPage] = useState(1);
    const itemsPerPage = 20;

    const loadData = useCallback(async () => {
        if (!companyId) return;
        setError(null);
        try {
            setLoading(true);
            const [jobsData, appsData, companyData] = await Promise.all([
                fetchCompanyJobs(companyId),
                fetchMyApplications(userId),
                fetchCompanyDetailInfo(userId, companyId).catch(() => null),
            ]);
            setJobs(jobsData);
            setCompanyInfo(companyData);

            const flatMap: Record<string, ApplicationStatus> = {};
            Object.entries(appsData).forEach(([status, trackedJobs]) => {
                trackedJobs.forEach((item: any) => {
                    flatMap[item.id || item.job?.id] = status as ApplicationStatus;
                });
            });
            setAppsMap(flatMap);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load jobs');
        } finally {
            setLoading(false);
        }
    }, [companyId, userId]);

    useEffect(() => {
        loadData();
        if (userId && companyId) {
            recordCompanyView(userId, companyId).catch(() => { });
        }
    }, [loadData, userId, companyId]);

    const toggleStatus = async (jobId: string, currentStatus: ApplicationStatus | undefined, newStatus: ApplicationStatus) => {
        try {
            if (currentStatus === newStatus) {
                await clearApplicationStatus(userId, jobId);
                setAppsMap((prev) => {
                    const next = { ...prev };
                    delete next[jobId];
                    return next;
                });
            } else {
                await setApplicationStatus(userId, jobId, newStatus);
                setAppsMap((prev) => ({ ...prev, [jobId]: newStatus }));
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to save status');
        }
    };

    const filteredJobs = useMemo(() => {
        return jobs.filter((job) => {
            // Search covers both title and location text
            const searchLower = search.toLowerCase();
            const textMatch =
                (job.title || '').toLowerCase().includes(searchLower) ||
                (job.location || '').toLowerCase().includes(searchLower);

            // Remote
            const isRemote = (job.location || '').toLowerCase().includes('remote') || (job.title || '').toLowerCase().includes('remote');
            const remoteMatch =
                remoteFilter === 'all' ||
                (remoteFilter === 'remote' && isRemote) ||
                (remoteFilter === 'onsite' && !isRemote);

            return textMatch && remoteMatch;
        });
    }, [jobs, search, remoteFilter]);

    const weeklyJobsCount = useMemo(() => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        return jobs.filter(job => {
            if (!job.first_seen_at) return false;
            return new Date(job.first_seen_at) >= sevenDaysAgo;
        }).length;
    }, [jobs]);

    const totalPages = Math.ceil(filteredJobs.length / itemsPerPage);

    // Ensure we are on a valid page after filtering
    useEffect(() => {
        if (page > totalPages && totalPages > 0) {
            setPage(1);
        }
    }, [totalPages, page]);

    const paginatedJobs = useMemo(() => {
        const startIndex = (page - 1) * itemsPerPage;
        return filteredJobs.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredJobs, page]);

    const renderJob = ({ item }: { item: Job }) => {
        const status = appsMap[item.id];
        let statusColor = colors.textSecondary;
        let statusLabel = '';

        if (status === 'applied') {
            statusColor = colors.statusApplied;
            statusLabel = 'Applied';
        } else if (status === 'interviewing') {
            statusColor = colors.statusInterviewing;
            statusLabel = 'Interviewing';
        } else if (status === 'rejected') {
            statusColor = colors.statusRejected;
            statusLabel = 'Rejected';
        }

        return (
            <View style={[styles.card, statusLabel ? { borderLeftWidth: 4, borderLeftColor: statusColor } : null]}>
                <View style={styles.cardHeader}>
                    <TouchableOpacity style={styles.titleContainer} onPress={() => Linking.openURL(item.url)}>
                        <Text style={[styles.jobTitle, { color: colors.primary }]}>{item.title}</Text>
                        <Feather name="external-link" size={14} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.menuButton}
                        onPress={() => setStatusModalJob({ id: item.id, status })}
                    >
                        <Feather name="more-vertical" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.jobMetaRow}>
                    <Text style={styles.jobMetaText}>
                        {item.location || 'Unknown Location'} • {item.posted_date ? new Date(item.posted_date).toLocaleDateString() : 'Recent'}
                    </Text>
                    {statusLabel ? (
                        <View style={styles.statusIndicator}>
                            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                    ) : null}
                </View>
            </View>
        );
    };

    const renderPagination = () => {
        if (totalPages <= 1) return null;

        const pages = [];
        const maxVisible = 5;
        let start = Math.max(1, page - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(
                <TouchableOpacity
                    key={i}
                    style={[styles.pageButton, page === i && styles.pageButtonActive]}
                    onPress={() => setPage(i)}
                >
                    <Text style={[styles.pageText, page === i && styles.pageTextActive]}>{i}</Text>
                </TouchableOpacity>
            );
        }

        return (
            <View style={styles.pagination}>
                <TouchableOpacity
                    style={[styles.pageButton, page === 1 && styles.pageDisabled]}
                    disabled={page === 1}
                    onPress={() => setPage(page - 1)}
                >
                    <Feather name="chevron-left" size={16} color={page === 1 ? colors.border : colors.textSecondary} />
                </TouchableOpacity>
                {start > 1 && (
                    <>
                        <Text style={styles.pageEllipsis}>...</Text>
                    </>
                )}
                {pages}
                {end < totalPages && (
                    <>
                        <Text style={styles.pageEllipsis}>...</Text>
                    </>
                )}
                <TouchableOpacity
                    style={[styles.pageButton, page === totalPages && styles.pageDisabled]}
                    disabled={page === totalPages}
                    onPress={() => setPage(page + 1)}
                >
                    <Feather name="chevron-right" size={16} color={page === totalPages ? colors.border : colors.textSecondary} />
                </TouchableOpacity>
            </View>
        );
    };

    if (!companyId) {
        return (
            <View style={styles.center}>
                <Text style={styles.error}>Error: No company selected</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerInner}>
                    <CompanyLogo careersUrl={companyInfo?.careers_url} companyName={companyName} size={32} colors={colors} />
                    <Text style={styles.headerTitle}>{companyName || 'Company Jobs'}</Text>
                </View>
                <Text style={styles.weeklyStat}>
                    {weeklyJobsCount} {weeklyJobsCount === 1 ? 'opportunity' : 'opportunities'} this week
                </Text>
            </View>

            <View style={styles.filtersContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Search roles or locations..."
                    value={search}
                    onChangeText={(t) => { setSearch(t); setPage(1); }}
                />
                <View style={styles.remoteFilter}>
                    {(['all', 'remote', 'onsite'] as const).map((type) => (
                        <TouchableOpacity
                            key={type}
                            style={[styles.remoteBtn, remoteFilter === type && styles.remoteBtnActive]}
                            onPress={() => { setRemoteFilter(type); setPage(1); }}
                        >
                            <Text style={[styles.remoteBtnText, remoteFilter === type && styles.remoteBtnTextActive]}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#64748B" />
                    <Text style={styles.loadingText}>Fetching jobs...</Text>
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <Text style={styles.error}>{error}</Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={paginatedJobs}
                    keyExtractor={(item) => item.id}
                    renderItem={renderJob}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>No jobs found matching your filters.</Text>
                    }
                    ListFooterComponent={renderPagination}
                />
            )}

            <Modal
                transparent
                visible={!!statusModalJob}
                animationType="fade"
                onRequestClose={() => setStatusModalJob(null)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setStatusModalJob(null)} />
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Set Application Status</Text>

                        {(['applied', 'interviewing', 'rejected'] as ApplicationStatus[]).map((s) => {
                            const isActive = statusModalJob?.status === s;
                            let color = colors.text;
                            if (s === 'applied') color = colors.statusApplied;
                            if (s === 'interviewing') color = colors.statusInterviewing;
                            if (s === 'rejected') color = colors.statusRejected;

                            return (
                                <TouchableOpacity
                                    key={s}
                                    style={[styles.modalOption, isActive && styles.modalOptionActive]}
                                    onPress={() => {
                                        if (statusModalJob) toggleStatus(statusModalJob.id, statusModalJob.status, s);
                                        setStatusModalJob(null);
                                    }}
                                >
                                    <Text style={[styles.modalOptionText, { color: isActive ? color : colors.text }]}>
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </Text>
                                    {isActive && <Feather name="check" size={18} color={color} />}
                                </TouchableOpacity>
                            );
                        })}

                        {statusModalJob?.status && (
                            <TouchableOpacity
                                style={[styles.modalOption, styles.modalOptionClear]}
                                onPress={() => {
                                    if (statusModalJob) toggleStatus(statusModalJob.id, statusModalJob.status, statusModalJob.status as ApplicationStatus);
                                    setStatusModalJob(null);
                                }}
                            >
                                <Text style={styles.modalOptionClearText}>Clear Status (Untrack)</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}


