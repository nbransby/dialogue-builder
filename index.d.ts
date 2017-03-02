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
        lambdaContext: { 
            callbackWaitsForEmptyEventLoop: boolean 
            getRemainingTimeInMillis: () => number
        }
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

            class BaseTemplate {
                get(): string 
                setNotificationType(type: 'REGULAR'|'SILENT_PUSH'|'NO_PUSH'): this
                addQuickReply(title: string, payload: string, image?: string): this
                addQuickReplyLocation(): this
            }

            class Text extends BaseTemplate {
                constructor(text: string)
            }

            class Attachment extends BaseTemplate {
                constructor(url: string, type?: 'file'|'image'|'audio'|'video')
            }

            class File extends BaseTemplate {
                constructor(url: string)
            }

            class Image extends BaseTemplate {
                constructor(url: string)
            }

            class Audio extends BaseTemplate {
                constructor(url: string)
            }

            class Video extends BaseTemplate {
                constructor(url: string)
            }

            class Button extends BaseTemplate {
                constructor(text: string)
                addButton(title: string, value: string): this
            }

            class Receipt extends BaseTemplate {
                constructor(name: string, orderNumber: string, currency: string, paymentMethod: string, text: string)
                addTimestamp(timestamp: Date): this
                addOrderUrl(url: string): this
                addItem(title: string): this
                addSubtitle(subtitle: string): this
                addQuantity(quantity : number): this
                addPrice(price: number): this
                addCurrency(timestamp: string): this
                addImage(url: string): this
                addShippingAddress(street1: string, street2: string|null, city: string, zip: string, state: string, country: string): this
                addAdjustment(name: string, amount: number): this
                addSubtotal(subtotal : number): this
                addShippingCost(shippingCost: number): this
                addTax(tax: number): this
                addTotal(total: number): this
            }

            class List extends BaseTemplate {
                constructor(topElementStyle: 'large'|'compact')
                bubbles: Array<{ image_url?: string }>
                addBubble(title: string, subtitle?: string): this
                addDefaultAction(url: string): this
                addImage(url: string): this
                addImage(url: string, subtitle?: string): this
                addButton(title: string, value: string): this
                addListButton(title: string, value: string): this
                addShareButton(): this
                getFirstBubble(): string 
                getLastBubble(): { title: string, subtitle: string } 
            }

            class ChatAction {
                constructor(action: 'typing_on'|'typing_off'|'mark_seen')                
                get(): string 
            }

            class Pause  {
                constructor(miliseconds?: number)
                get(): string 
            }

            interface Request {
                sender: { id: string }
                recipient: { id: string }
                timestamp: number
                message: Message
                postback?: { payload: string }
                read?: { watermark: number, seq: number }
            }

            interface Message {
                mid: string
                seq: number
                text: string
                quick_reply?: { payload: string }
                attachments?: MessageAttachment[]
           }

           interface MessageAttachment {
                type: 'image'|'audio'|'video'|'file'|'location'
                payload: { title?: string, url?: string, coordinates?: { lat: number, long: number} }
            }
        }
        
    }

    export = builder;
}


declare module "dialogue-builder" {
    import { Request } from 'claudia-api-builder';
    import builder = require('claudia-bot-builder');
    import FacebookTemplate = builder.fbTemplate.BaseTemplate;
    import Message = builder.Message;
    import Text = builder.fbTemplate.Text;
    import List = builder.fbTemplate.List;
    import Button = builder.fbTemplate.Button;
    import Attachment = builder.fbTemplate.Attachment;
    export const defaultAction: symbol;
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
        repeatQuestion: boolean;
        expect: Expect;
        constructor(message: string, repeatQuestion?: boolean, expect?: Expect);
    }
    export type Label = String;
    export class Directive {
        private readonly text;
        constructor(text: string);
        toString(): string;
    }
    export class Expect extends Directive {
    }
    export class Goto extends Directive {
    }
    export class Say extends Text {
    }
    export type Script = Array<FacebookTemplate | Label | Directive | ResponseHandler>;
    export function say(template: TemplateStringsArray, ...substitutions: any[]): Say;
    export function ask(template: TemplateStringsArray, ...substitutions: string[]): Text;
    export function expect(template: TemplateStringsArray, ...substitutions: string[]): Expect;
    export function goto(template: TemplateStringsArray, ...substitutions: string[]): Goto;
    export function audio(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
    export function video(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
    export function image(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
    export function file(template: TemplateStringsArray, ...substitutions: string[]): Attachment;
    export type ButtonHandler = {
        [title: string]: () => Goto | void;
    };
    export type Bubble = [string, string, string, ButtonHandler];
    export function list(id: string, type: 'compact' | 'large', bubbles: Bubble[], handler: ButtonHandler): List;
    export function dialogue<T>(name: string, script: (...context: T[]) => Script): DialogueBuilder<T>;
    export interface DialogueBuilder<T> {
        (...context: T[]): Script;
        dialogueName: string;
    }
    export interface Storage {
        store(state: any): any | Promise<any>
        retrieve(): any | Promise<any>
    }
    export class Dialogue<T> {
        private readonly script;
        private readonly state;
        private readonly keywords;
        private outputType;
        baseUrl: string;
        constructor(builder: DialogueBuilder<T>, storage: Storage, ...context: T[]);
        setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)): void;
        private process(dialogue, processor);
        private static handle<T>(handler, invoke, ...keys);
        consume(message: Message, apiRequest: Request, onComplete?: () => void): Promise<string[]>;
    }
}