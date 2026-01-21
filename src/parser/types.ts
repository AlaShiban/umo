export type Language = 'typescript' | 'python';

export type WITType = 'string' | 's32' | 'f64' | 'bool';

export interface Parameter {
  name: string;
  type: WITType;
}

export interface FunctionSignature {
  name: string;
  params: Parameter[];
  returnType: WITType;
}

export interface Import {
  modulePath: string;
  resolvedPath: string;
}

export interface Module {
  path: string;
  language: Language;
  imports: Import[];
  exports: FunctionSignature[];
  content: string;
  hash: string;
}

export interface DependencyGraph {
  modules: Map<string, Module>;
  edges: Map<string, Set<string>>;
}

export interface ParseResult {
  entryModule: Module;
  graph: DependencyGraph;
  allModules: Module[];
}
