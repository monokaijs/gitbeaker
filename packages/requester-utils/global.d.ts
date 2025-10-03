declare module 'xcase' {
  export function decamelizeKeys(obj: any): any;
  export function camelizeKeys(obj: any): any;
}

declare module 'picomatch-browser' {
  interface PicomatchOptions {
    dot?: boolean;
    noglobstar?: boolean;
    noext?: boolean;
    nocase?: boolean;
    nonegate?: boolean;
    matchBase?: boolean;
    capture?: boolean;
  }

  interface PicomatchReturn {
    isMatch: (str: string, pattern: string, options?: PicomatchOptions) => boolean;
  }

  const picomatch: PicomatchReturn;
  export = picomatch;
}
