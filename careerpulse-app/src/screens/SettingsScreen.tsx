import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Switch, ScrollView } from 'react-native';
let FileSystem: any = null;
let Sharing: any = null;

try {
    FileSystem = require('expo-file-system/legacy');
} catch (e) {
    console.warn("expo-file-system native module not found, fallback enabled.");
}
try {
    Sharing = require('expo-sharing');
} catch (e) {
    console.warn("expo-sharing native module not found, fallback enabled.");
}
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { registerForPushNotificationsAsync } from '../lib/pushNotifications';
import { fetchLatestSyncTime, fetchMyApplications } from '../api';
import { useStyles, useTheme, ThemeMode } from '../context/ThemeContext';

import { ContactUsModal } from './ContactUsModal';

interface Props {
    userId: string;
}

export function SettingsScreen({ userId }: Props) {
    const { colors, mode, setMode } = useTheme();
    // ... rest of the styling logic...
    const styles = useStyles((c) => ({
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background },
        container: { flex: 1, backgroundColor: c.background },
        sectionTitle: { fontSize: 13, fontWeight: '600', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
        card: {
            backgroundColor: c.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: c.border,
            padding: 16,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: c.shadowOpacity,
            shadowRadius: 2,
            elevation: c.shadowOpacity > 0 ? 1 : 0,
        },
        accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
        accountLabel: { fontSize: 15, fontWeight: '500', color: c.text },
        accountValue: { fontSize: 14, color: c.textSecondary },
        signOutButton: {
            backgroundColor: c.errorBg,
            paddingVertical: 10,
            borderRadius: 8,
            alignItems: 'center',
        },
        signOutText: { color: c.error, fontWeight: '600', fontSize: 14 },
        // Outlined brass — consistent with Follow button and filter pills
        contactButton: {
            backgroundColor: c.surface,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: c.primary,
            alignItems: 'center',
        },
        contactButtonText: { color: c.primary, fontWeight: '600', fontSize: 14 },

        // Theme mode segment
        themeGroup: { flexDirection: 'row', backgroundColor: c.background, borderRadius: 8, padding: 4, borderWidth: 1, borderColor: c.border },
        themeButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
        themeButtonActive: { backgroundColor: c.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 1 },
        themeButtonText: { fontSize: 14, fontWeight: '500', color: c.textSecondary },
        themeButtonTextActive: { color: c.text, fontWeight: '600' },

        settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
        settingRowText: { flex: 1, paddingRight: 16 },
        settingTitle: { fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 2 },
        settingDesc: { fontSize: 13, color: c.textSecondary },
        divider: { height: 1, backgroundColor: c.border, marginVertical: 16 },
        header: { fontSize: 15, fontWeight: '600', marginBottom: 4, color: c.text },
        description: { fontSize: 13, color: c.textSecondary, marginBottom: 16, lineHeight: 18 },
        inputContainer: { flexDirection: 'row', marginBottom: 16 },
        input: {
            flex: 1,
            backgroundColor: c.background,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 6,
            paddingHorizontal: 12,
            height: 44,
            fontSize: 14,
            color: c.text,
        },
        addButton: {
            backgroundColor: c.primary,
            paddingHorizontal: 20,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 6,
            marginLeft: 12,
        },
        addButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
        list: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        tag: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            paddingLeft: 12,
            paddingRight: 6,
            paddingVertical: 6,
            borderRadius: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: c.shadowOpacity,
            shadowRadius: 2,
            elevation: c.shadowOpacity > 0 ? 1 : 0,
        },
        tagText: { color: c.text, fontSize: 13, fontWeight: '500' },
        deleteButton: { marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2 },
        deleteText: { color: c.textSecondary, fontSize: 16, fontWeight: '600' },
        emptyText: { color: c.textSecondary, fontSize: 14, marginTop: 4, width: '100%' },
    }));

    const [keywords, setKeywords] = useState<string[]>([]);
    const [inputText, setInputText] = useState('');
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [latestSyncTime, setLatestSyncTime] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [contactVisible, setContactVisible] = useState(false);

    const version = Constants.expoConfig?.version || '1.0.0';

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        const { data, error } = await supabase
            .from('profiles')
            .select('notification_keywords, notifications_enabled')
            .eq('id', userId)
            .single();

        if (error && !error.message.includes('does not exist')) {
            console.error('Failed to fetch settings:', error);
        } else {
            setKeywords(data?.notification_keywords || []);
            setNotificationsEnabled(data?.notifications_enabled ?? true);
        }

        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
            setEmail(userData.user.email || 'Unknown email');
        }

        const syncTime = await fetchLatestSyncTime();
        setLatestSyncTime(syncTime);

        setLoading(false);
    }

    async function togglePushNotifications(value: boolean) {
        setNotificationsEnabled(value);

        if (value) {
            const token = await registerForPushNotificationsAsync();
            if (!token) {
                setNotificationsEnabled(false);
                return;
            }
            await supabase.from('profiles').update({
                notifications_enabled: true,
                expo_push_token: token
            }).eq('id', userId);
        } else {
            await supabase.from('profiles').update({
                notifications_enabled: false
            }).eq('id', userId);
        }
    }

    async function handleSignOut() {
        await supabase.auth.signOut();
    }

    async function addKeyword() {
        const trimmed = inputText.trim().toLowerCase();
        if (!trimmed || keywords.includes(trimmed)) return;

        const newKeywords = [...keywords, trimmed];
        setKeywords(newKeywords);
        setInputText('');
        await updateKeywordsInDb(newKeywords);
    }

    async function removeKeyword(target: string) {
        const newKeywords = keywords.filter((k) => k !== target);
        setKeywords(newKeywords);
        await updateKeywordsInDb(newKeywords);
    }

    async function updateKeywordsInDb(newKeywords: string[]) {
        const { error } = await supabase
            .from('profiles')
            .update({ notification_keywords: newKeywords })
            .eq('id', userId);

        if (error) {
            console.error('Failed to update keywords:', error);
        }
    }

    async function handleExport() {
        if (exporting) return;

        if (!FileSystem || !Sharing) {
            alert('Export is temporarily disabled until the new EAS build is installed (Native modules missing).');
            return;
        }

        setExporting(true);
        try {
            const data = await fetchMyApplications(userId);
            const rows = [['Job Title', 'Company', 'Status', 'Job URL']];

            for (const [status, apps] of Object.entries(data)) {
                for (const app of apps as any[]) {
                    rows.push([
                        `"${app.job.title.replace(/"/g, '""')}"`,
                        `"${app.companyName.replace(/"/g, '""')}"`,
                        status,
                        `"${app.job.url}"`
                    ]);
                }
            }

            const csvContent = rows.map(e => e.join(",")).join("\n");

            const filePath = `${FileSystem.documentDirectory}MyApplications.csv`;
            await FileSystem.writeAsStringAsync(filePath, csvContent, {
                encoding: FileSystem.EncodingType.UTF8
            });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: 'Export My Applications' });
            } else {
                alert('Sharing is not available on this device');
            }
        } catch (error) {
            alert('Failed to export data');
            console.error(error);
        } finally {
            setExporting(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const ThemeModeSelector = ({ title, value }: { title: string, value: ThemeMode }) => (
        <Pressable
            style={[styles.themeButton, mode === value && styles.themeButtonActive]}
            onPress={() => setMode(value)}
        >
            <Text style={[styles.themeButtonText, mode === value && styles.themeButtonTextActive]}>{title}</Text>
        </Pressable>
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
                <View style={styles.accountRow}>
                    <Text style={styles.accountLabel}>Email</Text>
                    <Text style={styles.accountValue}>{email}</Text>
                </View>
                <Pressable style={styles.signOutButton} onPress={handleSignOut}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Appearance</Text>
            <View style={styles.card}>
                <View style={styles.themeGroup}>
                    <ThemeModeSelector title="Light" value="light" />
                    <ThemeModeSelector title="Dark" value="dark" />
                    <ThemeModeSelector title="System" value="system" />
                </View>
            </View>

            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.card}>
                <View style={styles.settingRow}>
                    <View style={styles.settingRowText}>
                        <Text style={styles.settingTitle}>Push Notifications</Text>
                        <Text style={styles.settingDesc}>Receive alerts for new jobs</Text>
                    </View>
                    <Switch
                        value={notificationsEnabled}
                        onValueChange={togglePushNotifications}
                        trackColor={{ false: colors.border, true: colors.primarySubtle }}
                        thumbColor={notificationsEnabled ? colors.primary : colors.surface}
                    />
                </View>

                <View style={styles.divider} />

                <Text style={styles.header}>Notification Keywords</Text>
                <Text style={styles.description}>
                    Only get push notifications when new jobs contain one of these keywords.
                    Leave empty to get notified for all jobs.
                </Text>

                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. intern, sde, lead..."
                        placeholderTextColor={colors.textSecondary}
                        value={inputText}
                        onChangeText={setInputText}
                        onSubmitEditing={addKeyword}
                        returnKeyType="done"
                    />
                    <Pressable style={styles.addButton} onPress={addKeyword}>
                        <Text style={styles.addButtonText}>Add</Text>
                    </Pressable>
                </View>

                <View style={styles.list}>
                    {keywords.length === 0 ? (
                        <Text style={styles.emptyText}>No keywords set. You will be notified for everything.</Text>
                    ) : (
                        keywords.map((item) => (
                            <View key={item} style={styles.tag}>
                                <Text style={styles.tagText}>{item}</Text>
                                <Pressable onPress={() => removeKeyword(item)} style={styles.deleteButton}>
                                    <Text style={styles.deleteText}>×</Text>
                                </Pressable>
                            </View>
                        ))
                    )}
                </View>
            </View>

            <Text style={styles.sectionTitle}>Sync & Data</Text>
            <View style={styles.card}>
                <View style={styles.settingRow}>
                    <View style={styles.settingRowText}>
                        <Text style={styles.settingTitle}>Sync Frequency</Text>
                        <Text style={styles.settingDesc}>
                            CareerPulse checks for new jobs once per day across all tracked companies.{'\n'}
                            {latestSyncTime ? `Last checked: ${new Date(latestSyncTime).toLocaleString()}` : ''}
                        </Text>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>Daily</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                    <View style={styles.settingRowText}>
                        <Text style={styles.settingTitle}>Export Tracked Jobs</Text>
                        <Text style={styles.settingDesc}>Download a CSV of all your applications</Text>
                    </View>
                    <Pressable
                        style={[styles.addButton, { backgroundColor: colors.primarySubtle, marginLeft: 0 }]}
                        onPress={handleExport}
                        disabled={exporting}
                    >
                        {exporting ? (
                            <ActivityIndicator size="small" color={colors.primaryText} />
                        ) : (
                            <Text style={[styles.addButtonText, { color: colors.primaryText }]}>Export</Text>
                        )}
                    </Pressable>
                </View>
            </View>

            <Text style={styles.sectionTitle}>About & Privacy</Text>
            <View style={styles.card}>
                <Text style={styles.header}>Privacy Note</Text>
                <Text style={styles.description}>
                    We only collect essential data (email for auth, your subscriptions, and tracked applications) to make CareerPulse work. We NEVER collect your resume, and there is no third-party tracking.
                </Text>

                <View style={[styles.accountRow, { marginBottom: 12 }]}>
                    <Text style={styles.accountLabel}>App Version</Text>
                    <Text style={styles.accountValue}>{version}</Text>
                </View>

                <Pressable
                    style={styles.contactButton}
                    onPress={() => setContactVisible(true)}
                >
                    <Text style={styles.contactButtonText}>Contact Us</Text>
                </Pressable>
            </View>

            <ContactUsModal
                visible={contactVisible}
                onClose={() => setContactVisible(false)}
                userId={userId}
            />
        </ScrollView>
    );
}
