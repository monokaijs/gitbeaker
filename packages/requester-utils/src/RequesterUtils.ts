import { stringify } from 'qs';
import { decamelizeKeys } from 'xcase';
import type { Agent } from 'http';

// Types
export type RateLimiterFn = () => Promise<number>;
export type RateLimitOptions = Record<string, number | { method: string; limit: number }>;

export type ResponseBodyTypes =
  | Record<string, unknown>
  | Record<string, unknown>[]
  | ReadableStream
  | Blob
  | string
  | string[]
  | number
  | void
  | null;

export interface FormattedResponse<T extends ResponseBodyTypes = ResponseBodyTypes> {
  body: T;
  headers: Record<string, string>;
  status: number;
}

export interface Constructable<T = any> {
  new (...args: any[]): T;
}

export type ResourceOptions = {
  headers: { [header: string]: string };
  authHeaders: { [authHeader: string]: () => Promise<string> };
  url: string;
  rateLimits?: RateLimitOptions;
  rateLimitDuration?: number;
  agent?: Agent;
};

export type DefaultRequestOptions = {
  body?: FormData | Record<string, unknown>;
  searchParams?: Record<string, unknown>;
  sudo?: string | number;
  method?: string;
  asStream?: boolean;
  signal?: AbortSignal;
};

export type RequestOptions = {
  headers?: Record<string, string>;
  timeout?: number;
  method?: string;
  searchParams?: string;
  prefixUrl?: string;
  body?: string | FormData;
  asStream?: boolean;
  signal?: AbortSignal;
  agent?: Agent;
};

export interface RequesterType {
  get<T extends ResponseBodyTypes>(
    endpoint: string,
    options?: DefaultRequestOptions,
  ): Promise<FormattedResponse<T>>;
  post<T extends ResponseBodyTypes>(
    endpoint: string,
    options?: DefaultRequestOptions,
  ): Promise<FormattedResponse<T>>;
  put<T extends ResponseBodyTypes>(
    endpoint: string,
    options?: DefaultRequestOptions,
  ): Promise<FormattedResponse<T>>;
  patch<T extends ResponseBodyTypes>(
    endpoint: string,
    options?: DefaultRequestOptions,
  ): Promise<FormattedResponse<T>>;
  delete<T extends ResponseBodyTypes>(
    endpoint: string,
    options?: DefaultRequestOptions,
  ): Promise<FormattedResponse<T>>;
}

export type RequestHandlerFn<T extends ResponseBodyTypes = ResponseBodyTypes> = (
  endpoint: string,
  options?: Record<string, unknown>,
) => Promise<FormattedResponse<T>>;

export function formatQuery(params: Record<string, unknown> = {}): string {
  const decamelized = decamelizeKeys(params);

  // Using qs instead of query-string to support stringifying nested objects :/
  return stringify(decamelized, { arrayFormat: 'brackets' });
}

export type OptionsHandlerFn = (
  serviceOptions: ResourceOptions,
  requestOptions: RequestOptions,
) => Promise<RequestOptions>;

export async function defaultOptionsHandler(
  resourceOptions: ResourceOptions,
  {
    body,
    searchParams,
    sudo,
    signal,
    asStream = false,
    method = 'GET',
  }: DefaultRequestOptions = {},
): Promise<RequestOptions> {
  const { headers: preconfiguredHeaders, authHeaders, url, agent } = resourceOptions;
  const defaultOptions: RequestOptions = {
    method,
    asStream,
    signal,
    prefixUrl: url,
    agent,
  };

  defaultOptions.headers = { ...preconfiguredHeaders };

  if (sudo) defaultOptions.headers.sudo = `${sudo}`;

  // FIXME: Not the best comparison, but...it will have to do for now.
  if (body) {
    if (body instanceof FormData) {
      defaultOptions.body = body;
    } else {
      defaultOptions.body = JSON.stringify(decamelizeKeys(body));
      defaultOptions.headers['content-type'] = 'application/json';
    }
  }

  if (Object.keys(authHeaders).length > 0) {
    // Append dynamic auth header
    const [authHeaderKey, authHeaderFn] = Object.entries(authHeaders)[0];

    defaultOptions.headers[authHeaderKey] = await authHeaderFn();
  }

  // Format query parameters
  const q = formatQuery(searchParams);

  if (q) defaultOptions.searchParams = q;

  return Promise.resolve(defaultOptions);
}

export function createRequesterFn(
  optionsHandler: OptionsHandlerFn,
  requestHandler: RequestHandlerFn,
): (serviceOptions: ResourceOptions) => RequesterType {
  const methods = ['get', 'post', 'put', 'patch', 'delete'];

  return (serviceOptions) => {
    const requester: RequesterType = {} as RequesterType;

    methods.forEach((m) => {
      requester[m] = async (endpoint: string, options: Record<string, unknown>) => {
        const defaultRequestOptions = await defaultOptionsHandler(serviceOptions, {
          ...options,
          method: m.toUpperCase(),
        });
        const requestOptions = await optionsHandler(serviceOptions, defaultRequestOptions);

        return requestHandler(endpoint, { ...requestOptions });
      };
    });

    return requester;
  };
}

type PresetConstructors<T> = {
  [K in keyof T]: T[K];
};

function createPresetConstructor<T extends new (...args: any[]) => any>(
  Constructor: T,
  presetConfig: Record<string, unknown>,
): T {
  return class extends Constructor {
    constructor(...args: any[]) {
      const [config, ...rest] = args;
      super({ ...presetConfig, ...config }, ...(rest as ConstructorParameters<T>));
    }
  } as T;
}

export function presetResourceArguments<T extends Record<string, any>>(
  resources: T,
  customConfig: Record<string, unknown> = {},
): PresetConstructors<T> {
  const result = {} as PresetConstructors<T>;

  Object.entries(resources).forEach(([key, Constructor]) => {
    if (typeof Constructor === 'function') {
      result[key as keyof T] = createPresetConstructor(
        Constructor as new (...args: any[]) => any,
        customConfig,
      ) as any;
    } else {
      result[key as keyof T] = Constructor as any;
    }
  });

  return result;
}
