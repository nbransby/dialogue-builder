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

declare module "claudia-bot-builder" {

    import { Request } from 'claudia-api-builder'

    function builder(callback: builder.Callback, options?: builder.Options): void;

    namespace builder {
        type Callback = (message: Message, originalApiRequest: Request) => string | string[] | Promise<string | string[]>

        interface Options {
            platforms: Array<'facebook'|'slackSlashCommand'|'skype'|'telegram'|'twilio'|'alexa'|'viber'|'kik'|'groupme'>
        }

        interface Message {
            text: string,
            type: 'facebook'|'slack-slash-command'|'skype'|'telegram'|'twilio'|'alexa'|'viber'|'kik'|'groupme'
            originalRequest: fbTemplate.Request
            sender: string
            postback: boolean
        }

        namespace fbTemplate {
            class Text {
                constructor(text: string)
                addQuickReply(title: string, payload: string, image?: string): Text
                addQuickReplyLocation(): Text
                get(): string 
            }

            class Pause {
                constructor(duration?: number)
                get(): string 
            }

            interface Request {
                sender: { id: string }
                recipient: { id: string }
                timestamp: number
                message: Message
            }

            interface Message {
                mid: string
                seq: number
                text: string
                quick_reply?: { payload: string }
                attachments?: Attachment[]
           }

           interface Attachment {
                type: 'image'|'audio'|'video'|'file'|'location'
                payload: { title?: string, url?: string, coordinates?: { lat: number, long: number} }
            }
        }
        
    }

    export = builder;
}


declare module "dialogue-builder" {
    import builder = require('claudia-bot-builder');
    import Message = builder.Message;
    export const location: symbol;
    export const onText: symbol;
    export const onLocation: symbol;
    export const onImage: symbol;
    export const onAudio: symbol;
    export const onVideo: symbol;
    export const onFile: symbol;
    export type ResponseHandler = any;
    export class UnexpectedInputError {
        message: string;
        constructor(message: string);
    }
    export type Label = String;
    export class Statement {
        private readonly text;
        constructor(text: string);
        toString(): string;
    }
    export class Expect extends Statement {
    }
    export class Goto extends Statement {
    }
    export class Output extends Statement {
        constructor(text: string);
    }
    export class Say extends Output {
    }
    export class Ask extends Output {
    }
    export type Script = Array<Label | Statement | ResponseHandler>;
    export function say(template: TemplateStringsArray, ...substitutions: any[]): Say;
    export function ask(template: TemplateStringsArray, ...substitutions: string[]): Ask;
    export function expect(template: TemplateStringsArray, ...substitutions: string[]): Expect;
    export function goto(template: TemplateStringsArray, ...substitutions: string[]): Goto;
    export function dialogue<T>(name: string, script: (...context: T[]) => Script): DialogueBuilder<T>;
    export interface DialogueBuilder<T> {
        (...context: T[]): Script;
        dialogueName: string;
    }
    export interface Storage {
        store(state: Object): void;
        retrieve(): Object;
    }
    export class Dialogue<T> {
        private readonly script;
        private readonly state;
        private readonly keywords;
        private outputType;
        constructor(builder: DialogueBuilder<T>, storage: Storage, ...context: T[]);
        setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)): void;
        readonly isComplete: boolean;
        private process(dialogue, processor);
        private static handle<T>(handler, invoke, ...keys);
        consume(message: Message): string[];
    }


}