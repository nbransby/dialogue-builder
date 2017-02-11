import { Request } from 'claudia-api-builder';
import builder = require('claudia-bot-builder');
import Message = builder.Message;
import FacebookTemplate = builder.fbTemplate.FacebookTemplate;
import Text = builder.fbTemplate.Text;
import List = builder.fbTemplate.List;
import Button = builder.fbTemplate.Button;
import Attachment = builder.fbTemplate.Attachment;
export declare const defaultAction: symbol;
export declare const location: symbol;
export declare const onText: symbol;
export declare const onLocation: symbol;
export declare const onImage: symbol;
export declare const onAudio: symbol;
export declare const onVideo: symbol;
export declare const onFile: symbol;
export declare type ResponseHandler = any;
export declare class UnexpectedInputError {
    message: string;
    constructor(message: string);
}
export declare class Directive {
    private readonly text;
    constructor(text: string);
    toString(): string;
}
export declare type Label = String;
export declare class Expect extends Directive {
}
export declare class Goto extends Directive {
}
export declare class Say extends Text {
}
export declare type Script = Array<FacebookTemplate | Label | Directive | ResponseHandler>;
export declare function say(template: TemplateStringsArray, ...substitutions: any[]): Say;
export declare function ask(template: TemplateStringsArray, ...substitutions: string[]): Text;
export declare function expect(template: TemplateStringsArray, ...substitutions: string[]): Expect;
export declare function goto(template: TemplateStringsArray, ...substitutions: string[]): Goto;
export declare function audio(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
export declare function video(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
export declare function image(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
export declare function file(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
export declare type ButtonHandler = {
    [title: string]: () => Goto | void;
};
export declare type Bubble = [string, string, string, ButtonHandler];
export declare function buttons(id: string, text: string, handler: ButtonHandler): Button;
export declare function list(id: string, type: 'compact' | 'large', bubbles: Bubble[], handler: ButtonHandler): List;
export declare function dialogue<T>(name: string, script: (...context: T[]) => Script): DialogueBuilder<T>;
export interface DialogueBuilder<T> {
    (...context: T[]): Script;
    dialogueName: string;
}
export interface Storage {
    store(state: Object): Promise<void>;
    retrieve(): Promise<Object>;
}
export declare class Dialogue<T> {
    private readonly script;
    private readonly state;
    private readonly handlers;
    private outputSay;
    baseUrl: string;
    constructor(builder: DialogueBuilder<T>, storage: Storage, ...context: T[]);
    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)): void;
    private process(message, processor);
    consume(message: Message, apiRequest: Request): Promise<string[]>;
}
declare module "claudia-bot-builder" {
    namespace fbTemplate {
        interface FacebookTemplate {
            getReadingDuration: () => number;
            setBaseUrl: (url: string) => this;
            postbacks?: [string, () => Goto | void][];
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
