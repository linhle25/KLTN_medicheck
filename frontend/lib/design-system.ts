import designSystem from "@/design-system.json";

export type DesignSystem = typeof designSystem;

export const ds = designSystem;

export const colors = ds.colors;
export const semantic = ds.semantic;
export const typography = ds.typography;
export const spacing = ds.spacing;
export const radius = ds.radius;
export const brand = ds.brand;

/** CSS custom property names mapped from design-system.json */
export const cssVars = {
  "--ds-background": colors.background,
  "--ds-surface": colors.surface,
  "--ds-surface-container-lowest": colors.surfaceContainerLowest,
  "--ds-surface-container-low": colors.surfaceContainerLow,
  "--ds-surface-container": colors.surfaceContainer,
  "--ds-surface-container-high": colors.surfaceContainerHigh,
  "--ds-surface-container-highest": colors.surfaceContainerHighest,
  "--ds-surface-variant": colors.surfaceVariant,
  "--ds-on-surface": colors.onSurface,
  "--ds-on-surface-variant": colors.onSurfaceVariant,
  "--ds-primary": colors.primary,
  "--ds-primary-container": colors.primaryContainer,
  "--ds-on-primary": colors.onPrimary,
  "--ds-on-primary-container": colors.onPrimaryContainer,
  "--ds-secondary": colors.secondary,
  "--ds-secondary-container": colors.secondaryContainer,
  "--ds-tertiary": colors.tertiary,
  "--ds-tertiary-container": colors.tertiaryContainer,
  "--ds-error": colors.error,
  "--ds-error-container": colors.errorContainer,
  "--ds-outline": colors.outline,
  "--ds-outline-variant": colors.outlineVariant,
  "--ds-severe": semantic.severe,
  "--ds-warning": semantic.warning,
  "--ds-neutral": semantic.neutral,
  "--ds-radius": radius.default,
  "--ds-radius-lg": radius.lg,
  "--ds-spacing-unit": spacing.unit,
  "--ds-spacing-gutter": spacing.gutter,
  "--ds-spacing-container": spacing.containerMargin,
  "--ds-touch-min": spacing.touchTargetMin,
} as const;

export default ds;
