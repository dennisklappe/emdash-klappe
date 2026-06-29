/** Props passed to every field widget component by the EmDash admin. */
export interface FieldWidgetProps {
	/** Current field value. For this widget: a `Location` object (see below). */
	value: unknown;
	/** Update the field value. Must receive the complete new value. */
	onChange: (value: unknown) => void;
	/** Field label from the schema. */
	label: string;
	/** HTML id attribute. */
	id: string;
	/** Whether the field is required. */
	required?: boolean;
	/** Widget-specific options from the field definition (e.g. `country`). */
	options?: Record<string, unknown>;
	/** When true, render compactly (hide the top-level label). */
	minimal?: boolean;
}

/**
 * The shape stored in the `json` field this widget drives. The address parts
 * live alongside the coordinates so the address stays editable and the lookup
 * is repeatable. Templates read `value.lat` / `value.lng`.
 */
export interface Location {
	street?: string;
	postcode?: string;
	city?: string;
	country?: string;
	lat?: number | null;
	lng?: number | null;
}
