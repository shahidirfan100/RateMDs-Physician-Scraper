# RateMDs Physician Scraper

Extract physician listings from RateMDs quickly and at scale. Collect structured doctor data including ratings, review counts, contact details, clinic locations, and opening hours for research, analysis, and directory building. Built for reliable, automated data collection workflows.

## Features

- **Comprehensive physician data** — Collect names, specialties, ratings, review counts, and profile links.
- **Clinic location coverage** — Capture deduplicated clinic/location details for each physician.
- **Working hours extraction** — Gather structured clinic schedule data by day and time.
- **Pagination support** — Automatically continues across listing pages to reach your target volume.
- **Clean structured output** — Get consistent dataset items ready for analysis and export.
- **Production-ready operation** — Designed for stable large-scale runs with practical defaults.

## Use Cases

### Healthcare Directory Building
Create or enrich physician directories with profile data, specialty information, and clinic contact details. Use structured outputs to keep listings current and searchable.

### Market Intelligence
Track physician presence across specialties and regions. Compare listing depth, clinic footprint, and visibility trends over time.

### Patient Access Analysis
Analyze clinic locations and operating hours to evaluate healthcare accessibility. Support regional planning and service availability studies.

### Research and Reporting
Build datasets for quantitative healthcare research and reporting. Export clean records for dashboards, BI tools, and statistical workflows.

### Lead Qualification
Identify providers by specialty and location for outreach pipelines. Use profile and clinic data to segment and prioritize targets.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | — | Specific RateMDs listing URL to start from. |
| `specialty` | String | No | — | Specialty keyword used to build listing URL when `startUrl` is not provided. |
| `location` | String | No | — | Location keyword used to build listing URL when `startUrl` is not provided. |
| `results_wanted` | Integer | No | `20` | Target number of physician profiles to collect. Minimum is `20`. |
| `max_pages` | Integer | No | `10` | Maximum listing pages to process per run. |
| `proxyConfiguration` | Object | No | Residential proxy preset | Proxy settings for higher reliability at scale. |

---

## Output Data

Each dataset item includes:

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Physician full name. |
| `specialty` | String | Physician specialty name. |
| `specialty_slug` | String | Specialty slug value. |
| `doctor_id` | Integer | Unique physician identifier. |
| `doctor_slug` | String | Physician slug value. |
| `rating` | Number | Average physician rating. |
| `review_count` | Integer | Total number of reviews. |
| `profile_url` | String | Physician profile URL. |
| `verified` | Boolean | Whether the profile is verified. |
| `accepting_patients` | Boolean | Accepting new patients flag. |
| `accepting_virtual_appointments` | Boolean | Virtual appointments flag. |
| `appointments_enabled` | Boolean | Appointments enabled flag. |
| `appointments_available` | Boolean | Appointments available flag. |
| `ratings_disabled` | Boolean | Ratings disabled flag. |
| `is_promoted_doctor` | Boolean | Promoted profile flag. |
| `location` | String | Primary city and province/state string. |
| `city` | String | City value. |
| `province` | String | Province/state value. |
| `country` | String | Country value. |
| `address` | String | Primary clinic address. |
| `postal_code` | String | Postal/ZIP code. |
| `phone` | String | Primary phone number. |
| `website` | String | Clinic website URL. |
| `location_name` | String | Primary clinic name. |
| `location_category` | String | Clinic category/type. |
| `location_latitude` | Number | Latitude coordinate. |
| `location_longitude` | Number | Longitude coordinate. |
| `location_map` | String | Map URL. |
| `clinic_locations_count` | Integer | Number of unique clinic locations. |
| `clinic_locations` | Array | Deduplicated clinic location objects. |
| `clinic_hours_count` | Integer | Number of unique clinic hour entries. |
| `clinic_hours` | Array | Deduplicated clinic working hours records. |
| `page` | Integer | Listing page number. |
| `page_rank` | Integer | Rank of profile on that page. |
| `total_pages` | Integer | Total available listing pages for the query. |
| `total_results` | Integer | Total available listing results for the query. |
| `list_page_url` | String | Source listing URL. |
| `scraped_at` | String | ISO timestamp of data extraction. |

---

## Usage Examples

### Basic Specialty Search

Use specialty and location to collect physician listings.

```json
{
  "specialty": "acupuncturist",
  "location": "Toronto",
  "results_wanted": 20
}
```

### Direct Listing URL

Start from a specific listing URL and control crawl depth.

```json
{
  "startUrl": "https://www.ratemds.com/best-doctors/?specialty=cardiologist&location=Vancouver",
  "results_wanted": 40,
  "max_pages": 5
}
```

### Large Collection Run

Run higher-volume collection for deeper analysis.

```json
{
  "specialty": "dermatologist",
  "location": "Calgary",
  "results_wanted": 120,
  "max_pages": 15
}
```

---

## Sample Output

```json
{
  "name": "Zach Olesinski",
  "specialty": "Acupuncturist",
  "specialty_slug": "acupuncturist",
  "doctor_id": 2139876,
  "doctor_slug": "dr-zach-olesinski-toronto-on-ca",
  "rating": 4.98,
  "review_count": 265,
  "profile_url": "https://www.ratemds.com/doctor-ratings/dr-zach-olesinski-toronto-on-ca/",
  "verified": true,
  "accepting_patients": true,
  "location": "Toronto, Ontario",
  "address": "637 College Street West, Toronto ON M6G1B7",
  "phone": "(416) 402-9217",
  "website": "https://mahayahealth.com/",
  "clinic_locations_count": 2,
  "clinic_hours_count": 5,
  "page": 1,
  "page_rank": 2,
  "total_pages": 2518,
  "total_results": 25177,
  "list_page_url": "https://www.ratemds.com/best-doctors/?specialty=acupuncturist",
  "scraped_at": "2026-02-09T09:29:55.510Z"
}
```

---

## Tips for Best Results

### Start with Focused Queries
- Use specific specialty and location combinations.
- Validate your first run with smaller `max_pages`.
- Expand scope after confirming output quality.

### Optimize Collection Volume
- Keep `results_wanted` aligned with business needs.
- Increase `max_pages` for deeper market coverage.
- Schedule recurring runs for fresh datasets.

### Improve Reliability
- Use proxy settings for stable large runs.
- Avoid overly broad queries in a single run.
- Split large regions into multiple targeted runs.

### Proxy Configuration

For reliable high-volume collection:

```json
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

---

## Integrations

Connect your dataset with:

- **Google Sheets** — Analyze and share physician data quickly.
- **Airtable** — Build searchable physician and clinic databases.
- **Make** — Automate downstream data workflows.
- **Zapier** — Trigger notifications and follow-up actions.
- **Webhooks** — Send results directly to internal systems.
- **BI tools** — Power dashboards and reporting pipelines.

### Export Formats

- **JSON** — For APIs and developer workflows.
- **CSV** — For spreadsheet-based analysis.
- **Excel** — For business reporting and sharing.
- **XML** — For legacy or enterprise integrations.

---

## Frequently Asked Questions

### How many profiles can I collect per run?
You can collect large volumes depending on available listings and your input limits. Use `results_wanted` and `max_pages` to control run size.

### Does the actor handle pagination automatically?
Yes. It continues through listing pages until your target count is reached or page limit is hit.

### Why are some fields empty for certain profiles?
Some physicians do not publish complete public information. Missing values are returned as `null`.

### Can I collect data for multiple specialties or cities?
Yes. Run separate tasks for each specialty-location pair or provide dedicated start URLs per run.

### Is review text included?
No. The output keeps `review_count` and rating metrics while avoiding verbose review text details.

### What is included for clinic schedules?
You get structured, deduplicated clinic hours with day/time/timezone information.

### Does the actor visit every profile page?
No. It focuses on listing data collection for speed and efficiency.

---

## Support

For issues, improvements, or feature requests, use the Actor issue tracker or Apify Console support channels.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Schedules](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is designed for legitimate data collection and analysis use cases. You are responsible for complying with RateMDs terms, local laws, and applicable data-use regulations.
