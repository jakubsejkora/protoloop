import clsx, { type ClassValue } from 'clsx'

/** Tiny class-name joiner. Kept separate so every component imports the same one. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
