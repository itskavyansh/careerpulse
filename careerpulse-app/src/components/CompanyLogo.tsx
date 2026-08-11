import React, { useState, useEffect } from 'react';
import { View, Text, Image } from 'react-native';

// ─── ATS blocklist ────────────────────────────────────────────────────────────
const ATS_DOMAINS = new Set([
    'greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com',
    'workday.com', 'myworkdayjobs.com', 'workdayjobs.com',
    'icims.com', 'taleo.net', 'successfactors.com', 'brassring.com',
    'jobvite.com', 'recruitee.com', 'zohorecruit.com', 'zoho.com',
    'linkedin.com', 'indeed.com', 'keka.com', 'freshteam.com',
]);

// Known domain corrections (careers-branded domains → real brand domain)
const DOMAIN_CORRECTIONS: Record<string, string> = {
    'metacareers.com': 'meta.com',
    'flipkartcareers.com': 'flipkart.com',
    'redditinc.com': 'reddit.com',
    'instacart.careers': 'instacart.com',
    'amazon.jobs': 'amazon.com',
    'anthropics.com': 'anthropic.com',
};

function rootDomain(hostname: string): string {
    const clean = hostname.replace(/^www\./, '');
    const parts = clean.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : clean;
}

function isAtsDomain(hostname: string): boolean {
    return ATS_DOMAINS.has(rootDomain(hostname));
}

/** Normalize a domain: fix non-standard TLDs, known corrections */
function normalizeDomain(domain: string): string {
    // Apply known corrections first
    if (DOMAIN_CORRECTIONS[domain]) return DOMAIN_CORRECTIONS[domain];
    // Non-standard career TLDs → .com
    if (domain.endsWith('.jobs') || domain.endsWith('.careers')) {
        return domain.split('.')[0] + '.com';
    }
    return domain;
}

/** Extract and normalize company domain from careersUrl */
function domainFromCareersUrl(url?: string): string | null {
    if (!url) return null;
    try {
        const hostname = new URL(url).hostname;
        if (isAtsDomain(hostname)) return null;
        const raw = rootDomain(hostname); // e.g. "careers.microsoft.com" → "microsoft.com"
        return normalizeDomain(raw);
    } catch {
        return null;
    }
}

/** Best-guess domain from name: "Razorpay" → "razorpay.com" */
function guessedDomain(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

// Module-level domain cache
const domainCache = new Map<string, string | null>();

async function resolveViaClearbit(companyName: string): Promise<string | null> {
    if (domainCache.has(companyName)) return domainCache.get(companyName)!;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
            `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(companyName)}`,
            { signal: controller.signal }
        );
        clearTimeout(timer);
        if (!res.ok) { domainCache.set(companyName, null); return null; }
        const results: { domain: string; name: string }[] = await res.json();
        const raw = results?.[0]?.domain ?? null;
        const domain = raw ? normalizeDomain(raw) : null;
        domainCache.set(companyName, domain);
        return domain;
    } catch {
        domainCache.set(companyName, null);
        return null;
    }
}

// ─── Build two URLs: Clearbit (quality) + Google favicon (reliable fallback) ──
function buildImageUrls(domain: string): [string, string] {
    const clearbit = `https://logo.clearbit.com/${domain}`;
    // Google's favicon service — works for any domain, no rate limits, no key needed
    const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    return [clearbit, googleFavicon];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
    careersUrl?: string;
    companyName: string;
    size?: number;
    colors: any;
    grayedOut?: boolean;
}

type Stage = 'clearbit' | 'google' | 'initials';

export function CompanyLogo({ careersUrl, companyName, size = 48, colors, grayedOut = false }: Props) {
    const [domain, setDomain] = useState<string | null>(null);
    const [stage, setStage] = useState<Stage>('clearbit');

    const opacity = grayedOut ? 0.4 : 1.0;

    useEffect(() => {
        setStage('clearbit');

        async function resolve() {
            // Strategy 1: extract from careersUrl
            const fromUrl = domainFromCareersUrl(careersUrl);
            if (fromUrl) {
                setDomain(fromUrl);
                return;
            }
            // Strategy 2: Clearbit Autocomplete by name
            const clearbit = await resolveViaClearbit(companyName);
            if (clearbit) {
                setDomain(clearbit);
                return;
            }
            // Strategy 3: best-guess .com domain
            setDomain(guessedDomain(companyName));
        }

        resolve();
    }, [careersUrl, companyName]);

    // ── Initials fallback ──────────────────────────────────────────────────────
    if (!domain || stage === 'initials') {
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
                    opacity,
                }}
            >
                <Text style={{ color: colors.primary || '#4F46E5', fontSize: size * 0.5, fontWeight: 'bold' }}>
                    {initial}
                </Text>
            </View>
        );
    }

    const [clearbitUrl, googleUrl] = buildImageUrls(domain);

    // ── Clearbit (high-quality) ───────────────────────────────────────────────
    if (stage === 'clearbit') {
        return (
            <Image
                source={{ uri: clearbitUrl }}
                style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.surface, opacity }}
                onError={() => setStage('google')}
            />
        );
    }

    // ── Google favicon (reliable fallback) ────────────────────────────────────
    return (
        <Image
            source={{ uri: googleUrl }}
            style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.surface, opacity }}
            onError={() => setStage('initials')}
        />
    );
}
