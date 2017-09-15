import { Request } from 'claudia-api-builder';
import builder = require('claudia-bot-builder');
import Message = builder.Message;
import BaseTemplate = builder.fbTemplate.BaseTemplate;
import Text = builder.fbTemplate.Text;
import List = builder.fbTemplate.List;
import Button = builder.fbTemplate.Button;
import Generic = builder.fbTemplate.Generic;
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
    private readonly text;
    constructor(text: string);
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
export declare type Script = Array<BaseTemplate | Label | Directive | ResponseHandler>;
export declare function say(template: TemplateStringsArray, ...substitutions: any[]): Text;
export declare function ask(template: TemplateStringsArray, ...substitutions: any[]): Text;
export declare function expect(template: TemplateStringsArray, ...substitutions: any[]): Expect;
export declare function goto(template: TemplateStringsArray, ...substitutions: any[]): Goto;
export declare function rollback(template: TemplateStringsArray, ...substitutions: any[]): Rollback;
export declare function audio(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare function video(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare function image(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare function file(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
export declare type ButtonHandler = {
    [title: string]: () => Goto | void | Promise<Goto | void>;
};
export interface Bubble {
    title: string;
    subtitle?: string;
    image?: string;
    buttons?: ButtonHandler;
}
export declare function buttons(id: string, text: string, handler: ButtonHandler): Button;
export declare function list(id: string, type: 'compact' | 'large', bubbles: Bubble[], handler?: ButtonHandler): List;
export declare function generic(id: string, type: 'horizontal' | 'square', bubbles: Bubble[]): Generic;
export declare function dialogue<T>(name: string, script: (...context: T[]) => Script): DialogueBuilder<T>;
export interface DialogueBuilder<T> {
    (...context: T[]): Script;
    dialogueName: string;
}
export interface Storage {
    store(state: string): any | Promise<any>;
    retrieve(): string | undefined | Promise<string | undefined>;
}
export declare class Dialogue<T> {
    private readonly build;
    private readonly state;
    private readonly handlers;
    private script;
    private outputFilter;
    baseUrl: string;
    constructor(builder: DialogueBuilder<T>, storage: Storage, ...context: T[]);
    execute(directive: Directive): Promise<void>;
    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto | Promise<void | Goto>)): void;
    private process(message, processor);
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
            postbacks?: [string, () => Goto | void | Promise<Goto | void>][];
            identifier?: string;
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
