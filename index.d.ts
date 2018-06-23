declare module "claudia-api-builder" {

    export function get(uri: string, callback: Function): void;
    export function put(uri: string, callback: Function): void;
    export function post(uri: string, callback: Function): void;
    export function any(uri: string, callback: Function): void;

    export interface Request {
        queryString: { [key: string]: string }
        env: { [key: string]: string }
        headers: { [key: string]: string }
        proxyRequest: { requestContext: { [key: string]: string } }
        normalizedHeaders: { [key: string]: string }
        lambdaContext: { 
            callbackWaitsForEmptyEventLoop: boolean 
            getRemainingTimeInMillis: () => number
        }
    }
}

declare module "claudia-bot-builder/lib/facebook/reply" {
    import { fbTemplate } from 'claudia-bot-builder'

    function fbReply(recipient: string, message: string | string[] | object | object[], fbAccessToken: string): Promise<object>

    export = fbReply
}

declare module "claudia-bot-builder" {

    import { Request } from 'claudia-api-builder'

    function builder(callback: builder.Callback, options?: builder.Options, optionalLogError?: (e: Error) => void): any;

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
                addButton(title: string, value: string, options?: object): this
                addShareButton(shareContent?: string): this
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
                addDefaultAction(url: string, options?: object): this
                addImage(url: string): this
                addButton(title: string, value: string, type?: string, options?: object): this
                addListButton(title: string, value: string, type?: string, options?: object): this
                getFirstBubble(): string 
                getLastBubble(): { title: string, subtitle: string } 
            }

            class Generic extends BaseTemplate {
                constructor()
                useSquareImages(): this
                bubbles: Array<{ title: string, subtitle?: string, image_url?: string }>
                addBubble(title: string, subtitle?: string): this
                getLastBubble(): { title: string, subtitle?: string, image_url?: string }
                addUrl(url: string): this
                addImage(url: string): this
                addButton(title: string, value: string, options?: object): this
                addShareButton(shareContent?: string): this
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
                postback?: { 
                    payload: string 
                    referral?: {
                        ref: string,
                        source: "SHORTLINK"|"ADS",
                        type: "OPEN_THREAD"|string,
                    }      
                }
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
    import Message = builder.Message;
    import BaseTemplate = builder.fbTemplate.BaseTemplate;
    import Text = builder.fbTemplate.Text;
    import List = builder.fbTemplate.List;
    import Button = builder.fbTemplate.Button;
    import Generic = builder.fbTemplate.Generic;
    import Attachment = builder.fbTemplate.Attachment;
    export const location: symbol;
    export const onText: symbol;
    export const onLocation: symbol;
    export const onImage: symbol;
    export const onAudio: symbol;
    export const onVideo: symbol;
    export const onFile: symbol;
    export const defaultAction: symbol;
    export const onUndo: symbol;
    export type ResponseHandler = any;
    export class UnexpectedInputError extends Error {
        localizedMessage: string;
        repeatQuestion: boolean;
        showQuickReplies: boolean;
        constructor(localizedMessage?: string, repeatQuestion?: boolean, showQuickReplies?: boolean);
    }
    export class Directive {
        private text;
        readonly script: string;
        readonly name: string;
        constructor(text: string);
        readonly path: string;
        toString(): string;
        static assertEqual(a: Directive | undefined, b: Directive | undefined): void;
    }
    export type Label = String;
    export class Expect extends Directive {
    }
    export class Goto extends Directive {
    }
    export class Rollback extends Goto {
    }
    export type Script = Array<BaseTemplate | Label | Directive | ResponseHandler>;
    export function say(template: TemplateStringsArray, ...substitutions: any[]): Text;
    export function ask(template: TemplateStringsArray, ...substitutions: any[]): Text;
    export function expect(template: TemplateStringsArray, ...substitutions: any[]): Expect;
    export function goto(template: TemplateStringsArray, ...substitutions: any[]): Goto;
    export function rollback(template: TemplateStringsArray, ...substitutions: any[]): Rollback;
    export function audio(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
    export function video(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
    export function image(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
    export function file(template: TemplateStringsArray, ...substitutions: any[]): Attachment;
    export type ButtonHandler = {
        [title: string]: URLButton | (() => Goto | void | Promise<Goto | void>);
    } | any;
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
    export function buttons(id: string, text: string, handler: ButtonHandler): Button;
    export function list(id: string, type: 'compact' | 'large', bubbles: Bubble[], handler?: ButtonHandler): List;
    export function generic(id: string, type: 'horizontal' | 'square', bubbles: Bubble[]): Generic;
    export interface Delegate {
        loadScript(name: string): Script;
        loadState(): string | undefined | Promise<string | undefined>;
        saveState(state: string): any | Promise<any>;
    }
    export class Dialogue {
        baseUrl: string;
        constructor(defaultScript: string, delegate: Delegate);
        execute(directive: Directive): Promise<void>;
        setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto | Promise<void | Goto>)): void;
        resume(lambdaContext: Request['lambdaContext']): Promise<string[]>;
        consume(message: Message, apiRequest: Request): Promise<any[]>;
    }
    export namespace mock {
        const sender: {
            id: string;
        };
        const apiRequest: Request;
        function message(text: string): Message;
        function postback(payload?: string, text?: string): Message;
        function location(lat: number, long: number, title?: string, url?: string): Message;
        function multimedia(type: 'image' | 'audio' | 'video' | 'file' | 'location', urls: string | string[], text?: string): Message;
    }
}