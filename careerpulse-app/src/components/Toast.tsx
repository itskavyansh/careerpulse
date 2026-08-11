import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

export function Toast({ message, visible, onHide }: { message: string, visible: boolean, onHide: () => void }) {
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            opacity.setValue(0);
            Animated.sequence([
                Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.delay(2000),
                Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true })
            ]).start(() => {
                onHide();
            });
        }
    }, [visible, message]);

    return (
        <Animated.View style={[styles.container, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]} pointerEvents="none">
            <Text style={styles.text}>{message}</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 100,
        alignSelf: 'center',
        backgroundColor: '#334155', // Slate 700
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        zIndex: 9999,
    },
    text: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '500',
    }
});
