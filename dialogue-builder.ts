import assert = require('assert');
import { Request } from 'claudia-api-builder'
import builder = require('claudia-bot-builder')
import Message = builder.Message;
import FacebookTemplate = builder.fbTemplate.FacebookTemplate
import Text = builder.fbTemplate.Text;
import Pause = builder.fbTemplate.Pause;
import List = builder.fbTemplate.List;
import ChatAction = builder.fbTemplate.ChatAction;

export const defaultAction = Symbol("a default action")
export const location = Symbol("a location")
export const onText = Symbol("a typed response")
export const onLocation = Symbol("a location")
export const onImage = Symbol("an image")
export const onAudio = Symbol("a voice recording")
export const onVideo = Symbol("a video")
export const onFile = Symbol("a file")

export type ResponseHandler = any
// export interface ResponseHandler {
//     readonly [quickReply: string]: () => Goto | void
//     readonly [location]?(lat: number, long: number, title?: string, url?: string): Goto | void
//     readonly [onText]?(text: string): Goto | void;
//     readonly [onLocation]?(lat: number, long: number, title?: string, url?: string): Goto | void;
//     readonly [onImage]?(url: string): Goto | void;
// }

export class UnexpectedInputError {
    constructor(public message: string) {}
}

class UndefinedHandlerError extends UnexpectedInputError {
    constructor(handler: ResponseHandler) {
        const keys = Object.getOwnPropertySymbols(handler).map(symbol => /Symbol\((.*)\)/.exec(symbol.toString())![1]);
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
export class Say extends Text {}

export type Script = Array<FacebookTemplate | Label | Directive | ResponseHandler>

export function say(template: TemplateStringsArray, ...substitutions: any[]): Say {
    return new Say(String.raw(template, ...substitutions).replace(/([\s]) +/g, '$1'));
}

export function ask(template: TemplateStringsArray, ...substitutions: string[]): Text {
    return new Text(String.raw(template, ...substitutions).replace(/([\s]) +/g, '$1'));
}

export function expect(template: TemplateStringsArray, ...substitutions: string[]): Expect {
    return new Expect(String.raw(template, ...substitutions));
}

export function goto(template: TemplateStringsArray, ...substitutions: string[]): Goto {
    return new Goto(String.raw(template, ...substitutions));
}

export type ButtonHandler = { [title: string]: () =>  Goto | void}
export type Bubble = [string, string, string, ButtonHandler]

export function list(id: string, type: 'compact'|'large', bubbles: Bubble[], handler: ButtonHandler): List {
    const list = new List(type);
    bubbles.forEach((bubble, index) => {
        const [title, subtitle, image, handler] = bubble;
        list.addBubble(title, subtitle);
        if(image) list.addImage(image);
        if(handler[defaultAction]) list.addDefaultAction(`/list/${id}/bubble/${index}`)
        Object.keys(handler).forEach((key, i) => list.addButton(key, `/list/${id}/bubble/${index}/button/${i}`));
    });
    Object.keys(handler).forEach((key, i) => list.addListButton(key, `/list/${id}/button/${i}`));
    return list;
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
    store(state: Object): Promise<void>
    retrieve(): Promise<Object>
}


type Processor = { onLast: (handler: ResponseHandler) => void | Goto, onNext: (output: FacebookTemplate[], handler: ResponseHandler) => Promise<string[]> }


export class Dialogue<T> {
    private readonly script: Script
    private readonly state: State
    private readonly keywords: Map<string, () =>  void | Goto>
    private outputSay: boolean

    public baseUrl: string

    constructor(builder: DialogueBuilder<T>, storage: Storage, ...context: T[]) {
        this.script = builder(...context);
        this.keywords = new Map();
        this.outputSay = true;
        const labels = new Map();
        const expects = new Map();
        const gotos: {line: number, label: string}[] = [];
        for(let line = 0; line < this.script.length; line++) {
            const value = this.script[line];
            if(value instanceof Expect) {
                if(expects.has(value.toString())) throw new Error(`Duplicate expect statement found on line ${line}: expect \`${value}\``);
                expects.set(value.toString(), line);   
                const handler = this.script[++line];
                if(!handler || handler instanceof Directive|| handler instanceof FacebookTemplate) throw new Error(`Expect statement must be followed by a response handler on line ${line}: expect \`${value}\``);
                if(handler.hasOwnProperty(location) && handler.hasOwnProperty(onLocation)) throw new Error(`Both location and onLocation implemented in the same response handler on line ${line}: expect \`${value}\``);
            } else if(typeof value === 'string') {
                const label = value.startsWith('!') ? value.substring(1) : value;
                if(labels.has(label)) throw new Error(`Duplicate label found on line ${line}: '${value}'`);
                labels.set(label, line);   
            } else if(value instanceof Goto) {
                gotos.push({line: line, label: value.toString()});
            } else if(!(value instanceof FacebookTemplate)) {
                throw new Error(`Response handler must be preceeded by an expect statement on line ${line}: expect \`${value}\``)
            }
        }
        if(labels.size == this.script.length) throw new Error('Dialogue cannot be empty');
        const goto = gotos.find(g => !labels.has(g.label));
        if(goto) new Error(`Could not find label referenced on line ${goto.line}: goto \`${goto.label}\``);
        this.state = new State(storage, expects, labels);
    }

    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)) {
        const keys = keywords instanceof Array ? keywords : [keywords];
        const undo = () => { 
            this.outputSay = false; 
            this.state.undo();  
        }
        const h = handler === 'restart' ? () => this.state.restart() : handler === 'undo' ? undo : handler;
        keys.forEach(k => this.keywords.set(k, h));
    }
    
    private async process(handler: ResponseHandler, processor: Processor): Promise<string[]> {
        const output: Array<FacebookTemplate> = []
        if(handler) try {
            const goto = processor.onLast(handler);
            goto && this.state.jump(goto, this.state.startLine);
        } catch(e) {
            if(!(e instanceof UnexpectedInputError)) throw e;
            this.state.undo();
            output.push(new Text(e.message));
            this.outputSay = false;
        }
        //gather output
        for(let i = this.state.startLine; i < this.script.length; i++) {
            const element = this.script[i];
            //if element is output
            if(element instanceof FacebookTemplate) {
                if(this.outputSay || !(element instanceof Say)) output.push(element);
            } else if(element instanceof Goto) {
                i = this.state.jump(element, i)
            } else if(typeof element === 'string') {
                //if element is a breaking label
                if(element.startsWith('!')) break;
            } else if(element instanceof Expect) {
                //persist asking of this question
                await this.state.complete(element);
                return output.length == 0 ? [] : processor.onNext(output, this.script[i+1]);                             
            }
        }
        //persist completion 
        await this.state.complete();
        return output.length == 0 ? [] : processor.onNext(output, {});
    }     

    private static handle<T>(handler: ResponseHandler, invoke: (method: Function) => T, ...keys: Array<string | symbol>): T | undefined {
        keys = keys.filter(key => handler.hasOwnProperty(key));
        if(keys.length == 0) throw new UndefinedHandlerError(handler);
        return handler[keys[0]] ? invoke(handler[keys[0]]) : undefined;
    }

    async consume(message: Message, apiRequest: Request): Promise<string[]> {
        await this.state.retrieveState()
        let handler = undefined;
        const keyword = this.keywords.get(message.text.toLowerCase())
        if(!keyword) {
            handler = this.state.getResponseHandler(this.script);
        } else {
            const goto = keyword();
            if(goto) this.state.jump(goto, message.text.toLowerCase());
        }
        if(this.state.isComplete) {
            throw [];
        }
        return this.process(handler, {
            onLast: (handler: ResponseHandler) => {
                //if empty handler do nothing
                if(Object.getOwnPropertyNames(handler).length == 0 && Object.getOwnPropertySymbols(handler).length == 0) return;
                //handle any attachments
                for(let attachment of message.originalRequest.message.attachments || []) {
                    switch(attachment.type) {
                        case 'location':
                            const invoke = (m: Function) => m(attachment.payload.coordinates!.lat, attachment.payload.coordinates!.long, attachment.payload.title, attachment.payload.url);
                            return Dialogue.handle(handler, invoke, location, onLocation, defaultAction);
                        case 'image':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onImage, defaultAction);
                        case 'audio':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onAudio, defaultAction);
                        case 'video':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onVideo, defaultAction);
                        case 'file':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onFile, defaultAction);
                        default:
                            throw new Error(`Unsupported attachment type '${attachment.type}'`)
                    }
                }
                return Dialogue.handle(handler, m => m(message.text), message.text, onText);
            },
            onNext: async (output, handler) => {
                //add quick replies if present
                if(handler[location]) output[output.length-1].addQuickReplyLocation();
                Object.keys(handler).forEach(key => output[output.length-1].addQuickReply(key, key));
                //calculate pauses between messages
                const remaining = Math.min(10 * 1000, apiRequest.lambdaContext.getRemainingTimeInMillis());
                const factor = Math.min(1, remaining / output.reduce((total, o) => total + o.getReadingDuration(), 0));
                //get output and insert pauses
                const messages = [new ChatAction('typing_on').get()];
                output.forEach(message => messages.push(
                    message.setBaseUrl(this.baseUrl).setNotificationType('NO_PUSH').get(), 
                    new Pause(message.getReadingDuration() * factor).get()
                ));
                messages[messages.length-1] = new ChatAction('typing_off').get();
                return messages;
            },
        })
    }
}

class State {
    private state: Array<{ type: 'label'|'expect'|'complete', name?: string }>
    private jumpCount = 0;

    constructor(private storage: Storage, private expects: Map<string, number>, private labels: Map<string, number>) {
    }

    async retrieveState() {
        this.state = this.state || await this.storage.retrieve() as any || [];
    }

    get isComplete(): boolean {
        assert(this.state);
        return this.state[0] && this.state[0].type === 'complete';
    }

    getResponseHandler(script: Script): ResponseHandler | undefined {
        return script[this.startLine - 1];
    }

    get startLine(): number {
        assert(this.state);
        switch(this.state[0] && this.state[0].type) {
            case 'expect': 
                return this.expects.get(this.state[0].name!) + 2 || 0;
            case 'label': 
                return this.labels.get(this.state[0].name!) + 1 || 0;
            case undefined:
                return 0;
            default: 
                throw new Error(`Unexpected type ${this.state[0].type}`);
        }
    }

    jump(goto: Goto, lineOrKeyword: number|string): number {
        assert(this.state);
        const label = goto.toString().startsWith('!') ? goto.toString().substring(1) : goto.toString();
        if(!this.labels.has(label)) throw new Error(`Could not find label referenced ${typeof lineOrKeyword == 'number' ? 'on line' : 'by keyword'} '${lineOrKeyword}': goto \`${goto.toString()}\``);
        if(++this.jumpCount > 10) throw new Error(`Endless loop detected ${typeof lineOrKeyword == 'number' ? 'on line' : 'by keyword'} '${lineOrKeyword}': goto \`${goto.toString()}\``);
        // console.log(`Jumping to label '${goto.toString()}' on line ${line}`);
        if(this.isComplete) this.state.shift(); 
        this.state.unshift({ type: 'label', name: label});
        return this.startLine - 1;
    }

    async complete(expect?: Expect) {
        assert(this.state);
        this.state.unshift(expect ? { type: 'expect', name: expect.toString()} : { type: 'complete'});
        await this.storage.store(this.state);
    }
    
    restart() {
        assert(this.state);
        this.state.length = 0;
    }

    undo() {
        assert(this.state);
        this.state.splice(0, this.state.findIndex((s, i) => (i > 0 && s.type === 'expect') || i + 1 === this.state.length) + 1);
    }
}

declare module "claudia-bot-builder" {
    namespace fbTemplate {
        interface FacebookTemplate {
            getReadingDuration: () => number
            setBaseUrl: (url: string) => this
        }
        interface Text {
            template: { text: string };
        }
    }
}

FacebookTemplate.prototype.getReadingDuration = () => 1000;
Text.prototype.getReadingDuration = function(this: Text) { return this.template.text.match(/\w+/g)!.length * 250; }

FacebookTemplate.prototype.setBaseUrl = function(this: List, url: string) { return this }
List.prototype.setBaseUrl = function(this: List, url: string) { 
    this.bubbles.filter(b => b.image_url).forEach(b => b.image_url = url + b.image_url);
    return this
}
