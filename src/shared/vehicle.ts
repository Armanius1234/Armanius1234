/**
 * Vehicle form rules. Same limits as the CHECK constraints on public.vehicles.
 */
import { z } from 'zod';

export const POPULAR_MAKES = [
  'BMW',
  'Mercedes-AMG',
  'Mercedes-Benz',
  'Audi',
  'Porsche',
  'Volkswagen',
  'Toyota',
  'Nissan',
  'Honda',
  'Mazda',
  'Subaru',
  'Ford',
  'Ferrari',
  'Lamborghini',
] as const;

export type VehicleErrorKey =
  | 'make_length'
  | 'model_length'
  | 'generation_length'
  | 'color_length'
  | 'year_invalid'
  | 'hp_invalid'
  | 'modifications_length'
  | 'description_length';

const optionalText = (max: number, key: VehicleErrorKey) =>
  z
    .string()
    .trim()
    .max(max, key)
    .transform((v) => (v === '' ? null : v));

export function maxModelYear(now = new Date()): number {
  return now.getFullYear() + 1;
}

export function vehicleSchema(now = new Date()) {
  return z.object({
    make: z.string().trim().min(1, 'make_length').max(40, 'make_length'),
    model: z.string().trim().min(1, 'model_length').max(60, 'model_length'),
    generation: optionalText(40, 'generation_length'),
    color: optionalText(30, 'color_length'),
    model_year: z
      .string()
      .trim()
      .regex(/^[0-9]{4}$/, 'year_invalid')
      .transform(Number)
      .refine((y) => y >= 1886 && y <= maxModelYear(now), { message: 'year_invalid' }),
    horsepower: z
      .string()
      .trim()
      .refine((v) => v === '' || /^[0-9]{1,4}$/.test(v), { message: 'hp_invalid' })
      .transform((v) => (v === '' ? null : Number(v)))
      .refine((v) => v === null || (v >= 1 && v <= 2000), { message: 'hp_invalid' }),
    modifications: z.string().max(2000, 'modifications_length').transform((v) => v.trim()),
    description: z.string().max(1000, 'description_length').transform((v) => v.trim()),
    visibility: z.enum(['public', 'private']),
  });
}

export type VehicleForm = {
  make: string;
  model: string;
  generation: string;
  color: string;
  model_year: string;
  horsepower: string;
  modifications: string;
  description: string;
  visibility: 'public' | 'private';
};

export const EMPTY_VEHICLE_FORM: VehicleForm = {
  make: '',
  model: '',
  generation: '',
  color: '',
  model_year: '',
  horsepower: '',
  modifications: '',
  description: '',
  visibility: 'public',
};

export function vehicleTitle(v: { make: string; model: string; generation?: string | null }): string {
  return [v.make, v.model, v.generation].filter(Boolean).join(' ');
}
