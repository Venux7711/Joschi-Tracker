// Zentrales Profil – wird vom KI-Prompt und vom Tierarzt-Report genutzt,
// damit die Angaben nicht auseinanderlaufen.
export const CAT_PROFILE = {
  name: 'Joschi',
  breed: 'Britisch Langhaar',
  coat: 'golden',
  condition: 'Rezidivierender Durchfall',
  /** Für Freitext/Prompts: "einen goldenen Britisch-Langhaar-Kater" */
  descriptionAccusative: 'einen goldenen Britisch-Langhaar-Kater (British Longhair)',
  /** Für Anzeige im Report: "Britisch Langhaar (golden)" */
  breedLabel: 'Britisch Langhaar (golden)',
} as const
