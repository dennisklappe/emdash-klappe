/**
 * Tiny client for the free OpenStreetMap Nominatim geocoding API.
 *
 * No API key. Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
 * asks callers to identify themselves and to send at most 1 request/second.
 * From a browser the User-Agent header is set by the browser and cannot be
 * overridden, so we rely on the automatically sent Referer to identify the
 * app, and we only ever fire a request on an explicit button click (never on
 * keystroke), which keeps us well under the rate limit.
 */

export interface GeocodeQuery {
	street?: string;
	postcode?: string;
	city?: string;
	/** Defaults to "Netherlands". */
	country?: string;
}

export interface GeocodeResult {
	lat: number;
	lng: number;
	/** The full address label Nominatim resolved to, for confirmation. */
	displayName: string;
}

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/**
 * Geocode a structured address to a single best lat/lng. Returns `null` when
 * Nominatim finds no match. Throws on network / rate-limit (HTTP not ok) so
 * the caller can show a distinct message.
 */
export async function geocodeAddress(
	query: GeocodeQuery,
	fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult | null> {
	const params = new URLSearchParams({ format: "json", limit: "1" });
	if (query.street) params.set("street", query.street);
	if (query.city) params.set("city", query.city);
	if (query.postcode) params.set("postalcode", query.postcode);
	params.set("country", query.country?.trim() || "Netherlands");

	const res = await fetchImpl(`${ENDPOINT}?${params.toString()}`, {
		headers: { Accept: "application/json" },
	});

	if (res.status === 429) {
		throw new Error("rate-limited");
	}
	if (!res.ok) {
		throw new Error(`http-${res.status}`);
	}

	const data = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
	if (!Array.isArray(data) || data.length === 0) return null;

	const lat = Number(data[0]?.lat);
	const lng = Number(data[0]?.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	return { lat, lng, displayName: data[0]?.display_name ?? "" };
}
