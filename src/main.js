import { Actor } from 'apify';
import log from '@apify/log';
import { gotScraping } from 'crawlee';
import { readFile } from 'node:fs/promises';

const BASE_URL = 'https://www.ratemds.com';
const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_RETRIES = 2;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.7; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const hasOwnProperties = (value) => Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
const sanitizeInputObject = (value) => {
    if (!value || typeof value !== 'object') return {};
    const cleaned = {};
    for (const [key, raw] of Object.entries(value)) {
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'string' && raw.trim() === '') continue;
        if (Array.isArray(raw) && raw.length === 0) continue;
        cleaned[key] = raw;
    }
    return cleaned;
};
const hasSearchCriteria = (value) => {
    if (!value || typeof value !== 'object') return false;
    const hasStartUrls = Array.isArray(value.startUrls) && value.startUrls.length > 0;
    return Boolean(
        strOrNull(value.startUrl)
        || strOrNull(value.url)
        || hasStartUrls
        || strOrNull(value.specialty)
        || strOrNull(value.location),
    );
};

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
    return normalized.length > 0 ? normalized : null;
};

const toInt = (value) => {
    const num = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(num) ? num : null;
};

const toFloat = (value) => {
    const num = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(num) ? num : null;
};

const boolOrNull = (value) => (typeof value === 'boolean' ? value : null);

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

const extractDoctorListProps = (html) => {
    const match = html.match(/window\.DATA\.doctor_list_props\s*=\s*JSON\.parse\("([\s\S]*?)"\);/);
    if (!match) return null;

    try {
        const encodedJson = match[1];
        const decodedJson = JSON.parse(`"${encodedJson}"`);
        return JSON.parse(decodedJson);
    } catch {
        return null;
    }
};

const parsePagePayload = (doctorListProps) => {
    const doctorPage = doctorListProps?.doctorPage;
    if (!doctorPage || !Array.isArray(doctorPage.results)) return null;

    return {
        currentPage: toInt(doctorPage.current_page),
        totalPages: toInt(doctorPage.total_pages),
        totalResults: toInt(doctorPage.count),
        doctors: doctorPage.results,
    };
};

const normalizeAddress = (location) => {
    if (!location) return null;
    const suite = strOrNull(location.suite_on_display) || strOrNull(location.suite);
    const city = strOrNull(location.city?.name);
    const province = strOrNull(location.city?.province_slug)?.toUpperCase() || strOrNull(location.city?.province_name);
    const postalCode = strOrNull(location.postal_code);
    const locality = [city, province, postalCode].filter(Boolean).join(' ');
    return [strOrNull(location.address), suite, strOrNull(locality)].filter(Boolean).join(', ') || null;
};

const pickPrimaryLocation = (doctor) => (
    doctor?.location
    || doctor?.default_location
    || doctor?.doctor_locations_on_display?.[0]?.location
    || doctor?.doctor_locations?.[0]?.location
    || null
);

const normalizeClinicLocation = (location) => {
    if (!location) return null;
    const city = strOrNull(location.city?.name);
    const province = strOrNull(location.city?.province_name) || strOrNull(location.city?.province_slug)?.toUpperCase();
    const country = strOrNull(location.city?.country_name) || strOrNull(location.city?.country_slug)?.toUpperCase();

    return {
        location_id: toInt(location.id),
        location_slug: strOrNull(location.slug),
        location_name: strOrNull(location.name),
        location_category: strOrNull(location.category),
        address: normalizeAddress(location),
        city,
        province,
        country,
        postal_code: strOrNull(location.postal_code),
        phone: strOrNull(location.doc_location_phone_number || location.phone_number),
        website: strOrNull(location.website),
        latitude: toFloat(location.latitude),
        longitude: toFloat(location.longitude),
        map_url: strOrNull(location.map),
        location_url: toAbs(location.url),
    };
};

const collectClinicLocations = (doctor) => {
    const sources = [
        doctor?.location,
        doctor?.default_location,
        ...(Array.isArray(doctor?.doctor_locations_on_display) ? doctor.doctor_locations_on_display.map((x) => x?.location) : []),
        ...(Array.isArray(doctor?.doctor_locations) ? doctor.doctor_locations.map((x) => x?.location) : []),
    ];

    const deduped = [];
    const seen = new Set();
    for (const location of sources) {
        const normalized = normalizeClinicLocation(location);
        if (!normalized) continue;
        const dedupeKey = `${normalized.location_id ?? ''}|${normalized.location_slug ?? ''}|${normalized.address ?? ''}|${normalized.phone ?? ''}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        deduped.push(normalized);
    }

    return deduped;
};

const collectClinicHours = (doctor) => {
    if (!Array.isArray(doctor?.doctor_location_hours)) return [];

    const deduped = [];
    const seen = new Set();
    for (const hour of doctor.doctor_location_hours) {
        const normalized = {
            location_id: toInt(hour?.location?.id ?? hour?.location_id),
            day_number: toInt(hour?.day_number),
            day_of_week: strOrNull(hour?.day_of_week),
            opening_hour: strOrNull(hour?.opening_hour),
            closing_hour: strOrNull(hour?.closing_hour),
            formatted_hours: strOrNull(hour?.formatted_hours),
            timezone: strOrNull(hour?.timezone),
            timezone_abbreviation: strOrNull(hour?.timezone_abbreviation),
        };

        const dedupeKey = `${normalized.location_id ?? ''}|${normalized.day_number ?? ''}|${normalized.opening_hour ?? ''}|${normalized.closing_hour ?? ''}|${normalized.timezone ?? ''}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        deduped.push(normalized);
    }

    deduped.sort((a, b) => {
        const locA = a.location_id ?? Number.MAX_SAFE_INTEGER;
        const locB = b.location_id ?? Number.MAX_SAFE_INTEGER;
        if (locA !== locB) return locA - locB;
        return (a.day_number ?? Number.MAX_SAFE_INTEGER) - (b.day_number ?? Number.MAX_SAFE_INTEGER);
    });

    return deduped;
};

const pruneValue = (value) => {
    if (value === null || value === undefined) return undefined;

    if (typeof value === 'string') {
        const cleaned = value.trim();
        return cleaned.length > 0 ? cleaned : undefined;
    }

    if (Array.isArray(value)) {
        const cleanedArray = value
            .map(pruneValue)
            .filter((item) => item !== undefined);
        if (cleanedArray.length === 0) return undefined;

        const deduped = [];
        const seen = new Set();
        for (const item of cleanedArray) {
            const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
        }
        return deduped.length > 0 ? deduped : undefined;
    }

    if (typeof value === 'object') {
        const cleanedObject = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            const cleanedValue = pruneValue(nestedValue);
            if (cleanedValue !== undefined) cleanedObject[key] = cleanedValue;
        }
        return Object.keys(cleanedObject).length > 0 ? cleanedObject : undefined;
    }

    return value;
};

const buildDoctorRecord = ({ doctor, listPageUrl, page, pageRank, totalPages, totalResults, specialtyMap }) => {
    const location = pickPrimaryLocation(doctor);
    const clinicLocations = collectClinicLocations(doctor);
    const clinicHours = collectClinicHours(doctor);
    const city = strOrNull(location?.city?.name) || strOrNull(doctor?.city_name);
    const province = strOrNull(location?.city?.province_name) || strOrNull(location?.city?.province_slug)?.toUpperCase();
    const country = strOrNull(location?.city?.country_name) || strOrNull(location?.city?.country_slug)?.toUpperCase();
    const specialtySlug = strOrNull(doctor?.specialty);
    const specialtyMeta = specialtySlug ? specialtyMap.get(specialtySlug) : null;

    return {
        name: strOrNull(doctor?.full_name || doctor?.name),
        full_name_specialty: strOrNull(doctor?.full_name_specialty),
        specialty: strOrNull(doctor?.specialty_name || doctor?.specialty),
        specialty_slug: specialtySlug,
        specialty_id: toInt(specialtyMeta?.id),
        specialty_api_name: strOrNull(specialtyMeta?.name),
        vanity_specialty: strOrNull(doctor?.vanity_specialty),
        doctor_id: toInt(doctor?.id),
        doctor_slug: strOrNull(doctor?.slug),
        rating: toFloat(doctor?.rating?.average),
        review_count: toInt(doctor?.rating?.count),
        sample_rating_comment: strOrNull(doctor?.sample_rating_comment),
        sample_rating_pk: toInt(doctor?.sample_rating_pk),
        profile_url: toAbs(doctor?.url),
        verified: boolOrNull(doctor?.verified),
        enhanced_ad_enabled: boolOrNull(doctor?.enhanced_ad_enabled),
        accepting_patients: boolOrNull(doctor?.accepting_patients),
        accepting_virtual_appointments: boolOrNull(doctor?.accepting_virtual_appointments),
        accepting_virtual_appointments_zocdoc: boolOrNull(doctor?.accepting_virtual_appointments_zocdoc),
        appointments_type: strOrNull(doctor?.appointments_type),
        appointments_enabled: boolOrNull(doctor?.appointments_enabled),
        appointments_available: boolOrNull(doctor?.appointments_available),
        appointments_custom_url: strOrNull(doctor?.appointments_custom_url),
        appointments_enabled_zocdoc: boolOrNull(doctor?.appointments_enabled_zocdoc),
        appointments_enabled_doctor_com: boolOrNull(doctor?.appointments_enabled_doctor_com),
        zocdoc_doctor_profile_url: strOrNull(doctor?.zocdoc_doctor_profile_url),
        doctor_com_id: strOrNull(doctor?.doctor_com_id),
        is_doctor_com_provider_enhanced: boolOrNull(doctor?.is_doctor_com_provider_enhanced),
        ratings_disabled: boolOrNull(doctor?.ratings_disabled),
        is_promoted_doctor: boolOrNull(doctor?.is_promoted_doctor),
        display_address_on_listings: boolOrNull(doctor?.display_address_on_listings),
        display_call_now_button: boolOrNull(doctor?.display_call_now_button),
        accepting_patients_badge: boolOrNull(doctor?.accepting_patients_badge),
        virtual_visits_badge: boolOrNull(doctor?.virtual_visits_badge),
        online_scheduling_badge: boolOrNull(doctor?.online_scheduling_badge),
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
        location_latitude: toFloat(location?.latitude),
        location_longitude: toFloat(location?.longitude),
        location_map: strOrNull(location?.map),
        page,
        page_rank: pageRank,
        total_pages: totalPages,
        total_results: totalResults,
        list_page_url: listPageUrl,
        clinic_locations_count: clinicLocations.length,
        clinic_locations: clinicLocations,
        clinic_hours_count: clinicHours.length,
        clinic_hours: clinicHours,
        ga_provider_data: doctor?.ga_provider_data ?? null,
        scraped_at: new Date().toISOString(),
    };
};

const fetchBody = async ({ url, proxyConfiguration, acceptHeader, referer }) => {
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl() : undefined;
    const userAgent = USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)];

    const response = await gotScraping({
        url,
        proxyUrl,
        throwHttpErrors: false,
        timeout: { request: 45_000 },
        retry: { limit: 0 },
        headers: {
            'user-agent': userAgent,
            accept: acceptHeader,
            'accept-language': 'en-US,en;q=0.9',
            referer,
            'cache-control': 'no-cache',
            pragma: 'no-cache',
        },
    });

    if (response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode} for ${url}`);
    }

    return response.body;
};

const fetchWithRetries = async ({ url, proxyConfiguration, acceptHeader, referer, retries = DEFAULT_RETRIES }) => {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            return await fetchBody({ url, proxyConfiguration, acceptHeader, referer });
        } catch (error) {
            if (attempt >= retries) throw error;
            log.warning(`Request retry ${attempt + 1}/${retries} for ${url}: ${error.message}`);
            await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
            attempt += 1;
        }
    }
    throw new Error(`Failed to fetch ${url}`);
};

const fetchSpecialtyMap = async (proxyConfiguration) => {
    const specialtyMap = new Map();
    const endpoint = `${BASE_URL}/api/specialty/`;

    try {
        const body = await fetchWithRetries({
            url: endpoint,
            proxyConfiguration,
            acceptHeader: 'application/json, text/plain, */*',
            referer: `${BASE_URL}/`,
            retries: 1,
        });
        const payload = JSON.parse(body);
        for (const item of payload?.results ?? []) {
            const slug = strOrNull(item?.slug);
            if (!slug) continue;
            specialtyMap.set(slug, {
                id: toInt(item?.id),
                name: strOrNull(item?.name),
            });
        }
        log.info(`Loaded specialty metadata for ${specialtyMap.size} specialties from /api/specialty/.`);
    } catch (error) {
        log.warning(`Could not load /api/specialty/ metadata: ${error.message}`);
    }

    return specialtyMap;
};

const loadEffectiveInput = async () => {
    const runtimeInput = sanitizeInputObject((await Actor.getInput()) ?? {});

    let fallbackInput = sanitizeInputObject((await Actor.getValue('INPUT')) ?? {});
    if (!hasSearchCriteria(fallbackInput)) {
        try {
            const rawInputFile = (await readFile('INPUT.json', 'utf8')).replace(/^\uFEFF/, '');
            const localFallback = sanitizeInputObject(JSON.parse(rawInputFile));
            fallbackInput = { ...localFallback, ...fallbackInput };
        } catch {
            // Ignore when INPUT.json is not available.
        }
    }

    if (hasSearchCriteria(runtimeInput)) {
        return { input: runtimeInput, source: 'runtime' };
    }

    if (hasSearchCriteria(fallbackInput)) {
        return {
            input: { ...fallbackInput, ...runtimeInput },
            source: hasOwnProperties(runtimeInput) ? 'runtime + INPUT.json fallback' : 'INPUT.json fallback',
        };
    }

    if (hasOwnProperties(runtimeInput)) {
        return { input: runtimeInput, source: 'runtime' };
    }

    if (hasOwnProperties(fallbackInput)) {
        return { input: fallbackInput, source: 'INPUT.json fallback' };
    }

    return { input: {}, source: 'empty' };
};

await Actor.init();

try {
    const { input, source: inputSource } = await loadEffectiveInput();
    const resultsWanted = Math.max(1, toInt(input.results_wanted) ?? DEFAULT_RESULTS_WANTED);
    const configuredMaxPages = Math.max(1, toInt(input.max_pages) ?? DEFAULT_MAX_PAGES);
    const minimumPagesForTarget = Math.max(1, Math.ceil(resultsWanted / 10));
    const maxPages = Math.max(configuredMaxPages, minimumPagesForTarget);
    const startUrls = normalizeStartUrls(input);

    const proxyConfiguration = input.proxyConfiguration
        ? await Actor.createProxyConfiguration({ ...input.proxyConfiguration })
        : undefined;

    log.info('Starting RateMDs API-based extractor via got-scraping.', {
        inputSource,
        startUrls,
        resultsWanted,
        configuredMaxPages,
        minimumPagesForTarget,
        maxPages,
        extractionSource: 'window.DATA.doctor_list_props (embedded JSON payload)',
        auxiliaryApiEndpoints: ['/api/specialty/', '/api/banner/'],
        browserNeeded: false,
    });

    const specialtyMap = await fetchSpecialtyMap(proxyConfiguration);

    let pushedCount = 0;
    let duplicateCount = 0;
    const pushedKeys = new Set();
    const visitedListUrls = new Set();

    for (const startUrl of startUrls) {
        if (pushedCount >= resultsWanted) break;
        const currentUrl = new URL(startUrl);
        let nextPage = toInt(currentUrl.searchParams.get('page')) ?? 1;

        while (pushedCount < resultsWanted) {
            if (nextPage > maxPages) break;
            currentUrl.searchParams.set('page', String(nextPage));
            const listUrl = currentUrl.href;
            if (visitedListUrls.has(listUrl)) break;
            visitedListUrls.add(listUrl);

            let html;
            try {
                html = await fetchWithRetries({
                    url: listUrl,
                    proxyConfiguration,
                    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    referer: `${BASE_URL}/`,
                });
            } catch (error) {
                log.error(`Failed to fetch list page: ${listUrl}`, { error: error.message });
                break;
            }

            const doctorListProps = extractDoctorListProps(html);
            const pagePayload = parsePagePayload(doctorListProps);
            if (!pagePayload) {
                log.warning(`Doctor payload was not found on ${listUrl}`);
                break;
            }
            if (!Array.isArray(pagePayload.doctors) || pagePayload.doctors.length === 0) {
                log.info(`No doctors found on ${listUrl}`);
                break;
            }

            const pageNumber = pagePayload.currentPage ?? nextPage;
            const totalPages = pagePayload.totalPages ?? pageNumber;
            const totalResults = pagePayload.totalResults;

            for (let i = 0; i < pagePayload.doctors.length; i += 1) {
                if (pushedCount >= resultsWanted) break;
                const doctor = pagePayload.doctors[i];
                const fallbackKey = `${listUrl}#${i}`;
                const dedupeKey = strOrNull(doctor?.id) || strOrNull(doctor?.slug) || strOrNull(doctor?.url) || fallbackKey;
                if (pushedKeys.has(dedupeKey)) {
                    duplicateCount += 1;
                    continue;
                }

                const rawRecord = buildDoctorRecord({
                    doctor,
                    listPageUrl: listUrl,
                    page: pageNumber,
                    pageRank: i + 1,
                    totalPages,
                    totalResults,
                    specialtyMap,
                });

                const cleanedRecord = pruneValue(rawRecord);
                if (!cleanedRecord || typeof cleanedRecord !== 'object') continue;

                await Actor.pushData(cleanedRecord);
                pushedKeys.add(dedupeKey);
                pushedCount += 1;
            }

            if (pushedCount >= resultsWanted) break;
            if (pageNumber >= totalPages) break;
            nextPage = pageNumber + 1;
        }
    }

    log.info(`Finished. Pushed ${pushedCount} unique records. Skipped ${duplicateCount} duplicate records.`);
} finally {
    await Actor.exit();
}
