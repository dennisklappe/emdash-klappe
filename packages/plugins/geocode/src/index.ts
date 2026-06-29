/**
 * Geocode Plugin for EmDash CMS
 *
 * Provides a geocoding field widget for `json` fields. The editor fills in an
 * address (street, postcode, city, country) and clicks one button to resolve
 * it to lat/lng via the free OpenStreetMap Nominatim API (no API key). The
 * coordinates are written back into the same field and stay editable by hand.
 *
 * Usage in astro.config.mjs:
 *   import { geocodePlugin } from "@emdash-cms/plugin-geocode";
 *   emdash({ plugins: [geocodePlugin()] });
 *
 * Usage in a seed field:
 *   {
 *     "slug": "location",
 *     "type": "json",
 *     "widget": "geocode:geocode",
 *     "options": { "country": "Netherlands" }
 *   }
 */

import type { PluginDescriptor } from "emdash";
import { definePlugin } from "emdash";

const PLUGIN_ID = "geocode";
const PLUGIN_VERSION = "0.1.0";

/**
 * Create the geocode plugin instance.
 * Called by the virtual module system at runtime.
 */
export function createPlugin() {
	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		admin: {
			entry: "@emdash-cms/plugin-geocode/admin",
			fieldWidgets: [
				{
					name: "geocode",
					label: "Address → coordinates (OpenStreetMap)",
					fieldTypes: ["json"],
				},
			],
		},
	});
}

export default createPlugin;

/**
 * Create a plugin descriptor for use in an emdash() config `plugins` array.
 */
export function geocodePlugin(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		entrypoint: "@emdash-cms/plugin-geocode",
		options: {},
		adminEntry: "@emdash-cms/plugin-geocode/admin",
	};
}
