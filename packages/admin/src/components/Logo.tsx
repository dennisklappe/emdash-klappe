import * as React from "react";

/**
 * EmDash icon mark — the rounded-rect em dash symbol.
 * Used in the sidebar brand and as favicon.
 */
export function LogoIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 75 75" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<rect
				x="3"
				y="3"
				width="69"
				height="69"
				rx="10.518"
				stroke="url(#emdash-icon-border)"
				strokeWidth="6"
			/>
			<rect x="18" y="34" width="39.3661" height="6.56101" fill="url(#emdash-icon-dash)" />
			<defs>
				<linearGradient
					id="emdash-icon-border"
					x1="-42.9996"
					y1="124"
					x2="92.4233"
					y2="-41.7456"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="#0F006B" />
					<stop offset="0.0833" stopColor="#281A81" />
					<stop offset="0.1667" stopColor="#5D0C83" />
					<stop offset="0.25" stopColor="#911475" />
					<stop offset="0.3333" stopColor="#CE2F55" />
					<stop offset="0.4167" stopColor="#FF6633" />
					<stop offset="0.5" stopColor="#F6821F" />
					<stop offset="0.5833" stopColor="#FBAD41" />
					<stop offset="0.6667" stopColor="#FFCD89" />
					<stop offset="0.75" stopColor="#FFE9CB" />
					<stop offset="0.8333" stopColor="#FFF7EC" />
					<stop offset="0.9167" stopColor="#FFF8EE" />
					<stop offset="1" stopColor="white" />
				</linearGradient>
				<linearGradient
					id="emdash-icon-dash"
					x1="91.4992"
					y1="27.4982"
					x2="28.1217"
					y2="54.1775"
					gradientUnits="userSpaceOnUse"
				>
					<stop stopColor="white" />
					<stop offset="0.1293" stopColor="#FFF8EE" />
					<stop offset="0.6171" stopColor="#FBAD41" />
					<stop offset="0.848" stopColor="#F6821F" />
					<stop offset="1" stopColor="#FF6633" />
				</linearGradient>
			</defs>
		</svg>
	);
}

/**
 * Full brand wordmark, rendered as bold "[klappe.dev]" text.
 * Consumers size it via a height class (e.g. `h-10`); the text scales to fill
 * that height and inherits the surrounding text color via `currentColor`.
 */
export function LogoLockup({ className, ...props }: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 220 40"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			role="img"
			aria-label="klappe.dev"
			preserveAspectRatio="xMidYMid meet"
			{...props}
		>
			<text
				x="0"
				y="30"
				fill="currentColor"
				fontFamily="inherit"
				fontSize="34"
				fontWeight="700"
				letterSpacing="-0.5"
			>
				[klappe.dev]
			</text>
		</svg>
	);
}

interface BrandLogoProps {
	logoUrl?: string;
	siteName?: string;
	className?: string;
}

export function BrandLogo({ logoUrl, siteName, className }: BrandLogoProps) {
	if (logoUrl) {
		return (
			<img
				src={logoUrl}
				alt={siteName || ""}
				className={className}
				style={{ objectFit: "contain" }}
			/>
		);
	}
	return <LogoLockup className={className} />;
}

interface BrandIconProps {
	logoUrl?: string;
	siteName?: string;
	className?: string;
}

export function BrandIcon({ logoUrl, siteName, className }: BrandIconProps) {
	if (logoUrl) {
		return (
			<img
				src={logoUrl}
				alt={siteName || ""}
				className={className}
				style={{ objectFit: "contain" }}
			/>
		);
	}
	return <LogoIcon className={className} />;
}
