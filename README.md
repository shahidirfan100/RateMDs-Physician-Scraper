# RateMDs Physician Scraper

Scrape physician data from RateMDs.com, the leading physician review platform. Extract doctor names, specialties, ratings, reviews, locations, and contact information for medical research and analysis.

## Features

- Extract physician profiles from RateMDs search results
- Uses RateMDs internal `window.DATA.doctor_list_props.doctorPage.results` payloads
- Captures expanded internal fields (IDs, flags, ranking, location metadata)
- Handle pagination to collect large datasets
- No profile detail-page visits (optimized for high speed)
- Stealth hardening: session pool, retries, filtered resource loading, randomized delays

## Use Cases

- Medical research and physician directory building
- Healthcare market analysis
- Patient review aggregation
- Physician comparison tools
- Healthcare provider databases

## Input Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `startUrl` | string | Specific RateMDs search URL to start from | - |
| `specialty` | string | Medical specialty to search for | - |
| `location` | string | City or region to search in | - |
| `results_wanted` | integer | Maximum number of physicians to collect | 20 |
| `max_pages` | integer | Safety cap on number of pages to visit | 10 |
| `proxyConfiguration` | object | Proxy settings for reliable scraping | Residential proxy |

## Output Data

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Physician's full name |
| `specialty` | string | Medical specialty |
| `doctor_id` | integer | Internal physician ID |
| `doctor_slug` | string | Internal physician slug |
| `rating` | number | Average rating out of 5 stars |
| `review_count` | integer | Number of patient reviews |
| `location` | string | City and province/state |
| `address` | string | Full address |
| `phone` | string | Phone number |
| `website` | string | Clinic website |
| `page` | integer | Listing page where record was found |
| `page_rank` | integer | Rank on listing page |
| `profile_url` | string | Link to physician's profile page |
| `internal_doctor_extra` | object | Deduplicated internal object (review text/details removed) |

## Usage Examples

### Search by Specialty
```json
{
  "specialty": "acupuncturist",
  "location": "Toronto",
  "results_wanted": 50
}
```

### Custom Search URL
```json
{
  "startUrl": "https://www.ratemds.com/best-doctors/?specialty=cardiologist&location=Vancouver",
  "max_pages": 5
}
```

## Sample Output

```json
{
  "name": "Zach Olesinski",
  "specialty": "Acupuncturist",
  "doctor_id": 2139876,
  "rating": 4.985849056603774,
  "review_count": 265,
  "location": "Toronto, Ontario",
  "address": "637 College Street West, Toronto ON M6G1B7",
  "phone": "(416) 402-9217",
  "website": "https://mahayahealth.com/",
  "page": 1,
  "page_rank": 2,
  "profile_url": "https://www.ratemds.com/doctor-ratings/dr-zach-olesinski-toronto-on-ca/"
}
```

## Tips

- Use residential proxies for best results
- Keep random delays to reduce repeated request fingerprints
- This actor intentionally does not visit detail pages to maximize speed

## Integrations

- Apify platform for cloud execution
- Dataset exports to CSV/JSON
- Integration with healthcare analysis tools
- API access for automated workflows

## FAQ

**Q: Does this scraper work with all specialties?**
A: Yes, you can search for any medical specialty available on RateMDs.

**Q: How current is the data?**
A: Data is scraped in real-time from RateMDs.com.

**Q: Can I scrape multiple locations?**
A: Run separate actor instances for different locations.

## Legal Notice

This scraper is for research and analysis purposes. Respect RateMDs terms of service and implement appropriate delays between requests. Physician data should be used in compliance with privacy regulations.
