export type TypeDesc =
  | string
  | ["a", TypeDesc | 0]
  | ["S", TypeDesc | 0]
  | ["o", number]
  | ["s", number]
  | ["k", number]
  | ["e", number];

export type Field = [name: string, type: TypeDesc, offset: number];

export type Method = [
  name: string,
  returns: TypeDesc | 0,
  params: [name: string, type: TypeDesc][],
];

export interface Members {
  f: Field[];
  m: Method[];
  v?: [name: string, value: string][];
}

export enum Kind {
  Class,
  Struct,
  Enum,
}

export const KINDS = [
  { name: "class", letter: "C" },
  { name: "struct", letter: "S" },
  { name: "enum", letter: "E" },
] as const;

export type TypeRow = [
  name: string,
  pkg: number,
  parent: number,
  kind: Kind,
];

export interface Meta {
  counts: { fields: number; methods: number; values: number };
  pk: string[];
  t: TypeRow[];
}

export interface SearchIndex {
  t: string[];
  s: string;
  n: string[];
  o: number[];
  k: string;
}
