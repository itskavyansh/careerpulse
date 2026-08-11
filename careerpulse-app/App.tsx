import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { AuthScreen } from './src/screens/AuthScreen';
import { MainNavigator } from './src/navigation/MainNavigator';
import { registerForPushNotificationsAsync } from './src/lib/pushNotifications';

import { ThemeProvider, useTheme } from './src/context/ThemeContext';

function AppContent({
  session,
  initializing,
}: {
  session: Session | null;
  initializing: boolean;
}) {
  const { isDark } = useTheme();

  if (initializing) {
    return (
      <View style={[styles.loading, { backgroundColor: isDark ? '#0F172A' : '#FAFAF9' }]}>
        <ActivityIndicator size="large" color="#2563eb" />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <AuthScreen />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </>
    );
  }

  return (
    <>
      <MainNavigator userId={session.user.id} />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    registerForPushNotificationsAsync().then(async (token) => {
      if (!token) return;
      const { error } = await supabase
        .from('profiles')
        .update({ expo_push_token: token })
        .eq('id', session.user.id);
      if (error) {
        console.warn('[Push] Failed to save token to Supabase:', error.message);
      }
    });
  }, [session?.user.id]);

  return (
    <ThemeProvider>
      <AppContent session={session} initializing={initializing} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
