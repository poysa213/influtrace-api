import { chunk, omit, pick } from 'lodash';
import {
  HydratedDocument,
  Document as MongooseDocument,
  Model as MongooseModel,
  QueryWithHelpers,
  Schema,
  Types,
} from 'mongoose';
import mongooseLeanVirtuals from 'mongoose-lean-virtuals';

export interface Document extends MongooseDocument<Types.ObjectId> {
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
}

export type PaginationResult<T = any> = {
  data: T[];
  firstPage: number;
  currentPage: number;
  lastPage: number | null;
  total: number | null;
  from: number;
  to: number;
  perPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type Statics<SchemaStatics = {}> = SchemaStatics & {
  batchUpdate: (
    data: any[],
    batchUpdateOptions?: BatchUpdateOptions,
  ) => Promise<Record<string, any>>;
  paginate: <T = any>(
    filter?: Record<string, any>,
    callback?: ((builder: any) => void) | null,
    paginateOptions?: PaginateOptions,
    projection?: any,
    options?: any,
  ) => Promise<PaginationResult<T>>;
};
export type Methods<SchemaMethods = {}> = SchemaMethods & {};
export type Virtuals<SchemaVirtuals = {}> = SchemaVirtuals & {};

// the return type of the query methods
export type QueryMethodReturnType<RawDocument, QueryInterface> =
  QueryWithHelpers<
    HydratedDocument<RawDocument>[],
    HydratedDocument<RawDocument>,
    QueryInterface
  >;
export type QueryMethods<
  RawDocument,
  SchemaQueryMethods = {},
> = SchemaQueryMethods & {
  onlyActive: () => QueryMethodReturnType<
    RawDocument,
    QueryMethods<RawDocument>
  >;
};

// this is final model instance
export type Model<
  // ordered by most frequent uses
  RawDocument,
  SchemaVirtuals = {}, // the virtuals defined inside the model
  SchemaMethods = {}, // the methods defined inside the model. any sub documents can be defined here like x: Types.DocumentArray<RawDoc>
  SchemaQueryMethods = {}, // the query methods defined inside the model
  SchemaStatics = {}, // statics function defined on the model
> = MongooseModel<
  RawDocument,
  QueryMethods<RawDocument, SchemaQueryMethods>,
  Methods<SchemaMethods>,
  Virtuals<SchemaVirtuals>
> &
  Statics<SchemaStatics>;

type PluginOptions = {
  timestamps?: boolean;
  virtuals?: boolean;
  active?: boolean;
  lean?: boolean;
  batchUpdate?: boolean;
  paginate?: boolean;
};

type PaginateOptions = {
  removeCount?: boolean;
  lean?: boolean;
};

type BatchUpdateOptions = {
  filterKeys?: string[];
  upsert?: boolean;
  chunkSize?: number;
};

type BatchUpdateOptionsDefault = BatchUpdateOptions & {
  filterKeys: string[];
  upsert: boolean;
  chunkSize: number;
};

const defaultPaginationResult: PaginationResult = {
  data: [],
  firstPage: 1,
  currentPage: 1,
  lastPage: 1,
  total: 0,
  from: 0,
  to: 0,
  perPage: 20,
  hasNextPage: false,
  hasPreviousPage: false,
};

export const resolveMongoosePlugins = (options?: PluginOptions) => {
  const defaultPluginOptions: PluginOptions = {
    timestamps: true,
    virtuals: true,
    active: false,
    batchUpdate: true,
    paginate: true,
  };

  options = { ...defaultPluginOptions, ...(options || {}) };

  return (schema: Schema) => {
    if (options?.timestamps) schema.set('timestamps', true);
    if (options?.virtuals) {
      schema.set('toJSON', { virtuals: true });
      schema.set('toObject', { virtuals: true });
    }

    if (options?.active) {
      schema.add({
        active: {
          type: Boolean,
          default: () => true,
        },
      });

      schema.index({ active: 1 });
    }

    if (options?.batchUpdate) {
      schema.statics.batchUpdate = async function (
        data: any[] = [],
        batchUpdateOptions?: BatchUpdateOptions,
      ) {
        const defaultOptions: BatchUpdateOptionsDefault = {
          filterKeys: ['_id'],
          upsert: true,
          chunkSize: 1000,
        };
        const options: BatchUpdateOptionsDefault = {
          ...defaultOptions,
          ...(batchUpdateOptions || {}),
        };
        const { filterKeys, upsert, chunkSize } = options;

        const chunks = chunk(data, chunkSize) as Record<string, any>[][];

        let output: Record<string, any> = {};
        for (const [index, chunk] of chunks.entries()) {
          const bulkData = chunk.map((item) => {
            const updateData = omit(item, filterKeys);
            return {
              updateOne: {
                filter: pick(item, filterKeys),
                update: {
                  $set: updateData,
                },
                upsert,
              },
            };
          });

          const writeSuccess = await this.bulkWrite(bulkData);
          output[`chunk_${index}`] = writeSuccess;
        }
        return output;
      };
    }

    if (options?.paginate) {
      schema.statics.paginate = async function (
        filter: Record<string, any> = {},
        callback: ((builder: any) => void) | null = null,
        paginateOptions: PaginateOptions = {},
        projection = undefined,
        options = undefined,
      ) {
        let { page, perPage, ...query } = filter;
        page = Math.max(page ? parseInt(page) : 1, 1);
        perPage = perPage ? parseInt(perPage) : defaultPaginationResult.perPage;
        const offset = (page - 1) * perPage;

        try {
          if (paginateOptions?.removeCount) {
            const builder = this.find(query, projection, options)
              .skip(offset)
              .limit(perPage + 1);

            if (typeof callback === 'function') {
              callback(builder);
            }
            if (paginateOptions?.lean) {
              builder.lean({ virtuals: true });
            }
            const result = await builder.exec();

            const data = [...result];

            if (data?.length > perPage) {
              data.pop();
            }

            return {
              data,
              firstPage: 1,
              currentPage: page,
              lastPage: null,
              total: null,
              from: offset + 1,
              to: offset + (data?.length ? data?.length : 0),
              perPage: perPage,
              hasNextPage: result?.length > perPage,
              hasPreviousPage: page > 1,
            };
          }
          const total = Object.keys(query).length
            ? await this.countDocuments(query)
            : await this.estimatedDocumentCount(query);

          let lastPage = total ? Math.ceil(total / perPage) : 1;

          const builder = this.find(query, projection, options)
            .skip(offset)
            .limit(perPage);

          if (typeof callback === 'function') {
            callback(builder);
          }
          if (paginateOptions?.lean) {
            builder.lean({ virtuals: true });
          }
          const data = await builder.exec();

          let from = offset + 1;
          if (from > total) from = total;

          let to = offset + (data?.length ? data?.length : 0);
          if (to > total) to = total;

          return {
            data,
            firstPage: 1,
            currentPage: page,
            lastPage: lastPage,
            total,
            from,
            to,
            perPage: perPage,
            hasNextPage: lastPage > page,
            hasPreviousPage: page > 1,
          };
        } catch (error) {
          return { ...defaultPaginationResult, perPage };
        }
      };
    }
  };
};

export const addSchemaPlugins = (schema: Schema, options?: PluginOptions) => {
  schema.plugin(resolveMongoosePlugins(options));
  if (options?.lean) schema.plugin(mongooseLeanVirtuals);
};
