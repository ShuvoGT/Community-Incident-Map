// Shared English display labels for public-facing pages and share cards.
// (Localised copy for the UI lives in messages/*.json; these are used where a
// plain string is needed, e.g. generated share-card images and metadata.)

export const categoryLabel: Record<string, string> = {
  robbery_force: "Robbery with force or threat",
  snatching: "Snatching",
  pickpocketing: "Pickpocketing",
  other_theft: "Other theft",
  attempted: "Attempted robbery or theft",
};

export const timeBandLabel: Record<string, string> = {
  band_0_6: "Late night (00:00–05:59)",
  band_6_12: "Morning (06:00–11:59)",
  band_12_18: "Afternoon (12:00–17:59)",
  band_18_24: "Evening (18:00–23:59)",
  unknown: "Time unknown",
};

export const reviewLabelText: Record<string, string> = {
  community_reviewed: "Community report reviewed — not independently confirmed",
  supporting_reviewed: "Supporting material reviewed",
  independently_corroborated: "Independently corroborated",
  disputed: "Disputed and under review",
};

export const bandLabel: Record<string, string> = {
  grey: "No published reports in this period",
  yellow: "Some reported incidents",
  amber: "Elevated reported activity",
  red: "High reported activity",
};
