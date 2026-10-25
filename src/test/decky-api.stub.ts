/*
 * Test-only stand-in for @decky/api, which only exists inside Decky Loader.
 * Tests install handlers on `deckyApi`; toasts are recorded.
 */

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;
type CallHandler = (method: string, ...args: any[]) => Promise<any>;

export const deckyApi = {
    fetchNoCors: (async (url: string) => { throw new Error(`fetchNoCors not stubbed: ${url}`); }) as FetchHandler,
    call: (async (method: string) => { throw new Error(`call not stubbed: ${method}`); }) as CallHandler,
    toasts: [] as any[],
};

export const fetchNoCors: FetchHandler = (url, init) => deckyApi.fetchNoCors(url, init);
export const call: CallHandler = (method, ...args) => deckyApi.call(method, ...args);
export const toaster = { toast: (data: any) => { deckyApi.toasts.push(data); } };

export const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
export const httpError = (status = 500) => new Response("", { status });
