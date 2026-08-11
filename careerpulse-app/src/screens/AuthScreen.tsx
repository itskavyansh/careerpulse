import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useStyles, useTheme } from '../context/ThemeContext';
import type { Colors } from '../context/ThemeContext';

type AuthMode = 'login' | 'signup';

function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Wrong email or password. Please try again.';
  }
  if (lower.includes('user already registered')) {
    return 'An account with this email already exists. Try logging in instead.';
  }
  if (lower.includes('password should be at least')) {
    return 'Password must be at least 6 characters.';
  }
  if (lower.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }

  return message;
}

export function AuthScreen() {
  const { colors } = useTheme();
  const styles = useStyles((c: Colors) => ({
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      backgroundColor: c.background,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: 28,
      gap: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      textAlign: 'center',
      color: c.text,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '400',
      color: c.textSecondary,
      textAlign: 'center',
    },
    formSpacing: {
      gap: 12,
      marginTop: 8,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: 7,
      paddingHorizontal: 13,
      paddingVertical: 12,
      fontSize: 14,
      color: c.text,
      backgroundColor: c.background,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 7,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    buttonText: {
      // brass light-mode => white text; brass dark-mode (#C9A15E) => dark text
      // We can't derive this inside useStyles without isDark, so we use a
      // a single adaptive value: dark text works on both brass shades at AA.
      // Light (#A87C3F) on white background needs dark text — use surface color.
      color: c.surface === '#FFFFFF' ? '#FFFFFF' : '#1C1510',
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0.1,
    },
    switchButton: {
      marginTop: 4,
      alignItems: 'center',
    },
    switchText: {
      color: c.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
    error: {
      color: c.error,
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
    },
    info: {
      color: c.statusInterviewing,
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
    },
  }));

  // Button text color: white on light-mode brass (#A87C3F), dark on dark-mode brass (#C9A15E)
  // Determined reactively so it's always correct regardless of mode toggle.
  const btnTextColor = colors.surface === '#FFFFFF' ? '#FFFFFF' : '#1C1510';

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (authError) throw authError;
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (authError) throw authError;

        if (data.session) {
          // Email confirmation disabled — logged in immediately.
        } else {
          setInfo(
            'Account created. Check your email to confirm, then log in.',
          );
          setMode('login');
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(friendlyAuthError(message));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>CareerPulse</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Log in to your account' : 'Create an account'}
        </Text>

        <View style={styles.formSpacing}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={btnTextColor} size="small" />
          ) : (
            <Text style={[styles.buttonText, { color: btnTextColor }]}>
              {mode === 'login' ? 'Log in' : 'Sign up'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
          disabled={loading}
          style={styles.switchButton}
        >
          <Text style={styles.switchText}>
            {mode === 'login'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Log in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
