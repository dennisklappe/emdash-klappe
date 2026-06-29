import * as React from "react";

import { geocodeAddress } from "../nominatim";
import type { FieldWidgetProps, Location } from "../types";

/**
 * Geocode field widget for a single `json` field holding a `Location`
 * `{ street, postcode, city, country, lat, lng }`.
 *
 * EmDash field widgets only ever receive their OWN field value (there is no
 * sibling-field access in the admin's render contract), so this widget owns
 * the address inputs that drive the lookup. The editor fills in the address,
 * clicks "Coordinaten ophalen", and the widget calls the free OpenStreetMap
 * Nominatim API and writes `lat` / `lng` back into the same field. Both
 * coordinates can also be typed by hand.
 *
 * Field usage:
 *   { slug: "location", type: "json", widget: "geocode:geocode",
 *     options: { country: "Netherlands" } }
 */

// Theme-aware via the CSS variables the EmDash (Kumo) admin defines, with
// sensible dark-mode fallbacks. Same pattern the EuropaSign widgets use, so no
// dependency on @cloudflare/kumo (which 500s the dev server).
const C = {
	text: "var(--kumo-color-text, #e6e8eb)",
	textDim: "var(--kumo-color-text-secondary, #aab2bd)",
	panel: "var(--kumo-color-surface-2, #1b1e24)",
	field: "var(--kumo-color-surface-3, #23272f)",
	border: "var(--kumo-color-border, #353b46)",
	accent: "var(--kumo-color-primary, #6aa0ff)",
};

const S = {
	wrap: { display: "grid", gap: 12 } as const,
	panel: {
		border: `1px solid ${C.border}`,
		borderRadius: 10,
		padding: 14,
		background: C.panel,
		display: "grid",
		gap: 12,
	} as const,
	label: { fontSize: 12, fontWeight: 600, color: C.textDim } as const,
	input: {
		padding: "8px 10px",
		border: `1px solid ${C.border}`,
		borderRadius: 7,
		fontSize: 13,
		width: "100%",
		boxSizing: "border-box" as const,
		background: C.field,
		color: C.text,
	} as const,
	row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const,
	btn: {
		padding: "9px 14px",
		border: "none",
		borderRadius: 8,
		background: C.accent,
		color: "#0b1220",
		fontSize: 13,
		fontWeight: 700,
		cursor: "pointer",
		justifySelf: "start" as const,
	} as const,
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
	<label style={{ display: "grid", gap: 4 }}>
		<span style={S.label}>{label}</span>
		{children}
	</label>
);

function asLocation(value: unknown): Location {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Location) : {};
}

const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function GeocodeField({ value, onChange, label, id, options, minimal }: FieldWidgetProps) {
	const loc = asLocation(value);
	const defaultCountry = String(options?.country ?? "Netherlands");
	const [status, setStatus] = React.useState<{ kind: "idle" | "loading" | "ok" | "warn" | "error"; msg: string }>(
		{ kind: "idle", msg: "" },
	);

	const patch = (next: Partial<Location>) => onChange({ ...loc, ...next });

	async function lookup() {
		setStatus({ kind: "loading", msg: "Coordinaten ophalen…" });
		try {
			const result = await geocodeAddress({
				street: loc.street,
				postcode: loc.postcode,
				city: loc.city,
				country: loc.country || defaultCountry,
			});
			if (!result) {
				setStatus({ kind: "warn", msg: "Geen resultaat gevonden. Controleer het adres." });
				return;
			}
			onChange({ ...loc, lat: result.lat, lng: result.lng });
			setStatus({ kind: "ok", msg: `Gevonden · ${result.displayName}` });
		} catch (err) {
			const reason = err instanceof Error ? err.message : "";
			setStatus({
				kind: "error",
				msg:
					reason === "rate-limited"
						? "Even wachten · te veel aanvragen (max 1 per seconde)."
						: "Ophalen mislukt. Probeer het opnieuw.",
			});
		}
	}

	const statusColor =
		status.kind === "ok"
			? "#5fb87a"
			: status.kind === "warn"
				? "#d9a441"
				: status.kind === "error"
					? "#e06a6a"
					: C.textDim;

	return (
		<div id={id} style={S.wrap}>
			{!minimal && label ? <span style={{ ...S.label, fontSize: 13 }}>{label}</span> : null}
			<div style={S.panel}>
				<Field label="Straat + huisnummer">
					<input
						style={S.input}
						value={loc.street ?? ""}
						placeholder="bv. Zwarteweg 133"
						onChange={(e) => patch({ street: e.target.value })}
					/>
				</Field>
				<div style={S.row2}>
					<Field label="Postcode">
						<input
							style={S.input}
							value={loc.postcode ?? ""}
							placeholder="1431 VL"
							onChange={(e) => patch({ postcode: e.target.value })}
						/>
					</Field>
					<Field label="Plaats">
						<input
							style={S.input}
							value={loc.city ?? ""}
							placeholder="Aalsmeer"
							onChange={(e) => patch({ city: e.target.value })}
						/>
					</Field>
				</div>
				<Field label="Land">
					<input
						style={S.input}
						value={loc.country ?? ""}
						placeholder={defaultCountry}
						onChange={(e) => patch({ country: e.target.value })}
					/>
				</Field>

				<button type="button" style={S.btn} onClick={lookup} disabled={status.kind === "loading"}>
					{"📍"} Coordinaten ophalen
				</button>

				<div style={S.row2}>
					<Field label="Latitude">
						<input
							style={S.input}
							type="number"
							step="any"
							value={loc.lat ?? ""}
							onChange={(e) => patch({ lat: numOrNull(e.target.value) })}
						/>
					</Field>
					<Field label="Longitude">
						<input
							style={S.input}
							type="number"
							step="any"
							value={loc.lng ?? ""}
							onChange={(e) => patch({ lng: numOrNull(e.target.value) })}
						/>
					</Field>
				</div>

				{status.msg ? <span style={{ fontSize: 12, color: statusColor }}>{status.msg}</span> : null}
				<span style={{ fontSize: 11, color: C.textDim }}>
					Coordinaten via OpenStreetMap Nominatim · © OpenStreetMap-bijdragers
				</span>
			</div>
		</div>
	);
}
