import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useColorScheme, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

export const FontSize = {
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
};
// ─── Warm brass / premium neutral palette ───────────────────────────────────
export const lightColors = {
    background: '#FAFAF8', // warm off-white
    surface: '#FFFFFF', // card / sheet surface
    text: '#1C1917', // Stone 900 — warm near-black
    textSecondary: '#78716C', // Stone 500 — muted warm gray
    border: '#E5E3DD', // hairline warm gray
    primary: '#A87C3F', // brass accent
    primarySubtle: '#F5EFE4', // pale brass tint (switch track, subtle bg)
    primaryText: '#7A5A2C', // deep brass (text on pale brass bg)
    statusApplied: '#B45309', // warm amber-brown
    statusInterviewing: '#15803D', // warm green (success)
    statusRejected: '#B91C1C', // warm red
    error: '#B91C1C', // warm red
    errorBg: '#FEF2F2', // unchanged — still legible
    shadowOpacity: 0,         // no shadows — borders only
    overlay: 'rgba(28,25,23,0.45)', // warm-tinted scrim
};

export const darkColors = {
    background: '#17161A', // near-black warm gray
    surface: '#211F26', // slightly lifted warm dark
    text: '#F5F3EF', // warm off-white
    textSecondary: '#A09898', // muted warm
    border: '#34323A', // hairline dark
    primary: '#C9A15E', // brighter brass — readable on dark bg
    primarySubtle: '#2E2518', // deep brass tint for switch track / subtle bg
    primaryText: '#E0C080', // light brass for text on dark brass-tinted surfaces
    statusApplied: '#D97706', // warm amber
    statusInterviewing: '#34D399', // warm green
    statusRejected: '#F87171', // red
    error: '#F87171', // unchanged
    errorBg: '#2D1515', // warm dark red bg
    shadowOpacity: 0,         // no shadows in dark mode either
    overlay: 'rgba(0,0,0,0.65)',
};
// ─────────────────────────────────────────────────────────────────────────────

export type Colors = typeof lightColors;

interface ThemeContextType {
    mode: ThemeMode;
    colors: Colors;
    setMode: (mode: ThemeMode) => void;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemColorScheme = useColorScheme();
    const [mode, setModeState] = useState<ThemeMode>('system');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        AsyncStorage.getItem('theme_mode').then((val) => {
            if (val === 'light' || val === 'dark' || val === 'system') {
                setModeState(val);
            }
            setLoaded(true);
        }).catch(() => {
            setLoaded(true);
        });
    }, []);

    const setMode = (newMode: ThemeMode) => {
        setModeState(newMode);
        AsyncStorage.setItem('theme_mode', newMode).catch(() => { });
    };

    const isDark = mode === 'dark' || (mode === 'system' && systemColorScheme === 'dark');
    const colors = isDark ? darkColors : lightColors;

    if (!loaded) return null; // Avoid flicker

    return (
        <ThemeContext.Provider value={{ mode, colors, setMode, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
}

// Helper hook to create dynamic styles
export function useStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
    factory: (colors: Colors) => T
): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
}
