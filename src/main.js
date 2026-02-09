import { Actor } from 'apify';
import log from '@apify/log';
import { HeaderGenerator } from 'header-generator';
import { PlaywrightCrawler } from 'crawlee';
import { firefox } from 'playwright';

const BASE_URL = 'https://www.ratemds.com';
const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_CONCURRENCY = 3;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_DELAY_MIN_MS = 300;
const DEFAULT_DELAY_MAX_MS = 1200;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.7; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
];

const TRACKER_PATTERNS = [
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'facebook.net',
    'adservice.google.com',
    'adtrafficquality.google',
    'rubiconproject.com',
    'pubmatic.com',
    'openwebmp.com',
    'amazon-adsystem.com',
];

const headerGenerator = new HeaderGenerator({
    browsers: [{ name: 'firefox', minVersion: 120, maxVersion: 147 }],
    devices: ['desktop'],
    operatingSystems: ['windows', 'macos', 'linux'],
    locales: ['en-US'],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDelay = (minMs, maxMs) => delay(randomInt(minMs, maxMs));

const toAbs = (href) => {
    if (!href) return null;
    try {
        return new URL(href, BASE_URL).href;
    } catch {
        return null;
    }
};

const strOrNull = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    return normalized.length ? normalized : null;
};

const toInt = (value) => {
    const num = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(num) ? num : null;
};

const toFloat = (value) => {
    const num = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(num) ? num : null;
};

const normalizeStartUrls = (input) => {
    const urls = [];

    const add = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            const abs = toAbs(value);
            if (abs) urls.push(abs);
            return;
        }
        if (typeof value === 'object' && typeof value.url === 'string') {
            const abs = toAbs(value.url);
            if (abs) urls.push(abs);
        }
    };

    if (Array.isArray(input.startUrls)) input.startUrls.forEach(add);
    add(input.startUrl);
    add(input.url);

    if (!urls.length) {
        const fallback = new URL('/best-doctors/', BASE_URL);
        if (strOrNull(input.specialty)) fallback.searchParams.set('specialty', String(input.specialty).trim());
        if (strOrNull(input.location)) fallback.searchParams.set('location', String(input.location).trim());
        urls.push(fallback.href);
    }

    return [...new Set(urls)];
};

const parsePagePayload = (windowData) => {
    const doctorPage = windowData?.doctor_list_props?.doctorPage;
    if (!doctorPage || !Array.isArray(doctorPage.results)) return null;
    return {
        currentPage: toInt(doctorPage.current_page),
        totalPages: toInt(doctorPage.total_pages),
        totalResults: toInt(doctorPage.count),
        doctors: doctorPage.results,
    };
};

const pickPrimaryLocation = (doctor) => (
    doctor?.location
    || doctor?.default_location
    || doctor?.doctor_locations_on_display?.[0]?.location
    || doctor?.doctor_locations?.[0]?.location
    || null
);

const normalizeAddress = (location) => {
    if (!location) return null;
    const suite = strOrNull(location.suite_on_display) || strOrNull(location.suite);
    const city = strOrNull(location.city?.name);
    const province = strOrNull(location.city?.province_slug)?.toUpperCase() || strOrNull(location.city?.province_name);
    const postalCode = strOrNull(location.postal_code);
    const locality = [city, province, postalCode].filter(Boolean).join(' ');
    return [strOrNull(location.address), suite, strOrNull(locality)].filter(Boolean).join(', ') || null;
};

const OMIT_INTERNAL_EXTRA_KEYS = new Set([
    'id',
    'slug',
    'name',
    'full_name',
    'specialty',
    'specialty_name',
    'city_name',
    'url',
    'rating',
    'sample_rating_comment',
    'sample_rating_pk',
    'location',
    'default_location',
    'doctor_locations_on_display',
    'ga_provider_data',
    'facet_url',
    'full_name_specialty',
    'full_name_possessive_form',
    'verified',
    'accepting_patients',
    'accepting_virtual_appointments',
    'appointments_enabled',
    'appointments_available',
    'ratings_disabled',
    'is_promoted_doctor',
]);

const buildInternalDoctorExtra = (doctor) => {
    if (!doctor || typeof doctor !== 'object') return null;
    const extra = JSON.parse(JSON.stringify(doctor));

    for (const key of OMIT_INTERNAL_EXTRA_KEYS) delete extra[key];

    if (extra.rating && typeof extra.rating === 'object') {
        delete extra.rating.distribution;
        delete extra.rating.bestRating;
    }

    if (Array.isArray(extra.user_ratings)) delete extra.user_ratings;
    if (Array.isArray(extra.ratings)) delete extra.ratings;

    return Object.keys(extra).length ? extra : null;
};

const normalizeDoctorFromInternalPayload = ({ doctor, listPageUrl, page, pageRank, totalPages, totalResults, includeRawInternalData }) => {
    const location = pickPrimaryLocation(doctor);
    const city = strOrNull(location?.city?.name) || strOrNull(doctor?.city_name);
    const province = strOrNull(location?.city?.province_name) || strOrNull(location?.city?.province_slug)?.toUpperCase();
    const country = strOrNull(location?.city?.country_name) || strOrNull(location?.city?.country_slug)?.toUpperCase();

    const output = {
        name: strOrNull(doctor?.full_name || doctor?.name),
        specialty: strOrNull(doctor?.specialty_name || doctor?.specialty),
        specialty_slug: strOrNull(doctor?.specialty),
        doctor_id: toInt(doctor?.id),
        doctor_slug: strOrNull(doctor?.slug),
        rating: toFloat(doctor?.rating?.average),
        review_count: toInt(doctor?.rating?.count),
        profile_url: toAbs(doctor?.url),
        verified: Boolean(doctor?.verified),
        accepting_patients: typeof doctor?.accepting_patients === 'boolean' ? doctor.accepting_patients : null,
        accepting_virtual_appointments: typeof doctor?.accepting_virtual_appointments === 'boolean'
            ? doctor.accepting_virtual_appointments
            : null,
        appointments_enabled: typeof doctor?.appointments_enabled === 'boolean' ? doctor.appointments_enabled : null,
        appointments_available: typeof doctor?.appointments_available === 'boolean' ? doctor.appointments_available : null,
        ratings_disabled: typeof doctor?.ratings_disabled === 'boolean' ? doctor.ratings_disabled : null,
        is_promoted_doctor: typeof doctor?.is_promoted_doctor === 'boolean' ? doctor.is_promoted_doctor : null,
        location: [city, province].filter(Boolean).join(', ') || null,
        city,
        province,
        country,
        address: normalizeAddress(location),
        postal_code: strOrNull(location?.postal_code),
        phone: strOrNull(location?.doc_location_phone_number || location?.phone_number),
        website: strOrNull(location?.website),
        location_name: strOrNull(location?.name),
        location_category: strOrNull(location?.category),
        location_latitude: location?.latitude ?? null,
        location_longitude: location?.longitude ?? null,
        location_map: strOrNull(location?.map),
        page,
        page_rank: pageRank,
        total_pages: totalPages,
        total_results: totalResults,
        list_page_url: listPageUrl,
        scraped_at: new Date().toISOString(),
    };

    if (includeRawInternalData) {
        const extra = buildInternalDoctorExtra(doctor);
        if (extra) output.internal_doctor_extra = extra;
    }
    return output;
};

await Actor.init();

try {
    const input = (await Actor.getInput()) ?? {};

    const resultsWanted = Math.max(1, toInt(input.results_wanted) ?? DEFAULT_RESULTS_WANTED);
    const maxPages = Math.max(1, toInt(input.max_pages) ?? DEFAULT_MAX_PAGES);
    const maxConcurrency = DEFAULT_MAX_CONCURRENCY;
    const maxRequestRetries = DEFAULT_MAX_RETRIES;
    const requestDelayMinMs = DEFAULT_DELAY_MIN_MS;
    const requestDelayMaxMs = DEFAULT_DELAY_MAX_MS;
    const includeRawInternalData = true;
    const startUrls = normalizeStartUrls(input);

    const proxyConfiguration = input.proxyConfiguration
        ? await Actor.createProxyConfiguration({ ...input.proxyConfiguration })
        : undefined;

    log.info('Starting RateMDs fast internal-payload scraper', {
        startUrls,
        resultsWanted,
        maxPages,
        maxConcurrency,
        maxRequestRetries,
        requestDelayMinMs,
        requestDelayMaxMs,
        includeRawInternalData,
        extractionSource: 'window.DATA.doctor_list_props.doctorPage.results',
        discoveredInternalEndpoints: ['/api/specialty/', '/api/banner/'],
        detailPagesVisited: false,
    });

    let pushedCount = 0;
    const pushedKeys = new Set();
    const crawledListUrls = new Set();

    const crawler = new PlaywrightCrawler({
        launchContext: {
            launcher: firefox,
            userAgent: USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)],
            launchOptions: { headless: true },
        },
        proxyConfiguration,
        maxConcurrency,
        maxRequestRetries,
        navigationTimeoutSecs: 45,
        requestHandlerTimeoutSecs: 90,
        useSessionPool: true,
        sessionPoolOptions: {
            maxPoolSize: 80,
            sessionOptions: {
                maxUsageCount: 20,
                maxErrorScore: 3,
            },
        },
        preNavigationHooks: [
            async ({ page }, gotoOptions) => {
                const headers = headerGenerator.getHeaders();
                await page.setExtraHTTPHeaders({
                    accept: headers.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'accept-language': headers['accept-language'] ?? 'en-US,en;q=0.9',
                    'cache-control': 'no-cache',
                    pragma: 'no-cache',
                    'upgrade-insecure-requests': '1',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                });

                if (!page.__resourceBlockerInstalled) {
                    page.__resourceBlockerInstalled = true;
                    await page.route('**/*', (route) => {
                        const req = route.request();
                        const reqUrl = new URL(req.url());
                        const hostname = reqUrl.hostname.toLowerCase();
                        const type = req.resourceType();
                        const normalizedUrl = req.url().toLowerCase();

                        const isRateMdsHost = hostname === 'ratemds.com'
                            || hostname === 'www.ratemds.com'
                            || hostname.endsWith('.ratemds.com');

                        if (!isRateMdsHost) return route.abort();
                        if (['image', 'font', 'media', 'stylesheet'].includes(type)) return route.abort();
                        if (normalizedUrl.includes('/mod_pagespeed_beacon')) return route.abort();
                        if (TRACKER_PATTERNS.some((pattern) => normalizedUrl.includes(pattern))) return route.abort();
                        return route.continue();
                    });
                }

                gotoOptions.waitUntil = 'domcontentloaded';
                await randomDelay(requestDelayMinMs, requestDelayMaxMs);
            },
        ],

        async requestHandler({ page, request, enqueueLinks, log: crawlerLog }) {
            if (pushedCount >= resultsWanted) return;

            const currentUrl = request.loadedUrl || request.url;
            if (crawledListUrls.has(currentUrl)) return;
            crawledListUrls.add(currentUrl);

            let pagePayload = parsePagePayload(await page.evaluate(() => window.DATA ?? null));
            if (!pagePayload) {
                await delay(1200);
                pagePayload = parsePagePayload(await page.evaluate(() => window.DATA ?? null));
            }

            if (!pagePayload) {
                crawlerLog.warning(`No internal doctor payload found at ${currentUrl}`);
                return;
            }

            const pageNumber = pagePayload.currentPage ?? toInt(new URL(currentUrl).searchParams.get('page')) ?? 1;
            const totalPages = pagePayload.totalPages ?? pageNumber;
            const totalResults = pagePayload.totalResults;

            crawlerLog.info(`LIST ${currentUrl} -> ${pagePayload.doctors.length} doctors`, {
                page: pageNumber,
                totalPages,
                totalResults,
            });

            for (let i = 0; i < pagePayload.doctors.length; i += 1) {
                if (pushedCount >= resultsWanted) break;
                const doctor = pagePayload.doctors[i];
                const record = normalizeDoctorFromInternalPayload({
                    doctor,
                    listPageUrl: currentUrl,
                    page: pageNumber,
                    pageRank: i + 1,
                    totalPages,
                    totalResults,
                    includeRawInternalData,
                });
                const dedupeKey = strOrNull(record.profile_url) || strOrNull(record.doctor_id) || `${currentUrl}#${i}`;
                if (pushedKeys.has(dedupeKey)) continue;

                await Actor.pushData(record);
                pushedKeys.add(dedupeKey);
                pushedCount += 1;
            }

            if (pushedCount >= resultsWanted) return;
            if (pageNumber >= maxPages) return;
            if (pageNumber >= totalPages) return;

            const nextUrl = new URL(currentUrl);
            nextUrl.searchParams.set('page', String(pageNumber + 1));
            if (!crawledListUrls.has(nextUrl.href)) {
                await enqueueLinks({
                    urls: [nextUrl.href],
                });
            }
        },

        failedRequestHandler: async ({ request, log: crawlerLog }, error) => {
            crawlerLog.error(`Failed request: ${request.url}`, { error: error.message });
        },
    });

    await crawler.run(startUrls.map((url) => ({ url })));
    log.info(`Finished. Pushed ${pushedCount} records.`);
} finally {
    await Actor.exit();
}
