# @emdash-cms/plugin-geocode

## 0.1.0

### Minor Changes

- Adds `@emdash-cms/plugin-geocode` — a geocoding field widget for `json` fields. The `geocode:geocode` widget renders the address inputs (street, postcode, city, country) plus a "Coordinaten ophalen" button that calls the free OpenStreetMap Nominatim API and writes `lat` / `lng` back into the same field. EmDash field widgets only ever receive their own field value, so the address parts and coordinates are kept together in one self-contained `json` object. No API key, no billing; respects the Nominatim usage policy (lookup only on explicit click, OpenStreetMap attribution shown inline).
