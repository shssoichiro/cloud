import type { z } from 'zod';

export type TableInput = {
  name: string;
  columns: readonly string[];
};

export type TableQueryInterpolator<T extends TableInput> = {
  _name: T['name'];
  columns: {
    [K in T['columns'][number]]: K;
  };
  valueOf: () => T['name'];
  toString: () => T['name'];
} & {
  [K in T['columns'][number]]: `${T['name']}.${K}`;
};

export function getTable<T extends TableInput>(table: T): TableQueryInterpolator<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic mapped type requires any
  const columns = {} as { [K in T['columns'][number]]: K };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic mapped type requires any
  const columnsWithTable = {} as { [K in T['columns'][number]]: `${T['name']}.${K}` };

  for (const key of table.columns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key assignment on generic type
    (columns as any)[key] = key;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic key assignment on generic type
    (columnsWithTable as any)[key] = [table.name, key].join('.');
  }

  const result: TableQueryInterpolator<T> = {
    _name: table.name,
    valueOf() {
      return table.name;
    },
    toString() {
      return table.name;
    },
    columns,
    ...columnsWithTable,
  };

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod schema shape is inherently any-typed
export function getTableFromZodSchema<Name extends string, Schema extends z.ZodObject<any>>(
  name: Name,
  schema: Schema
): TableQueryInterpolator<{
  name: Name;
  columns: Array<Extract<keyof z.infer<Schema>, string>>;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- return type is enforced by the signature
  return getTable({ name, columns: Object.keys(schema.shape) }) as any;
}

export type BaseTableQueryInterpolator = TableQueryInterpolator<{
  name: string;
  columns: [];
}>;

export type TableSqliteTypeMap<T extends BaseTableQueryInterpolator> = {
  [K in keyof T['columns']]: string;
};

export function getCreateTableQueryFromTable<T extends BaseTableQueryInterpolator>(
  table: T,
  columnTypeMap: TableSqliteTypeMap<T>
): string {
  return `
   create table if not exists "${table.toString()}" (
      ${objectKeys(table.columns)
        .map(k => `"${String(k)}" ${String(columnTypeMap[k])}`)
        .join(',\n')}
    );
    `.trim();
}

function objectKeys<T>(obj: T): Array<keyof T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- generic Object.keys wrapper
  return Object.keys(obj as any) as any;
}
