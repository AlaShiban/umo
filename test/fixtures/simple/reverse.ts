// Simple TypeScript module that reverses a string and adds "!"

export function reverseString(input: string): string {
  return input.split('').reverse().join('') + '!';
}
