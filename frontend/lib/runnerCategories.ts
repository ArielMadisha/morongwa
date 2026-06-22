import { Car, FileCheck, Home, IdCard, MapPin, Package, Store, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type RunnerCategory = 'courier' | 'store_parcel';

export type RunnerRequirement = {
  icon: LucideIcon;
  title: string;
  desc: string;
};

export type RunnerCategoryConfig = {
  id: RunnerCategory;
  title: string;
  summary: string;
  duties: string[];
  requirements: RunnerRequirement[];
  applyHref: string;
  accent: string;
  border: string;
  icon: LucideIcon;
};

export const RUNNER_CATEGORIES: RunnerCategoryConfig[] = [
  {
    id: 'courier',
    title: 'Courier Runner',
    summary: 'Transport items between cities.',
    duties: ['Long-distance and inter-city deliveries', 'Courier handoffs and route-based errands'],
    requirements: [
      {
        icon: FileCheck,
        title: "Driver's licence + PDP",
        desc: 'Valid licence and Professional Driving Permit (PrDP).',
      },
      {
        icon: Car,
        title: 'Vehicle inspection',
        desc: 'CarScan or similar automated inspection report.',
      },
    ],
    applyHref: '/runner/apply?type=courier',
    accent: 'from-sky-50 to-white',
    border: 'border-sky-200',
    icon: Truck,
  },
  {
    id: 'store_parcel',
    title: 'Store / Parcel Runner',
    summary: 'Collect from wholesale stores or pick up and ship parcels.',
    duties: [
      'Collect items from wholesale stores in cities like Durban/Pretoria/Gaborone/Johannesburg/Lusaka and send to clients',
      'Pick up parcels and arrange shipping',
    ],
    requirements: [
      {
        icon: IdCard,
        title: 'ID or passport',
        desc: 'Government-issued photo ID.',
      },
      {
        icon: Home,
        title: 'Proof of residence',
        desc: 'Utility bill, bank statement, or lease in your name.',
      },
    ],
    applyHref: '/runner/apply?type=store_parcel',
    accent: 'from-indigo-50 to-white',
    border: 'border-indigo-200',
    icon: Package,
  },
];

export function parseRunnerCategory(value: string | null | undefined): RunnerCategory {
  return value === 'store_parcel' ? 'store_parcel' : 'courier';
}

export function getRunnerCategoryConfig(category: RunnerCategory): RunnerCategoryConfig {
  return RUNNER_CATEGORIES.find((c) => c.id === category) ?? RUNNER_CATEGORIES[0];
}

export function getRunnerCategoryLabel(category?: RunnerCategory | string | null): string {
  return getRunnerCategoryConfig(parseRunnerCategory(category ?? undefined)).title;
}

/** Icons used in cockpit cards */
export const RUNNER_CATEGORY_ICONS = { MapPin, Store, Truck, Package };
