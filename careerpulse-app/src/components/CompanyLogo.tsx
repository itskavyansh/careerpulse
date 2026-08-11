import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

function getDomainFromUrl(url?: string) {
    if (!url) return null;
    try {
        const obj = new URL(url);
        const domainParts = obj.hostname.replace('www.', '').split('.');
        return domainParts.length > 2 ? domainParts.slice(-2).join('.') : obj.hostname.replace('www.', '');
    } catch (e) {
        return null;
    }
}

interface Props {
    careersUrl?: string;
    companyName: string;
    size?: number;
    colors: any;
    grayedOut?: boolean;
}

export function CompanyLogo({ careersUrl, companyName, size = 48, colors, grayedOut = false }: Props) {
    const [error, setError] = useState(false);
    const token = process.env.EXPO_PUBLIC_LOGODEV_KEY;
    const domain = getDomainFromUrl(careersUrl);

    const opacity = grayedOut ? 0.4 : 1.0;

    if (!domain || error || !token) {
        const initial = companyName ? companyName.charAt(0).toUpperCase() : '?';
        return (
            <View
                style={{
                    width: size,
                    height: size,
                    borderRadius: 8,
                    backgroundColor: colors.primarySubtle || '#E0E7FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity
                }}
            >
                <Text style={{ color: colors.primary || '#4F46E5', fontSize: size * 0.5, fontWeight: 'bold' }}>
                    {initial}
                </Text>
            </View>
        );
    }

    return (
        <Image
            source={{ uri: `https://img.logo.dev/${domain}?token=${token}` }}
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                backgroundColor: colors.surface,
                opacity
            }}
            onError={() => setError(true)}
        />
    );
}
