const emojiRegex = require('emoji-regex');
import assert = require('assert');
import {Request} from 'claudia-api-builder'
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

export const location = Symbol("a location");
export const onText = Symbol("a typed response");
export const onLocation = Symbol("a location");
export const onImage = Symbol("an image");
export const onAudio = Symbol("a voice recording");
export const onVideo = Symbol("a video");
export const onFile = Symbol("a file");
export const defaultAction = Symbol();
export const onUndo = Symbol();

export type ResponseHandler = any
// export interface ResponseHandler {
//     readonly [quickReply: string]: () => Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [location]?(lat: number, long: number, title?: string, url?: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onText]?(text: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onLocation]?(lat: number, long: number, title?: string, url?: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onImage]?(url: string): Goto | Expect | void;
// }

const ordinals = ['first', 'second', 'third', 'forth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

export class UnexpectedInputError extends Error {
    constructor(public localizedMessage: string = `Sorry, I didn't quite catch that`, public repeatQuestion = true, public showQuickReplies = true) {
        super(localizedMessage);
    }
}

class UndefinedHandlerError extends UnexpectedInputError {
    constructor(handler: ResponseHandler) {
        const keys = Object.getOwnPropertySymbols(handler).map(symbol => /Symbol\((.*)\)/.exec(symbol.toString())![1]).filter(k => k.length > 0);
        super(`Sorry, I didn't quite catch that${keys.length === 0 ? '' : `, I was expecting ${keys.join(' or ')}`}`)
    }
}

export class Directive {
    readonly script?: string;
    readonly name: string;

    constructor(private text: string) {
        const index = text.indexOf('::');
        if (index < 0) {
            this.name = text;
        } else {
            this.script = text.substring(0, index);
            this.name = text.substring(index + 2);
        }
    }

    path(script: string): string {
        return `${this.script || script}::${this.name}`
    }

    toString(): string {
        return this.text;
    }

    static assertEqual(a: Directive | undefined, b: Directive | undefined) {
        if (a && b && (Object.getPrototypeOf(a) != Object.getPrototypeOf(b) || a.script != b.script || a.name != b.name)) throw new Error('Opposing directives given')
    }
}

export type Label = String

export class Expect extends Directive {
}

export class Goto extends Directive {
}

export class Rollback extends Goto {
}

class Ask extends Text {
}

export type Script = Array<BaseTemplate | TemplateBuilder | Label | Directive | ResponseHandler>

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

export function rollback(template: TemplateStringsArray, ...substitutions: any[]): Rollback {
    return new Rollback(String.raw(template, ...substitutions));
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

export class TemplateBuilder {
    readonly postbacks: [string, () => Goto | void | Promise<Goto | void>][] = [];

    constructor(readonly identifier: string, private readonly builder: (script: string) => BaseTemplate) {}

    build(script: string): BaseTemplate {
        return this.builder(script);
    }
}

export type ButtonHandler = { [title: string]: URLButton | (() => Goto | void | Promise<Goto | void>) }

export interface URLButton {
    url: string
    height?: 'compact' | 'tall' | 'full'
}

export interface Bubble {
    title: string,
    subtitle?: string,
    image?: string,
    buttons?: ButtonHandler
}

export function buttons(id: string, text: string, handler: ButtonHandler): TemplateBuilder {
    const builder = new TemplateBuilder(`buttons '${id}'`, (script: string) => {
        const buttons = new Button(text);
        Object.entries(handler).forEach(([k, v]) =>
            buttons.addButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in buttons '${id}'`)
        );
        return buttons;
    });
    Object.entries(handler).forEach(([k, v]) =>
        typeof v == "function" && builder.postbacks.push([`'${k}' button in buttons '${id}'`, v])
    );
    return builder;
}

export function list(id: string, type: 'compact' | 'large', bubbles: Bubble[], handler?: ButtonHandler): TemplateBuilder {
    const builder = new TemplateBuilder(`list '${id}'`,(script: string) => {
        const list = new List(type);
        bubbles.forEach((bubble, index) => {
            list.addBubble(bubble.title, bubble.subtitle);
            if (bubble.image) list.addImage(bubble.image);
            if (bubble.buttons && bubble.buttons[defaultAction]) {
                const button = bubble.buttons[defaultAction];
                list.addDefaultAction(typeof button !== "function" ? button.url : `${script}::default action of ${ordinals[index]} bubble of list '${id}'`)
            }
            bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) =>
                list.addButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in ${ordinals[index]} bubble of list '${script}::${id}'`)
            );
        });
        handler && Object.entries(handler).forEach(([k, v]) =>
            list.addListButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in list '${id}'`)
        );
        return list;
    });
    bubbles.forEach((bubble, index) => {
        if (bubble.buttons && bubble.buttons[defaultAction]) {
            const button = bubble.buttons[defaultAction];
            typeof button == "function" && builder.postbacks.push([`default action of ${ordinals[index]} bubble of list '${id}'`, button]);
        }
        bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) =>
            typeof v == "function" && builder.postbacks.push([`'${k}' button in ${ordinals[index]} bubble of list '${id}'`, v])
        );
    });
    handler && Object.entries(handler).forEach(([k, v]) =>
        typeof v == "function" && builder.postbacks.push([`'${k}' button in list '${id}'`, v])
    );
    return builder;
}

export function generic(id: string, type: 'horizontal' | 'square', bubbles: Bubble[]): TemplateBuilder {
    const builder = new TemplateBuilder(`generic '${id}'`, (script: string) => {
        const generic = new Generic();
        if (type == 'square') generic.useSquareImages();
        bubbles.forEach((bubble, index) => {
            generic.addBubble(bubble.title, bubble.subtitle);
            if (bubble.image) generic.addImage(bubble.image);
            if (bubble.buttons && bubble.buttons[defaultAction]) {
                const button = bubble.buttons[defaultAction];
                generic.addDefaultAction(typeof button !== "function" ? button.url : `${script}::default action of ${ordinals[index]} bubble of generic '${id}'`)
            }
            bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) =>
                generic.addButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in ${ordinals[index]} bubble of generic '${script}::${id}'`)
            );
        });
        return generic;
    });
    bubbles.forEach((bubble, index) => {
        if (bubble.buttons && bubble.buttons[defaultAction]) {
            const button = bubble.buttons[defaultAction];
            typeof button == "function" && builder.postbacks.push([`default action of ${ordinals[index]} bubble of generic '${id}'`, button]);
        }
        bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) =>
            typeof v == "function" && builder.postbacks.push([`'${k}' button in ${ordinals[index]} bubble of generic '${id}'`, v])
        );
    });
    return builder;
}

export interface Delegate {
    loadScript(name: string): Script

    loadState(): string | undefined | Promise<string | undefined>

    saveState(state: string): any | Promise<any>
}

export class Dialogue {
    private readonly delegate: Delegate;
    private readonly handlers: Map<string, () => void | Goto | Promise<Goto | void>> = new Map();
    private readonly state: State;
    private script: Script;
    private outputFilter: (o: BaseTemplate) => boolean;
    public baseUrl: string;

    constructor(private readonly defaultScript: string, delegate: Delegate) {
        const labels = new Map<string, number>();
        const expects = new Map<string, number>();
        const jumps: [number, Goto][] = [];
        const loaded = new Set<string>();
        const self = this;
        this.delegate = {
            loadState: () => delegate.loadState(),
            saveState: state => delegate.saveState(state),
            loadScript: name => {
                self.script = delegate.loadScript(name);
                if (!loaded.has(name)) {
                    loaded.add(name);
                    labels.set(`${name}::`, -1);
                    const templates = new Set();
                    for (let line = 0; line < self.script.length; line++) {
                        let value = self.script[line];
                        if (value instanceof Expect) {
                            if (expects.has(value.path(name))) throw new Error(`Duplicate expect statement (${name}:${line}): expect \`${value}\``);
                            expects.set(value.path(name), line);
                            const handler = self.script[++line];
                            if (!handler || handler instanceof Directive || handler instanceof BaseTemplate || handler instanceof TemplateBuilder) throw new Error(`Expect statement must be followed by a response handler (${name}:${line}): expect \`${value}\``);
                            if (handler.hasOwnProperty(location) && handler.hasOwnProperty(onLocation)) throw new Error(`Both location and onLocation implemented in the same response handler (${name}:${line}): expect \`${value}\``);
                        } else if (typeof value === 'string') {
                            const label = value.startsWith('!') ? value.substring(1) : value;
                            if (labels.has(`${name}::${label}`)) throw new Error(`Duplicate label found (${name}:${line}): '${value}'`);
                            labels.set(`${name}::${label}`, line);
                        } else if (value instanceof Goto) {
                            jumps.push([line, value]);
                        } else if (value instanceof TemplateBuilder) {
                            if (templates.has(`${name}::${value.identifier}`)) throw new Error(`Duplicate identifier found (${name}:${line}): ${value.identifier}`);
                            templates.add(`${name}::${value.identifier}`);
                            value.postbacks.forEach(p => self.handlers.set(`${name}::${p[0]}`, p[1]));
                        } else if (!(value instanceof BaseTemplate) && value !== null) {
                            throw new Error(`Response handler must be preceded by an expect statement (${name}:${line})`)
                        }
                    }
                    const jump = jumps.find(j => !labels.has(j[1].path(name)) && loaded.has(j[1].script || name));
                    if (jump) new Error(`Could not find label (${jump[1].script || name}::${jump[0]}): ${jump[1].constructor.name.toLowerCase()} \`${jump[1]}\``);
                }
                return self.script;
            }
        };
        this.state = new State(defaultScript, labels, expects, this.delegate);
    }

    async execute(directive: Directive) {
        await this.state.retrieveState();
        this.state.jump(directive, `Dialogue.execute(${directive.constructor.name.toLowerCase()} \`${directive}\`)`)
    }

    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto | Promise<void | Goto>)) {
        const keys = keywords instanceof Array ? keywords : [keywords];
        const undo = () => {
            this.outputFilter = o => o instanceof Ask;
            this.state.undo();
            const line = this.state.startLine - 1;
            const handler = this.script[line];
            handler && handler[onUndo] && handler[onUndo]();
            this.state.repeat();
        };
        const h = handler === 'restart' ? () => this.state.restart() : handler === 'undo' ? undo : handler;
        keys.forEach(k => this.handlers.set(`keyword '${k.toLowerCase()}'`, h));
    }

    async resume(lambdaContext: Request['lambdaContext']): Promise<string[]> {
        return this.send(lambdaContext, 'REGULAR')
    }

    private async send(lambdaContext: Request['lambdaContext'], notificationType: 'REGULAR' | 'NO_PUSH', unexpectedInput?: UnexpectedInputError): Promise<string[]> {
        await this.state.retrieveState();
        const insertPauses = (output: BaseTemplate[]) => {
            //calculate pauses between messages
            const remaining = Math.min(10 * 1000, lambdaContext.getRemainingTimeInMillis() - 5);
            const factor = Math.min(1, remaining / output.reduce((total, o) => total + o.getReadingDuration(), 0));
            //get output and insert pauses
            const messages: Array<{ get(): string }> = [];
            output.forEach(message => messages.push(
                message.setBaseUrl(this.baseUrl).setNotificationType(notificationType),
                new ChatAction('typing_on'),
                new Pause(message.getReadingDuration() * factor)
            ));
            messages.length -= 2;
            return messages;
        };
        const output: Array<BaseTemplate> = unexpectedInput && unexpectedInput.localizedMessage ? [new Text(unexpectedInput.localizedMessage)] : [];
        //gather output
        for (let i = this.state.startLine; i < this.script.length; i++) {
            const element = this.script[i];
            //if element is output
            if (element instanceof BaseTemplate) {
                if (!this.outputFilter || this.outputFilter(element)) output.push(element);
            } else if (element instanceof Goto) {
                i = this.state.jump(element, `${this.state.currentScript}::${i}`, true) - 1
            } else if (typeof element === 'string') {
                //if element is a breaking label
                if (element.startsWith('!')) break;
            } else if (element instanceof Expect) {
                //persist asking of this question
                await this.state.complete(element);
                if (output.length == 0) return [];
                if (!unexpectedInput || unexpectedInput.showQuickReplies) {
                    //add quick replies if present
                    if (this.script[i + 1][location]) output[output.length - 1].addQuickReplyLocation();
                    Object.keys(this.script[i + 1]).forEach(key => output[output.length - 1].addQuickReply(key, key));
                }
                return insertPauses(output).map(e => e.get());
            } else if (typeof element === 'function') {
                output.push(element(this.state.currentScript));
            }
        }
        //persist completion 
        await this.state.complete();
        return output.length == 0 ? [] : insertPauses(output).map(e => e.get());
    }

    async consume(message: Message, apiRequest: Request): Promise<any[]> {
        let unexpectedInput = undefined;
        try {
            await this.state.retrieveState();
            const consumePostback = async (identifier: string) => {
                this.handlers.has(identifier) || this.delegate.loadScript(identifier.includes('::') ? identifier.substr(0, identifier.indexOf('::')) : this.defaultScript);
                const handler = this.handlers.get(identifier);
                if (!handler) return false;
                const goto = await handler();
                goto instanceof Goto && this.state.jump(goto, identifier);
                return true;
            };
            const consumeKeyword = (keyword: string) => consumePostback(`keyword '${keyword.toLowerCase()}'`);
            //process input
            if (message.originalRequest.postback) {
                const payload = message.originalRequest.postback.payload;
                await consumePostback(payload) || await consumeKeyword(payload)
                || console.log(`Postback received with unknown payload '${payload}'`);
            } else if (!await consumeKeyword(message.text)) {
                const processResponse = async (line: number): Promise<void> => {
                    const handler = this.script[line - 1];
                    //if empty handler do nothing
                    if (Object.getOwnPropertyNames(handler).length == 0 && Object.getOwnPropertySymbols(handler).length == 0) return;
                    //handle any attachments
                    const handle = <T>(handler: ResponseHandler, invoke: (method: Function) => T, ...keys: Array<string | symbol>): T | undefined => {
                        keys = keys.filter(key => handler.hasOwnProperty(key));
                        if (keys.length == 0) throw new UndefinedHandlerError(handler);
                        return handler[keys[0]] ? invoke(handler[keys[0]]) : undefined;
                    };
                    let results = [];
                    for (const attachment of message.originalRequest.message.attachments || []) {
                        switch (attachment.type) {
                            case 'location':
                                const invoke = (m: Function) => m.call(handler, attachment.payload.coordinates!.lat, attachment.payload.coordinates!.long, attachment.payload.title, attachment.payload.url);
                                results.push(handle(handler, invoke, location, onLocation, defaultAction));
                                break;
                            case 'image':
                                results.push(handle(handler, m => m.call(handler, attachment.payload.url), onImage, defaultAction));
                                break;
                            case 'audio':
                                results.push(handle(handler, m => m.call(handler, attachment.payload.url), onAudio, defaultAction));
                                break;
                            case 'video':
                                results.push(handle(handler, m => m.call(handler, attachment.payload.url), onVideo, defaultAction));
                                break;
                            case 'file':
                                results.push(handle(handler, m => m.call(handler, attachment.payload.url), onFile, defaultAction));
                                break;
                            default:
                                throw new Error(`Unsupported attachment type '${attachment.type}'`)
                        }
                    }
                    const result = await (results.length ? Promise.all(results).then(r => r.reduce((p, c) => Directive.assertEqual(p, c) || p || c)) :
                        handle(handler, m => m.call(handler, message.text), message.text, onText, defaultAction));
                    if (!(result instanceof Directive)) return;
                    line = this.state.jump(result, `${this.state.currentScript}::expect \`${this.script[line - 2].toString()}\``, false, false);
                    result instanceof Expect && await processResponse(line);
                };
                if (this.state.currentType == 'expect') await processResponse(this.state.startLine);
            }
        } catch (error) {
            if (!(error instanceof UnexpectedInputError)) throw error;
            this.state.repeat();
            this.outputFilter = o => error.repeatQuestion ? o instanceof Ask : false;
            unexpectedInput = error;
        }
        return this.state.currentType == 'complete' ? [] : this.send(apiRequest.lambdaContext, 'NO_PUSH', unexpectedInput);
    }
}

class State {
    private state: Array<{ type: 'label' | 'expect' | 'complete', path?: string, inline?: boolean }>;
    private jumpCount = 0;

    constructor(private readonly defaultScript: string, private labels: Map<string, number>, private expects: Map<string, number>, private delegate: Delegate) {
    }

    async retrieveState() {
        if (!this.state) {
            const json = await this.delegate.loadState();
            this.state = typeof json === 'string' ? JSON.parse(json) : [];
            this.state.length == 0 && this.restart();
        }
    }

    get currentType(): 'expect' | 'complete' | 'label' {
        assert(this.state);
        return this.state[0].type;
    }

    get currentScript(): string {
        assert(this.state);
        return (this.state[0] && this.state[0].path && this.state[0].path!.substr(0, this.state[0].path!.indexOf('::'))) || this.defaultScript;
    }

    get startLine(): number {
        assert(this.state);
        const path = this.state[0].path!;
        switch (this.currentType) {
            case 'expect':
                this.delegate.loadScript(path.substr(0, path.indexOf('::')));
                return this.expects.get(path)! + 2 || 0;
            case 'label':
                this.delegate.loadScript(path.substr(0, path.indexOf('::')));
                return this.labels.get(path)! + 1 || 0;
            default:
                throw new Error(`Unexpected state ${this.state[0].type}`);
        }
    }

    jump(location: Directive, source: string, fromInlineGoto: boolean = false, persistExpect = true): number {
        assert(this.state);
        this.delegate.loadScript(location.script || this.currentScript);
        if (++this.jumpCount > 10) throw new Error(`Endless loop detected (${source}): ${location.constructor.name.toLowerCase()} \`${location}\``);
        if (this.currentType == 'complete') this.state.shift();
        if (location instanceof Expect) {
            const line = this.expects.get(location.path(this.currentScript));
            if (line === undefined) throw new Error(`Could not find expect (${source}): expect \`${location}\``);
            if (persistExpect) this.state.unshift({type: 'expect', path: location.path(this.currentScript)});
            return line + 2 || 0;
        }
        if (!this.labels.has(location.path(this.currentScript))) throw new Error(`Could not find label (${source}): ${location instanceof Rollback ? 'rollback' : 'goto'} \`${location}\``);
        console.log(`${location instanceof Rollback ? 'Rolling back past' : 'Jumping to'} label '${location.path(this.currentScript)}' (${source}): ${location.constructor.name.toLowerCase()} \`${location}\``);
        if (location instanceof Rollback) {
            this.state.unshift(this.state[this.state.findIndex(s => s.type === 'label' && s.path === location.path(this.currentScript)) + 1]);
            return this.startLine;
        }
        this.state.unshift({type: 'label', path: location.path(this.currentScript), inline: fromInlineGoto});
        return this.startLine;
    }

    async complete(expect?: Expect) {
        assert(this.state);
        this.state.unshift(expect ? {type: 'expect', path: expect.path(this.currentScript)} : {type: 'complete'});
        await this.delegate.saveState(JSON.stringify(this.state));
    }

    restart() {
        assert(this.state);
        this.state = [{type: 'label', path: this.defaultScript + '::', inline: false}];
    }

    repeat() {
        assert(this.state);
        this.state.splice(0, Math.min(this.state.length - 1, this.state.findIndex((_, i, s) => i + 1 === this.state.length || s[i + 1].type === 'expect' || !s[i + 1].inline) + 1));
    }

    undo() {
        assert(this.state);
        this.state.splice(0, Math.min(this.state.length - 1, this.state.findIndex((_, i, s) => i + 1 === this.state.length || s[i + 1].type === 'expect') + 1));
    }
}

export namespace mock {
    export const sender = {
        id: 'user'
    };
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
    };

    export function message(text: string): Message {
        return {
            postback: false,
            text: text,
            sender: sender.id,
            type: 'facebook',
            originalRequest: {
                sender: sender,
                recipient: {id: "bot"},
                timestamp: 0,
                message: {
                    mid: "1",
                    seq: 1,
                    text: text
                }
            }
        }
    }

    export function postback(payload: string = 'USER_DEFINED_PAYLOAD', text: string = ''): Message {
        return {
            postback: true,
            text: text,
            sender: sender.id,
            type: 'facebook',
            originalRequest: {
                sender: sender,
                recipient: {id: "bot"},
                timestamp: 0,
                message: {
                    mid: "1",
                    seq: 1,
                    text: text
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
            text: title || "",
            sender: sender.id,
            type: 'facebook',
            originalRequest: {
                sender: sender,
                recipient: {id: "bot"},
                timestamp: 0,
                message: {
                    mid: "1",
                    seq: 1,
                    text: title || "",
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

    export function multimedia(type: 'image' | 'audio' | 'video' | 'file' | 'location', urls: string | string[], text = ''): Message {
        return {
            postback: false,
            text: text,
            sender: sender.id,
            type: 'facebook',
            originalRequest: {
                sender: sender,
                recipient: {id: "bot"},
                timestamp: 0,
                message: {
                    mid: "1",
                    seq: 1,
                    text: text,
                    attachments: (typeof urls == 'string' ? [urls] : urls).map(url => ({
                        type: type,
                        payload: {
                            url: url,
                        }
                    }))
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
        }

        interface Text {
            template: { text: string };
        }

        interface Attachment {
            template: { attachment: { payload: { url: string } } };
        }
    }
}

BaseTemplate.prototype.getReadingDuration = () => 1000;
Text.prototype.getReadingDuration = function (this: Text) {
    const words = this.template.text.match(/\w+/g);
    const emojis = this.template.text.match(emojiRegex());
    return (words ? words.length * 250 : 0) + (emojis ? Math.max(words ? 0 : 2000, emojis.length * 500) : 0);
};

BaseTemplate.prototype.setBaseUrl = function (this: List) {
    return this
};

List.prototype.setBaseUrl = function (this: List, url: string) {
    this.bubbles.forEach(b => b.image_url = !b.image_url || b.image_url.indexOf('://') >= 0 ? b.image_url : url + b.image_url);
    return this;
};

Generic.prototype.setBaseUrl = function (this: Generic, url: string) {
    this.bubbles.forEach(b => b.image_url = !b.image_url || b.image_url.indexOf('://') >= 0 ? b.image_url : url + b.image_url);
    return this;
};

Attachment.prototype.setBaseUrl = function (this: Attachment, baseUrl: string) {
    const url = this.template.attachment.payload.url;
    if (url.indexOf('://') < 0) this.template.attachment.payload.url = baseUrl + url;
    return this;
};
