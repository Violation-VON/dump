export type TypeDesc =
  | string
  | ["a", TypeDesc | 0]
  | ["S", TypeDesc | 0]
  | ["o", number]
  | ["s", number]
  | ["k", number];

export type Field = [name: string, type: TypeDesc, offset: number];

export type Method = [
  name: string,
  returns: TypeDesc | 0,
  params: [name: string, type: TypeDesc][],
];

export interface Members {
  f: Field[];
  m: Method[];
}

export type ClassRow = [
  name: string,
  pkg: number,
  parent: number,
  isStruct: 0 | 1,
  shard: number,
];

export interface Meta {
  source: string;
  lines: number;
  counts: { fields: number; methods: number };
  pk: string[];
  c: ClassRow[];
  shards: number;
}

export interface SearchIndex {
  n: string[];
  c: number[];
  k: string;
}
