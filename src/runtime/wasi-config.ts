export interface WASIConfig {
  args: string[];
  env: Record<string, string>;
  preopens: Record<string, string>;
  stdin?: 'inherit' | 'pipe' | 'ignore';
  stdout?: 'inherit' | 'pipe' | 'ignore';
  stderr?: 'inherit' | 'pipe' | 'ignore';
  invoke?: string;  // Function to invoke (e.g., 'main()')
}

export function createDefaultWASIConfig(): WASIConfig {
  return {
    args: [],
    env: process.env as Record<string, string>,
    preopens: {
      '/': '.',
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  };
}

export function buildWasmtimeArgs(config: WASIConfig): string[] {
  const args: string[] = [];

  // Enable WASI features needed by componentize-py components
  args.push('-S', 'cli=y');
  args.push('-S', 'http=y');
  args.push('-S', 'inherit-network=y');

  // Add function to invoke if specified
  if (config.invoke) {
    args.push('--invoke', config.invoke);
  }

  // Add environment variables
  for (const [key, value] of Object.entries(config.env)) {
    args.push('--env', `${key}=${value}`);
  }

  // Add preopens (directory mappings)
  for (const [guest, host] of Object.entries(config.preopens)) {
    args.push('--dir', `${guest}::${host}`);
  }

  // stdio is handled by execa's stdio option

  return args;
}
