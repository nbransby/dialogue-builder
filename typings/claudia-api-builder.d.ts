declare module "claudia-api-builder" {

    export function get(uri: string, callback: Function): void;
    export function put(uri: string, callback: Function): void;
    export function post(uri: string, callback: Function): void;
    export function any(uri: string, callback: Function): void;

    export interface Request {
        queryString: { [key: string]: string }
        env: { [key: string]: string }
        headers: { [key: string]: string }
        normalizedHeaders: { [key: string]: string }
    }
}