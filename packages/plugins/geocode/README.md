# @emdash-cms/plugin-geocode

A field widget for [EmDash CMS](https://emdashcms.com) that turns an address into latitude/longitude coordinates with one click, using the free [OpenStreetMap Nominatim](https://nominatim.org/) API. No API key, no billing.

## The problem

Storing coordinates means an editor has to leave the CMS, open a maps site, find the place, copy the latitude, copy the longitude, and paste two numbers into two plain inputs (easy to swap or mistype). Meanwhile the address is already typed in right next to it.

## What this does

`geocode:geocode` drives a single `json` field that holds a small location object:

```json
{ "street": "Zwarteweg 133", "postcode": "1431 VL", "city": "Aalsmeer", "country": "Netherlands", "lat": 52.2630219, "lng": 4.7748972 }
```

The widget renders the address inputs plus a **📍 Coordinaten ophalen** button. Click it and the widget calls Nominatim, then writes `lat` and `lng` back into the same field. Both coordinates remain editable by hand, and the lookup is repeatable after an address change.

### Why the address lives in the widget

EmDash field widgets only ever receive their **own** field value — the admin render contract passes `{ value, onChange, label, id, required, options, minimal }` and gives no access to sibling fields (no `values` map, no multi-field setter). So a widget cannot read a separate `street` / `city` field and write a separate `lat` / `lng` field. This plugin therefore keeps the address parts and the coordinates together in one `json` field, which is fully self-contained and portable.

## Install

This plugin ships bundled in the EmDash workspace. In a workspace package, depend on it directly:

```jsonc
// package.json
{
  "dependencies": {
    "@emdash-cms/plugin-geocode": "workspace:*"
  }
}
```

```js
// astro.config.mjs
import { geocodePlugin } from "@emdash-cms/plugin-geocode";

emdash({
  // ...
  plugins: [geocodePlugin()],
});
```

If you run a self-hosted / trusted (in-process) EmDash where plugins are declared as descriptors, register it as a `native` plugin instead:

```js
plugins: [
  {
    id: "geocode",
    version: "0.1.0",
    entrypoint: "@emdash-cms/plugin-geocode",
    adminEntry: "@emdash-cms/plugin-geocode/admin",
    format: "native",
  },
];
```

## Use

Add a `json` field to any collection and point it at the widget:

```js
{
  slug: "location",
  type: "json",
  label: "Locatie",
  widget: "geocode:geocode",
  options: { country: "Netherlands" }
}
```

Read it in a template:

```js
const { lat, lng } = entry.data.location ?? {};
```

## Options

| Option    | Default         | Description                                                        |
| --------- | --------------- | ------------------------------------------------------------------ |
| `country` | `"Netherlands"` | Default country sent to Nominatim and used as the placeholder text |

## Data attribution & usage policy

This plugin uses the OpenStreetMap Nominatim public API. By using it you agree to the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/):

- **Attribution.** Coordinates are derived from OpenStreetMap data, © OpenStreetMap contributors (ODbL). The widget shows this attribution inline; keep an equivalent credit wherever you display the result on a map.
- **Rate limit.** Maximum 1 request per second. The widget only ever calls Nominatim on an explicit button click (never on keystroke), and shows a clear message if it is rate-limited (HTTP 429).
- **Identification.** Nominatim asks callers to identify themselves. In a browser the `User-Agent` header is fixed by the browser and the automatically sent `Referer` identifies your site, so no extra configuration is needed. For heavy or server-side use, run your own Nominatim instance.

## License

MIT
