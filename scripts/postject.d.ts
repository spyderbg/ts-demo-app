declare module 'postject' {
  export function inject(filename: string, resourceName: string, resource: Buffer, options: { sentinelFuse: string }): Promise<void>;
}
