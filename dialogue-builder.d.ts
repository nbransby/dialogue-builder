import "babel-polyfill";
import { Request } from 'claudia-api-builder';
import builder = require('claudia-bot-builder');
import Message = builder.Message;
import BaseTemplate = builder.fbTemplate.BaseTemplate;
import Text = builder.fbTemplate.Text;
import Attachment = builder.fbTemplate.Attachment;
export declare const location: symbol;
export declare const onText: symbol;
export declare const onLocation: symbol;
export declare const onImage: symbol;
export declare const onAudio: symbol;
export declare const onVideo: symbol;
export declare const onFile: symbol;
export declare const defaultAction: symbol;
export declare const onUndo: symbol;
export declare type ResponseHandler = any;
export declare class UnexpectedInputError extends Error {
    localizedMessage: string;
    repeatQuestion: boolean;
    showQuickReplies: boolean;
    constructor(localizedMessage?: string, repeatQuestion?: boolean, showQuickReplies?: boolean);
}
export declare class Directive {
    private text;
    readonly script?: string;
    readonly name: string;
    constructor(text: string);
    path(script: string): string;
    toString(): string;
    static assertEqual(a: Directive | undefined, b: Directive | undefined): void;
}
export declare type Label = String;
export declare class Expect extends Directive {
}
export declare class Goto extends Directive {
}
export declare class Rollback extends Goto {
}
export declare type Script = Array<BaseTemplate | TemplateBuilder | Label | Directive | ResponseHandler>;
export declare function say(template: TemplateStringsArray, ...substitutions: any[]): Text;
export declare function ask(template: TemplateStringsArray, ...substitutions: any[]): Text;
export declare function expect(template: TemplateStringsArray, ...substitutions: any[]): Expect;
export declare function goto(template: TemplateStringsArray, ...substitutions: any[]): Goto;
export declare function rollback(template: TemplateStringsArray, ...substitutions: any[]): Rollback;
export declare function audio(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare function video(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare function image(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare function file(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare class TemplateBuilder {
    readonly identifier: string;
    private readonly builder;
    readonly postbacks: [string, () => Goto | void | Promise<Goto | void>][];
    constructor(identifier: string, builder: (script: string) => BaseTemplate);
    build(script: string): BaseTemplate;
}
export declare type ButtonHandler = {
    [title: string]: URLButton | (() => Goto | void | Promise<Goto | void>);
};
export interface URLButton {
    url: string;
    height?: 'compact' | 'tall' | 'full';
    shareable?: boolean;
}
export interface Bubble {
    title: string;
    subtitle?: string;
    image?: string;
    buttons?: ButtonHandler;
}
export declare function buttons(id: string, text: string, handler: ButtonHandler): TemplateBuilder;
export declare function list(id: string, type: 'compact' | 'large', bubbles: Bubble[], handler?: ButtonHandler): TemplateBuilder;
export declare function generic(id: string, type: 'horizontal' | 'square', bubbles: Bubble[]): TemplateBuilder;
export interface Delegate {
    loadScript(name: string): Script;
    loadState(): string | undefined | Promise<string | undefined>;
    saveState(state: string): any | Promise<any>;
}
export declare class Dialogue {
    private readonly defaultScript;
    private readonly delegate;
    private readonly handlers;
    private readonly state;
    private script;
    private outputFilter;
    baseUrl: string;
    constructor(defaultScript: string, delegate: Delegate);
    execute(directive: Directive): Promise<void>;
    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto | Promise<void | Goto>)): void;
    resume(lambdaContext: Request['lambdaContext']): Promise<string[]>;
    private send(lambdaContext, notificationType, unexpectedInput?);
    consume(message: Message, apiRequest: Request): Promise<any[]>;
}
export declare namespace mock {
    const sender: {
        id: string;
    };
    const apiRequest: Request;
    function message(text: string): Message;
    function postback(payload?: string, text?: string): Message;
    function location(lat: number, long: number, title?: string, url?: string): Message;
    function multimedia(type: 'image' | 'audio' | 'video' | 'file' | 'location', urls: string | string[], text?: string): Message;
}
declare module "claudia-bot-builder" {
    namespace fbTemplate {
        interface BaseTemplate {
            getReadingDuration: () => number;
            setBaseUrl: (url: string) => this;
        }
        interface Text {
            template: {
                text: string;
            };
        }
        interface Attachment {
            template: {
                attachment: {
                    payload: {
                        url: string;
                    };
                };
            };
        }
    }
}
