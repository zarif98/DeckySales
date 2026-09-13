import { call, fetchNoCors, toaster } from "@decky/api";
import type { ToastData } from "@decky/api";

/*
 * The one place the plugin touches Decky's runtime API.
 *
 * Decky Loader's current API (@decky/api) replaced the old ServerAPI object,
 * and the loader has announced removal of the old calling convention. The
 * services were written against the old shape, so this adapter presents that
 * shape on top of the new API: services keep a single injected dependency,
 * and the test suite keeps driving them with a fake of the same interface.
 *
 * Everything below `createPlatform` is deliberately thin. The logic lives in
 * the services, where it is tested.
 */

export interface DeckyServer {
    /** HTTP without CORS restrictions, resolved as `{ success, result: { status, body } }`. */
    fetchNoCors(url: string, init?: RequestInit): Promise<{ success: boolean; result: any }>;
    /** Call a method on the Python backend with named arguments. */
    callPluginMethod(method: string, args: Record<string, unknown>): Promise<{ success: boolean; result: any }>;
    toaster: { toast(data: ToastData): unknown };
}

/**
 * The new API passes backend arguments by position, not by name. Listing each
 * method's parameter order explicitly keeps that mapping obvious and
 * independent of object key ordering. Must match main.py.
 */
const BACKEND_ARGUMENT_ORDER: Record<string, readonly string[]> = {
    settings_load: ["key", "defaults"],
    settings_save: ["key", "value"],
};

export function createPlatform(): DeckyServer {
    return {
        async fetchNoCors(url, init) {
            try {
                const response = await fetchNoCors(url, init);
                const body = await response.text();
                return { success: response.ok, result: { status: response.status, body } };
            } catch (e) {
                return { success: false, result: String(e) };
            }
        },

        async callPluginMethod(method, args) {
            const order = BACKEND_ARGUMENT_ORDER[method];
            if (!order) {
                return { success: false, result: `Unknown backend method: ${method}` };
            }
            try {
                const result = await call<unknown[], unknown>(method, ...order.map(name => args[name]));
                return { success: true, result };
            } catch (e) {
                return { success: false, result: String(e) };
            }
        },

        toaster: {
            toast: (data) => toaster.toast(data),
        },
    };
}
