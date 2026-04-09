# API Discovery Report

## Audit Summary

Current actor output (before rewrite) exposed approximately 37 top-level fields per doctor record.

Newly available fields from discovered data source include:
- `full_name_specialty`
- `sample_rating_comment`
- `sample_rating_pk`
- `enhanced_ad_enabled`
- `appointments_type`
- `appointments_custom_url`
- `appointments_enabled_zocdoc`
- `appointments_enabled_doctor_com`
- `zocdoc_doctor_profile_url`
- `doctor_com_id`
- `is_doctor_com_provider_enhanced`
- `display_address_on_listings`
- `display_call_now_button`
- `accepting_patients_badge`
- `virtual_visits_badge`
- `online_scheduling_badge`
- `ga_provider_data`
- `specialty_id` (joined from `/api/specialty/`)
- `specialty_api_name` (joined from `/api/specialty/`)

## Candidate Endpoints

### Candidate A (Selected)
- Endpoint: `https://www.ratemds.com/best-doctors/?specialty=<slug>&location=<city>&page=<n>`
- Method: `GET`
- Auth: none
- Pagination: `page` query param
- Data extraction path: `window.DATA.doctor_list_props.doctorPage.results`
- Field richness: 303 nested field paths in a sample doctor object; 41 top-level keys before normalization
- Notes: No browser automation required; works with `got-scraping`

Scoring:
- Returns JSON directly: +20 (JSON payload embedded via `JSON.parse(...)` in HTML)
- >15 unique fields: +25
- No auth required: +20
- Pagination support: +15
- Matches/extends current fields: +10
- **Total: 90**

### Candidate B
- Endpoint: `https://www.ratemds.com/api/specialty/`
- Method: `GET`
- Auth: none
- Pagination: none (`count=64`, `next=null`)
- Fields available: `id`, `slug`, `name`
- Scoring total: 65
- Usage: enrichment lookup for specialty metadata

### Candidate C
- Endpoint: `https://www.ratemds.com/api/banner/`
- Method: `GET`
- Auth: none
- Pagination: none
- Fields available: `id`, `message`, `severity`, `persistent`
- Scoring total: 50
- Usage: not useful for physician output

## Selected API
- Endpoint: `https://www.ratemds.com/best-doctors/?specialty=<slug>&location=<city>&page=<n>`
- Method: GET
- Auth: None
- Pagination: `page`
- Fields available: 300+ nested fields in doctor payload (ratings, booking/provider metadata, clinic location arrays, clinic hour arrays, profile attributes)
- Fields currently missing in old actor: additional booking/profile metadata and badges listed above
- Field count comparison: `303` discovered nested paths vs `~37` old output fields

## Discovery Notes
- Browser network capture showed first-party XHR endpoints `/api/specialty/` and `/api/banner/` only.
- Physician listing data is server-rendered into `window.DATA.doctor_list_props` and is the richest source.
- Direct browser automation is not required for extraction once this payload path is used.
