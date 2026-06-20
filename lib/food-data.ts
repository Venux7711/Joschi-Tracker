export type ProteinType = 'mono' | 'multi'

export interface FoodInfo {
  brand: string
  type: string
  proteins: string[]       // Proteinquellen
  proteinType: ProteinType // mono = 1 Quelle, multi = mehrere
  proteinFamily: string[]  // 'geflügel' | 'fisch' | 'säugetier'
  notes?: string
}

export const ANIFIT_FOODS: FoodInfo[] = [
  {
    brand: 'Anifit',
    type: 'Puterichs Delight (Truthahn)',
    proteins: ['Truthahn'],
    proteinType: 'mono',
    proteinFamily: ['geflügel'],
    notes: 'Mono-Protein Geflügel – gut bei Unverträglichkeiten',
  },
  {
    brand: 'Anifit',
    type: 'Délice de Coeur (Huhn)',
    proteins: ['Huhn'],
    proteinType: 'mono',
    proteinFamily: ['geflügel'],
    notes: 'Mono-Protein Geflügel – häufigstes Katzenfutter, Hauptallergen',
  },
  {
    brand: 'Anifit',
    type: 'Bio Enten-Energie (Ente)',
    proteins: ['Ente'],
    proteinType: 'mono',
    proteinFamily: ['geflügel'],
    notes: 'Mono-Protein Geflügel – gute Alternative zu Huhn',
  },
  {
    brand: 'Anifit',
    type: 'Bio Steak Sensation (Rind)',
    proteins: ['Rind'],
    proteinType: 'mono',
    proteinFamily: ['säugetier'],
    notes: 'Mono-Protein Säugetier – selten, gut für Rotations-Diät',
  },
  {
    brand: 'Anifit',
    type: 'Powertöpfchen (Lamm/Huhn)',
    proteins: ['Lamm', 'Huhn'],
    proteinType: 'multi',
    proteinFamily: ['säugetier', 'geflügel'],
    notes: 'Multi-Protein – Lamm selten, Huhn häufig',
  },
  {
    brand: 'Anifit',
    type: 'Fisch à la Mode (Lachs/Huhn/Rentier)',
    proteins: ['Lachs', 'Huhn', 'Rentier'],
    proteinType: 'multi',
    proteinFamily: ['fisch', 'geflügel', 'säugetier'],
    notes: 'Multi-Protein mit 3 Quellen – höchstes Allergiepotenzial',
  },
  {
    brand: 'Anifit',
    type: 'Nautilus Ragout (Hering/Lachs)',
    proteins: ['Hering', 'Lachs'],
    proteinType: 'multi',
    proteinFamily: ['fisch'],
    notes: 'Multi-Protein Fisch – beide aus derselben Familie',
  },
  {
    brand: 'Anifit',
    type: 'Eismeer Terrine (Hering/Weißfisch/Lachs)',
    proteins: ['Hering', 'Weißfisch', 'Lachs'],
    proteinType: 'multi',
    proteinFamily: ['fisch'],
    notes: 'Multi-Protein Fisch – 3 Fischsorten',
  },
]

export function getFoodInfo(brand: string, type: string): FoodInfo | undefined {
  return ANIFIT_FOODS.find(
    (f) => f.brand.toLowerCase() === brand.toLowerCase() && f.type === type
  )
}

export function getProteinLabel(info: FoodInfo): string {
  const typeLabel = info.proteinType === 'mono' ? 'Mono' : 'Multi'
  return `${typeLabel}-Protein: ${info.proteins.join(', ')}`
}

export function getProteinBadgeColor(info: FoodInfo): string {
  return info.proteinType === 'mono'
    ? 'bg-green-100 text-green-700'
    : 'bg-blue-100 text-blue-700'
}
