import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useStyles, useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import { Feather } from '@expo/vector-icons';

interface Props {
    visible: boolean;
    onClose: () => void;
    userId: string;
    title?: string;
    initialCategory?: FeedbackCategory;
}

export const CATEGORIES = ['Report a bug', 'Request a company', 'Other'] as const;
export type FeedbackCategory = typeof CATEGORIES[number];

export function ContactUsModal({ visible, onClose, userId, title, initialCategory = 'Report a bug' }: Props) {
    const { colors } = useTheme();
    const [category, setCategory] = useState<FeedbackCategory>(initialCategory);
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Sync initialCategory when modal becomes visible
    React.useEffect(() => {
        if (visible) {
            setCategory(initialCategory);
        }
    }, [visible, initialCategory]);

    const styles = useStyles((c) => ({
        overlay: {
            flex: 1,
            backgroundColor: c.overlay,
            justifyContent: 'flex-end',
        },
        modalContainer: {
            backgroundColor: c.background,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 24,
            maxHeight: '90%',
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
        },
        title: {
            fontSize: 20,
            fontWeight: 'bold',
            color: c.text,
        },
        closeButton: {
            padding: 4,
        },
        label: {
            fontSize: 14,
            fontWeight: '600',
            color: c.textSecondary,
            marginBottom: 8,
            marginTop: 16,
        },
        categoryRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
        },
        categoryButton: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surface,
        },
        categoryButtonActive: {
            backgroundColor: c.primarySubtle,
            borderColor: c.primary,
        },
        categoryText: {
            fontSize: 13,
            color: c.textSecondary,
            fontWeight: '500',
        },
        categoryTextActive: {
            color: c.primaryText,
            fontWeight: '600',
        },
        textInput: {
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 8,
            padding: 12,
            height: 120,
            color: c.text,
            textAlignVertical: 'top',
        },
        submitButton: {
            backgroundColor: c.primary,
            borderRadius: 8,
            paddingVertical: 14,
            alignItems: 'center',
            marginTop: 24,
            marginBottom: Platform.OS === 'ios' ? 24 : 0,
        },
        submitButtonDisabled: {
            opacity: 0.7,
        },
        submitText: {
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: '600',
        },
        errorText: {
            color: c.error,
            fontSize: 14,
            marginTop: 12,
        },
        successContainer: {
            alignItems: 'center',
            paddingVertical: 32,
        },
        successTitle: {
            fontSize: 18,
            fontWeight: 'bold',
            color: c.text,
            marginTop: 16,
            marginBottom: 8,
        },
        successText: {
            fontSize: 14,
            color: c.textSecondary,
            textAlign: 'center',
            marginBottom: 24,
        },
    }));

    async function handleSubmit() {
        if (!message.trim()) return;

        setSubmitting(true);
        setError(null);

        try {
            const { error: dbError } = await supabase.from('feedback').insert({
                user_id: userId,
                category,
                message: message.trim(),
            });

            if (dbError) throw new Error(dbError.message);

            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Failed to submit feedback.');
        } finally {
            setSubmitting(false);
        }
    }

    function handleClose() {
        // Reset state on close
        setTimeout(() => {
            setSuccess(false);
            setMessage('');
            setCategory(initialCategory);
            setError(null);
        }, 300);
        onClose();
    }

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.header}>
                        <Text style={styles.title}>{title || 'Contact Us'}</Text>
                        <Pressable onPress={handleClose} style={styles.closeButton}>
                            <Feather name="x" size={24} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    {success ? (
                        <View style={styles.successContainer}>
                            <Feather name="check-circle" size={48} color={colors.statusInterviewing} />
                            <Text style={styles.successTitle}>Response Submitted</Text>
                            <Text style={styles.successText}>Thanks for reaching out! Your feedback helps us improve CareerPulse.</Text>
                            <Pressable
                                style={[styles.submitButton, { width: '100%', marginTop: 8 }]}
                                onPress={handleClose}
                            >
                                <Text style={styles.submitText}>Done</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <ScrollView keyboardShouldPersistTaps="handled">
                            <Text style={styles.label}>Category</Text>
                            <View style={styles.categoryRow}>
                                {CATEGORIES.map((cat) => (
                                    <Pressable
                                        key={cat}
                                        style={[
                                            styles.categoryButton,
                                            category === cat && styles.categoryButtonActive
                                        ]}
                                        onPress={() => setCategory(cat)}
                                    >
                                        <Text style={[
                                            styles.categoryText,
                                            category === cat && styles.categoryTextActive
                                        ]}>
                                            {cat}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            <Text style={styles.label}>Message</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="What's on your mind?"
                                placeholderTextColor={colors.textSecondary}
                                multiline
                                numberOfLines={4}
                                value={message}
                                onChangeText={setMessage}
                                autoCorrect
                            />

                            {error ? <Text style={styles.errorText}>{error}</Text> : null}

                            <Pressable
                                style={[styles.submitButton, (!message.trim() || submitting) && styles.submitButtonDisabled]}
                                onPress={handleSubmit}
                                disabled={!message.trim() || submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.submitText}>Submit</Text>
                                )}
                            </Pressable>
                        </ScrollView>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
