
export enum HACCPCategory {
  GASTRONOMY = 'gastronomia',
  PRODUCTION = 'produkcja',
  LOGISTICS = 'logistyka',
  FOODTRUCK = 'foodtruck'
}

export type DocType = 'HACCP' | 'GHP' | 'GMP' | 'HACCP + GHP';

export interface ProductEntry {
  name: string;
  type: 'mięsne' | 'nabiałowe' | 'wegetariańskie' | 'inne';
}

export interface ProductHazard {
  productName: string;
  biological: string;
  chemical: string;
  physical: string;
}

export interface Hazard {
  step: string;
  hazardType: 'Biologiczne' | 'Chemiczne' | 'Fizyczne';
  description: string;
  prevention: string;
  isCCP: boolean;
  ccpNumber?: string;
  criticalLimit?: string;
}

export interface Equipment {
  id: string;
  name: string;
  count: number;
}

export interface ProductionStage {
  id: string;
  name: string;
  description: string;
}

export interface Supplier {
  id: string;
  name: string;
  products: string;
  contact: string;
}

export interface GHPDetail {
  equipmentName: string;
  frequency: string;
  cleaningAgent: string;
}

export interface AllergenEntry {
  productName: string;
  allergens: string[];
}

export interface WorkingConditions {
  temperature: string;
  humidity: string;
  ventilation: string;
}

export interface SOPBlock {
  id: string;
  title: string;
  content: string;
}

export interface HACCPData {
  category: HACCPCategory;
  docType: DocType;
  details: {
    name: string;
    address: string;
    nip: string;
    representative: string;
  };
  menuOrProducts: ProductEntry[];
  equipment: Equipment[];
  stages: ProductionStage[];
  suppliers: Supplier[];
  ghpDetails: GHPDetail[];
  allergenMatrix: AllergenEntry[];
  productHazards: ProductHazard[];
  fleet: Vehicle[];
  workingConditions: WorkingConditions;
  specifics: {
    waterSource?: string;
    toiletContract?: boolean;
    powerBackup?: string;
    routeType?: string;
    cargoType?: string;
    sanitizationFreq?: string;
    allergens?: string[];
  };
  hazards: Hazard[];
  sopBlocks: SOPBlock[];
}

export interface Vehicle {
  id: string;
  model: string;
  tempRange: string;
  capacity: string;
}
