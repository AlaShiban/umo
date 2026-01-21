import { WITType } from '../parser/types.js';

export function witTypeToString(type: WITType): string {
  return type;
}

export function convertToKebabCase(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export function getPackageName(modulePath: string): string {
  const fileName = modulePath.split('/').pop() || 'module';
  const nameWithoutExt = fileName.replace(/\.(ts|js|py)$/, '');
  return convertToKebabCase(nameWithoutExt);
}

export function sanitizeWITIdentifier(name: string): string {
  // WIT identifiers must be kebab-case and contain only lowercase letters, numbers, and hyphens
  return convertToKebabCase(name).replace(/[^a-z0-9-]/g, '-');
}
