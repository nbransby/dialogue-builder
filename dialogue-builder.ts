import assert = require('assert');
import { Request } from 'claudia-api-builder'
import builder = require('claudia-bot-builder')
import Message = builder.Message;
import BaseTemplate = builder.fbTemplate.BaseTemplate
import Text = builder.fbTemplate.Text;
import Pause = builder.fbTemplate.Pause;
import List = builder.fbTemplate.List;
import Button = builder.fbTemplate.Button;
import Generic = builder.fbTemplate.Generic;
import Attachment = builder.fbTemplate.Attachment;
import ChatAction = builder.fbTemplate.ChatAction;

export const location = Symbol("a location")
export const onText = Symbol("a typed response")
export const onLocation = Symbol("a location")
export const onImage = Symbol("an image")
export const onAudio = Symbol("a voice recording")
export const onVideo = Symbol("a video")
export const onFile = Symbol("a file")
export const defaultAction = Symbol()
export const onUndo = Symbol()

export type ResponseHandler = any
// export interface ResponseHandler {
//     readonly [quickReply: string]: () => Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [location]?(lat: number, long: number, title?: string, url?: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onText]?(text: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onLocation]?(lat: number, long: number, title?: string, url?: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onImage]?(url: string): Goto | Expect | void;
// }

const ordinals = ['first', 'second', 'third', 'forth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']


export class UnexpectedInputError {
    constructor(public message?: string, public repeatQuestion = true, public showQuickReplies = true) {}
}

class UndefinedHandlerError extends UnexpectedInputError {
    constructor(handler: ResponseHandler) {
        const keys = Object.getOwnPropertySymbols(handler).map(symbol => /Symbol\((.*)\)/.exec(symbol.toString())![1]).filter(k => k.length > 0);
        super(`Sorry, I didn't quite catch that${keys.length === 0 ? '' : `, I was expecting ${keys.join(' or ')}`}`)
    }
}

export class Directive {
    constructor(private readonly text: string) {}
    toString(): string {
        return this.text;
    }    
}

export type Label = String
export class Expect extends Directive {}
export class Goto extends Directive {}
class Ask extends Text {}

export type Script = Array<BaseTemplate | Label | Directive | ResponseHandler>
export function say(template: TemplateStringsArray, ...substitutions: any[]): Text {
    return new Text(String.raw(template, ...substitutions).replace(/([\s]) +/g, '$1'));
}
export function ask(template: TemplateStringsArray, ...substitutions: any[]): Text {
    return new Ask(String.raw(template, ...substitutions).replace(/([\s]) +/g, '$1'));
}
export function expect(template: TemplateStringsArray, ...substitutions: any[]): Expect {
    return new Expect(String.raw(template, ...substitutions));
}
export function goto(template: TemplateStringsArray, ...substitutions: any[]): Goto {
    return new Goto(String.raw(template, ...substitutions));
}
export function audio(template: TemplateStringsArray, ...substitutions: any[]): Attachment {
    return new Attachment(String.raw(template, ...substitutions), 'audio');
}
export function video(template: TemplateStringsArray, ...substitutions: any[]): Attachment {
    return new Attachment(String.raw(template, ...substitutions), 'video');
}
export function image(template: TemplateStringsArray, ...substitutions: any[]): Attachment {
    return new Attachment(String.raw(template, ...substitutions), 'image');
}
export function file(template: TemplateStringsArray, ...substitutions: any[]): Attachment {
    return new Attachment(String.raw(template, ...substitutions), 'file');
}

export type ButtonHandler = { [title: string]: () =>  Goto | void}
export interface Bubble {
    title: string, 
    subtitle?: string, 
    image?: string, 
    buttons?: ButtonHandler 
}
export function buttons(id: string, text: string, handler: ButtonHandler): Button {
    const buttons = new Button(text);
    buttons.identifier = `buttons '${id}'`;
    buttons.postbacks = [];
    Object.keys(handler).forEach(key => {
        const payload = `'${key}' button in buttons '${id}'`;
        buttons.addButton(key, payload).postbacks!.push([payload, handler[key]]);
    });
    return buttons;
}
export function list(id: string, type: 'compact'|'large', bubbles: Bubble[], handler?: ButtonHandler): List {
    const list = new List(type);
    list.identifier = `list '${id}'`;
    list.postbacks = [];
    bubbles.forEach((bubble, index) => {
        list.addBubble(bubble.title, bubble.subtitle);
        if(bubble.image) list.addImage(bubble.image);
        if(bubble.buttons &&  bubble.buttons[defaultAction]) {
            const payload = `default action of ${ordinals[index]} bubble of list '${id}'`;
            list.addDefaultAction(payload).postbacks!.push([payload, bubble.buttons[defaultAction]]);
        }
        bubble.buttons && Object.keys(bubble.buttons).forEach(key => {
            const payload = `'${key}' button in ${ordinals[index]} bubble of list '${id}'`;
            list.addButton(key, payload).postbacks!.push([payload, bubble.buttons![key]])
        });
    });
    handler && Object.keys(handler).forEach(key => {
        const payload = `'${key}' button in list '${id}'`;
        list.addListButton(key, payload).postbacks!.push([payload, handler[key]]);
    });
    return list;
}

export function generic(id: string, type: 'horizontal'|'square', bubbles: Bubble[]): Generic {
    const generic = new Generic();
    generic.identifier = `generic '${id}'`;
    generic.postbacks = [];
    if(type == 'square') generic.useSquareImages();
    bubbles.forEach((bubble, index) => {
        generic.addBubble(bubble.title, bubble.subtitle);
        if(bubble.image) generic.addImage(bubble.image);
        if(bubble.buttons && bubble.buttons[defaultAction]) {
            const payload = `default action of ${ordinals[index]} bubble of generic '${id}'`;
            generic.addDefaultAction(payload).postbacks!.push([payload, bubble.buttons[defaultAction]]);
        }
        bubble.buttons && Object.keys(bubble.buttons).forEach(key => {
            const payload = `'${key}' button in ${ordinals[index]} bubble of generic '${id}'`;
            generic.addButton(key, payload, '').postbacks!.push([payload, bubble.buttons![key]])
        });
    });
    return generic;
}

export function dialogue<T>(name: string, script: (...context: T[]) => Script): DialogueBuilder<T> {
    const builder = script as DialogueBuilder<T>;
    builder.dialogueName = name;
    return builder;
}
export interface DialogueBuilder<T> {
    (...context: T[]): Script
    dialogueName: string
}
export interface Storage {
    store(state: string): any | Promise<any>
    retrieve(): string | undefined | Promise<string | undefined>
}
interface Processor { 
    consumePostback(identifier: string): boolean
    consumeKeyword(keyword: string): boolean 
    consumeResponse(handler: ResponseHandler): Promise<void | Goto | Expect>, 
    addQuickReplies(message: BaseTemplate, handler: ResponseHandler): void
    insertPauses(output: BaseTemplate[]): Array<{ get(): string}>
}
export class Dialogue<T> {
    private readonly build: () => void
    private readonly state: State
    private readonly handlers: Map<string, () =>  void | Goto>
    private script: Script
    private outputFilter: (o: BaseTemplate) => boolean
    public baseUrl: string
    constructor(builder: DialogueBuilder<T>, storage: Storage, ...context: T[]) {
        this.build = () => this.script = builder(...context);
        this.build();
        this.handlers = new Map();
        const templates = new Set();
        const labels = new Map();
        const expects = new Map();
        const gotos: {line: number, label: string}[] = [];
        for(let line = 0; line < this.script.length; line++) {
            const value = this.script[line];
            if(value instanceof Expect) {
                if(expects.has(value.toString())) throw new Error(`Duplicate expect statement found on line ${line}: expect \`${value}\``);
                expects.set(value.toString(), line);   
                const handler = this.script[++line];
                if(!handler || handler instanceof Directive|| handler instanceof BaseTemplate) throw new Error(`Expect statement must be followed by a response handler on line ${line}: expect \`${value}\``);
                if(handler.hasOwnProperty(location) && handler.hasOwnProperty(onLocation)) throw new Error(`Both location and onLocation implemented in the same response handler on line ${line}: expect \`${value}\``);
            } else if(typeof value === 'string') {
                const label = value.startsWith('!') ? value.substring(1) : value;
                if(labels.has(label)) throw new Error(`Duplicate label found on line ${line}: '${value}'`);
                labels.set(label, line);   
            } else if(value instanceof Goto) {
                gotos.push({line: line, label: value.toString()});
            } else if(value instanceof BaseTemplate) {
                if(templates.has(value.identifier)) throw new Error(`Duplicate identifier found on line ${line} for ${value.identifier}`);
                if(value.identifier) templates.add(value.identifier);
                (value.postbacks || []).forEach(p => this.handlers.set(p[0], p[1]));
            } else if(value !== null) {
                throw new Error(`Response handler must be preceded by an expect statement on line ${line}`)
            }
        }
        if(labels.size == this.script.length) throw new Error('Dialogue cannot be empty');
        const goto = gotos.find(g => !labels.has(g.label));
        if(goto) new Error(`Could not find label referenced on line ${goto.line}: goto \`${goto.label}\``);
        this.state = new State(storage, expects, labels);
    }

    async execute(directive: Directive) {
        await this.state.retrieveState();
        this.state.jump(directive, `Dialogue.execute(${directive.constructor.name.toLowerCase()} \`${directive.toString()}\`)`)
    }

    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)) {
        const keys = keywords instanceof Array ? keywords : [keywords];
        const undo = () => { 
            this.outputFilter = o => o instanceof Ask; 
            this.state.undo();
            const handler = this.script[this.state.startLine - 1];
            handler && handler[onUndo] && handler[onUndo]();
            this.state.undo();
        }
        const h = handler === 'restart' ? () => this.state.restart() : handler === 'undo' ? undo : handler;
        keys.forEach(k => this.handlers.set(`keyword '${k.toLowerCase()}'`, h));
    }
    
    private async process(message: Message, processor: Processor): Promise<string[]> {
        await this.state.retrieveState();
        let showQuickReplies = true;
        //process input
        const output: Array<BaseTemplate> = []
        if(message.originalRequest.postback) {
            const payload = message.originalRequest.postback.payload;
            processor.consumePostback(payload) || processor.consumeKeyword(payload) 
                || console.log(`Postback received with unknown payload '${payload}'`);
        } else if(!processor.consumeKeyword(message.text)) {
            const line = this.state.startLine;
            if(line > 0) try {
                const processResponse = async (line: number): Promise<void> => {
                    const result = await processor.consumeResponse(this.script[line - 1]);
                    if(!(result instanceof Directive)) return;
                    line = this.state.jump(result, `expect \`${this.script[line - 2].toString()}\``, false);
                    result instanceof Expect && await processResponse(line);
                }
                await processResponse(line);
            } catch(e) {
                if(!(e instanceof UnexpectedInputError)) throw e;
                this.state.undo();
                if(e.message) output.push(new Text(e.message));
                this.outputFilter = o => e.repeatQuestion ? o instanceof Ask : false;
                showQuickReplies = e.showQuickReplies;
            }
        }
        if(this.state.isComplete) {
            throw [];
        }
        //update script
        this.build();
        //gather output
        for(let i = this.state.startLine; i < this.script.length; i++) {
            const element = this.script[i];
            //if element is output
            if(element instanceof BaseTemplate) {
                if(!this.outputFilter || this.outputFilter(element)) output.push(element);
            } else if(element instanceof Goto) {
                i = this.state.jump(element, i) - 1
            } else if(typeof element === 'string') {
                //if element is a breaking label
                if(element.startsWith('!')) break;
            } else if(element instanceof Expect) {
                //persist asking of this question
                await this.state.complete(element);
                if(output.length == 0) return []; 
                if(showQuickReplies) processor.addQuickReplies(output[output.length-1], this.script[i+1])
                return processor.insertPauses(output).map(e => e.get());                             
            }
        }
        //persist completion 
        await this.state.complete();
        return output.length == 0 ? [] : processor.insertPauses(output).map(e => e.get());
    }     

    async consume(message: Message, apiRequest: Request): Promise<any[]> {
        return this.process(message, {
            consumeKeyword(this: Processor, keyword) {
                return this.consumePostback(`keyword '${keyword.toLowerCase()}'`);
            }, 
            consumePostback: identifier => {
                const handler = this.handlers.get(identifier);
                if(!handler) return false;
                const goto = handler();
                goto instanceof Goto && this.state.jump(goto, identifier);
                return true;                            
            },
            consumeResponse: handler => {
                //if empty handler do nothing
                if(Object.getOwnPropertyNames(handler).length == 0 && Object.getOwnPropertySymbols(handler).length == 0) return;
                //handle any attachments
                const handle = <T>(handler: ResponseHandler, invoke: (method: Function) => T, ...keys: Array<string | symbol>): T | undefined => {
                    keys = keys.filter(key => handler.hasOwnProperty(key));
                    if(keys.length == 0) throw new UndefinedHandlerError(handler);
                    return handler[keys[0]] ? invoke(handler[keys[0]]) : undefined;
                }
                for(let attachment of message.originalRequest.message.attachments || []) {
                    switch(attachment.type) {
                        case 'location':
                            const invoke = (m: Function) => m.call(handler, attachment.payload.coordinates!.lat, attachment.payload.coordinates!.long, attachment.payload.title, attachment.payload.url);
                            return handle(handler, invoke, location, onLocation, defaultAction);
                        case 'image':
                            return handle(handler, m => m.call(handler, attachment.payload.url), onImage, defaultAction);
                        case 'audio':
                            return handle(handler, m => m.call(handler, attachment.payload.url), onAudio, defaultAction);
                        case 'video':
                            return handle(handler, m => m.call(handler, attachment.payload.url), onVideo, defaultAction);
                        case 'file':
                            return handle(handler, m => m.call(handler, attachment.payload.url), onFile, defaultAction);
                        default:
                            throw new Error(`Unsupported attachment type '${attachment.type}'`)
                    }
                }
                return handle(handler, m => m.call(handler, message.text), message.text, onText, defaultAction);
            },
            addQuickReplies(this: Processor, message, handler) {
                //add quick replies if present
                if(handler[location]) message.addQuickReplyLocation();
                Object.keys(handler).forEach(key => message.addQuickReply(key, key));
            },
            insertPauses: output => {
                //calculate pauses between messages
                const remaining = Math.min(10 * 1000, apiRequest.lambdaContext.getRemainingTimeInMillis() - 2);
                const factor = Math.min(1, remaining / output.reduce((total, o) => total + o.getReadingDuration(), 0));
                //get output and insert pauses
                const messages: Array<{ get(): string}> = [];
                output.forEach(message => messages.push(
                    message.setBaseUrl(this.baseUrl).setNotificationType('NO_PUSH'), 
                    new ChatAction('typing_on'),
                    new Pause(message.getReadingDuration() * factor)
                ));
                messages.length -= 2;
                return messages;
            }
        })
    }
}

class State {
    private state: Array<{ type: 'label'|'expect'|'complete', name?: string }>
    private jumpCount = 0;
    constructor(private storage: Storage, private expects: Map<string, number>, private labels: Map<string, number>) {
    }
    async retrieveState() {
        if(!this.state) {
            const json = await this.storage.retrieve()
            this.state = typeof json === 'string' ? JSON.parse(json) : [];
        }
    }
    get isComplete(): boolean {
        assert(this.state);
        return this.state[0] && this.state[0].type === 'complete';
    }
    get startLine(): number {
        assert(this.state);
        switch(this.state[0] && this.state[0].type) {
            case 'expect': 
                return this.expects.get(this.state[0].name!)! + 2 || 0;
            case 'label': 
                return this.labels.get(this.state[0].name!)! + 1 || 0;
            case 'complete':
                return -1;
            case undefined:
                return 0;
            default: 
                throw new Error(`Unexpected type ${this.state[0].type}`);
        }
    }
    jump(location: Directive, lineOrIdentifier: number|string, persist = true): number {
        assert(this.state);
        if(++this.jumpCount > 10) throw new Error(`Endless loop detected ${typeof lineOrIdentifier == 'number' ? 'on line' : 'by'} ${lineOrIdentifier}: ${location.constructor.name.toLowerCase()} \`${location.toString()}\``);
        if(location instanceof Expect) {
            const line = this.expects.get(location.toString())
            if(line === undefined) throw new Error(`Could not find expect referenced ${typeof lineOrIdentifier == 'number' ? 'on line' : 'by'} ${lineOrIdentifier}: expect \`${location.toString()}\``);        
            if(persist) this.state.unshift({ type: 'expect', name: location.toString() });    
            return line+ 2 || 0;
        }
        const label = location.toString().startsWith('!') ? location.toString().substring(1) : location.toString();
        if(!this.labels.has(label)) throw new Error(`Could not find label referenced ${typeof lineOrIdentifier == 'number' ? 'on line' : 'by'} ${lineOrIdentifier}: goto \`${location.toString()}\``);        
        console.log(`Jumping to label '${label}' from ${typeof lineOrIdentifier == 'number' ? 'line' : ''} ${lineOrIdentifier}: goto \`${location.toString()}\``);
        if(this.isComplete) this.state.shift(); 
        this.state.unshift({ type: 'label', name: label});
        return this.startLine;
    }
    async complete(expect?: Expect) {
        assert(this.state);
        this.state.unshift(expect ? { type: 'expect', name: expect.toString()} : { type: 'complete'});
        await this.storage.store(JSON.stringify(this.state));
    }    
    restart() {
        assert(this.state);
        this.state.length = 0;
    }
    undo() {
        assert(this.state);
        this.state.splice(0, this.state.findIndex((_, i, s) => i+1 === this.state.length || s[i+1].type === 'expect') + 1);                
    }
}

export namespace mock {

    export const apiRequest: Request = {
        queryString: {},
        env: {},
        headers: {},
        normalizedHeaders: {},
        proxyRequest: { 
            requestContext: {} 
        },
        lambdaContext: { 
            callbackWaitsForEmptyEventLoop: false,
            getRemainingTimeInMillis: () => 15
        }            
    }
    
    export function message(text: string): Message { 
        return {
            postback: false, 
            text: text, 
            sender: "user", 
            type: 'facebook', 
            originalRequest: { 
                sender: { id: "user" }, 
                recipient: { id: "bot" }, 
                timestamp: 0, 
                message: { 
                    mid: "1", 
                    seq: 1, 
                    text: text
                }
            }
        }
    }
        
    export function postback(payload: string = 'USER_DEFINED_PAYLOAD'): Message {
        return {
            postback: true, 
            text: '', 
            sender: "user", 
            type: 'facebook', 
            originalRequest: { 
                sender: { id: "user" }, 
                recipient: { id: "bot" }, 
                timestamp: 0, 
                message: { 
                    mid: "1", 
                    seq: 1, 
                    text: "" 
                },
                postback: {
                    payload: payload
                }
            }
        };
    }

    export function location(lat: number, long: number, title?: string, url?: string): Message { 
        return {
            postback: false, 
            text: "", 
            sender: "user", 
            type: 'facebook', 
            originalRequest: { 
                sender: { id: "user" }, 
                recipient: { id: "bot" }, 
                timestamp: 0, 
                message: { 
                    mid: "1", 
                    seq: 1, 
                    text: "",
                    attachments: [{
                        type: "location",
                        payload: {
                            title: title,
                            url: url,
                            coordinates: {
                                lat: lat,
                                long: long
                            }
                        }
                    }]
                } 
            }
        }
    }

    export function multimedia(type: 'image'|'audio'|'video'|'file'|'location', url: string): Message { 
        return {
            postback: false, 
            text: "", 
            sender: "user", 
            type: 'facebook', 
            originalRequest: { 
                sender: { id: "user" }, 
                recipient: { id: "bot" }, 
                timestamp: 0, 
                message: { 
                    mid: "1", 
                    seq: 1, 
                    text: "",
                    attachments: [{
                        type: type,
                        payload: {
                            url: url,
                        }
                    }]

                } 
            }
        }
    }    
}

declare module "claudia-bot-builder" {
    namespace fbTemplate {
        interface BaseTemplate {
            getReadingDuration: () => number
            setBaseUrl: (url: string) => this
            postbacks?: [string, () => Goto | void][]
            identifier?: string
        }
        interface Text {
            template: { text: string };
        }
        interface Attachment {
            template: { attachment: { payload: { url: string }}};
        }
    }
}

BaseTemplate.prototype.getReadingDuration = () => 1000;
Text.prototype.getReadingDuration = function(this: Text) { 
    return this.template.text.match(/\w+/g)!.length * 250; 
}

BaseTemplate.prototype.setBaseUrl = function(this: List) { 
    return this 
}

List.prototype.setBaseUrl = function(this: List, url: string) { 
    this.bubbles.forEach(b => b.image_url = !b.image_url || b.image_url.indexOf('://') >= 0 ? b.image_url : url + b.image_url);
    return this;
}

Generic.prototype.setBaseUrl = function(this: Generic, url: string) { 
    this.bubbles.forEach(b => b.image_url = !b.image_url || b.image_url.indexOf('://') >= 0 ? b.image_url : url + b.image_url);
    return this;
}

Attachment.prototype.setBaseUrl = function(this: Attachment, baseUrl: string) { 
    const url = this.template.attachment.payload.url;
    if(url.indexOf('://') < 0) this.template.attachment.payload.url = baseUrl + url;
    return this;
}
