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

export type ClassRow = [
  name: string,
  pkg: number,
  parent: number,
  kind: 0 | 1 | 2,
];

export interface Meta {
  counts: { fields: number; methods: number; values: number };
  pk: string[];
  c: ClassRow[];
}

export interface SearchIndex {
  t: string[];
  s: string;
  n: string[];
  c: number[];
  k: string;
}
