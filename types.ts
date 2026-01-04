
export enum HACCPCategory {
  GASTRONOMY = 'gastronomia',
  PRODUCTION = 'produkcja',
  LOGISTICS = 'logistyka',
  FOODTRUCK = 'foodtruck'
}

export type DocType = 'HACCP' | 'GHP' | 'GMP' | 'HACCP + GHP';

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

export interface AllergenEntry {
  productName: string;
  allergens: string[];
}

export interface WorkingConditions {
  temperature: string;
  humidity: string;
  ventilation: string;
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
  menuOrProducts: string[];
  equipment: Equipment[];
  stages: ProductionStage[];
  suppliers: Supplier[];
  allergenMatrix: AllergenEntry[];
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
  sopBlocks: string[];
}

export interface Vehicle {
  id: string;
  model: string;
  tempRange: string;
  capacity: string;
}
