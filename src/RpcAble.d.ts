export interface RpcBatchEntry {
    path: string[];
    args: any[];
}

export declare function encodeRpcMessage(event: string, batch: RpcBatchEntry[]): string;
export declare function decodeRpcMessage(payload: any, expectedEvent?: string | null): RpcBatchEntry[] | null;

export interface RpcAbleRequestTicket<T = any> extends PromiseLike<T> {
    request(opts?: { timeoutMs?: number }): Promise<T>;
    expects(opts?: { timeoutMs?: number }): Promise<T>;
    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
    ): Promise<T | TResult>;
    finally(onfinally?: (() => void) | null): Promise<T>;
}

export interface RpcAbleSocketIoOptions {
    transport?: 'socketio';
    socket: any;
    channel?: string;
    target?: object | null;
    requestTimeoutMs?: number;
}

export interface RpcAbleWebSocketOptions {
    transport?: 'websocket';
    socket: any;
    channel?: string;
    target?: object | null;
    requestTimeoutMs?: number;
}

export interface RpcAbleHttpOptions {
    transport?: 'http';
    endpoint: string;
    target?: object | null;
    fetchImpl?: (input: any, init?: any) => Promise<any>;
    headers?: Record<string, string>;
    requestTimeoutMs?: number;
}

export interface RpcAbleCollectorOptions {
    transport?: 'collector';
    target?: object | null;
}

export type RpcAbleOptions =
    | RpcAbleSocketIoOptions
    | RpcAbleWebSocketOptions
    | RpcAbleHttpOptions
    | RpcAbleCollectorOptions;

export declare class RpcAble {
    target: any;
    transport: 'socketio' | 'websocket' | 'http' | 'collector';

    constructor(options: RpcAbleOptions);

    extend(methodAndProps: Record<string, any>): void;
    extendOnce(keyword: string, methodOrProp: Record<string, any>): void;
    flush(): RpcBatchEntry[];
    destroy(): void;
}

export interface RpcDispatchOptions {
    role?: string | null;
}

export type RpcReceiverLogMode = false | undefined | 'console.log' | 'console.warn' | 'console.error' | 'error' | 'throw';

export interface RpcMethodContract {
    inputSchema?: object;
}

export interface RpcReceiverSettings {
    target?: object | null;
    notFound?: RpcReceiverLogMode;
    permission?: RpcReceiverLogMode;
    forbidden?: RpcReceiverLogMode;
    contract?: Record<string, RpcMethodContract>;
    validationFailed?: RpcReceiverLogMode;
}

export declare class RpcAbleReceiver {
    target: any;

    constructor(options?: RpcReceiverSettings | null);

    setSettings(settings?: RpcReceiverSettings | null): void;
dispatch(batch: RpcBatchEntry[], options?: RpcDispatchOptions | null): Promise<any[]>;
}
