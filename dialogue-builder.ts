import assert = require('assert');
import builder = require('claudia-bot-builder')
import Message = builder.Message;
import Text = builder.fbTemplate.Text;
import Pause = builder.fbTemplate.Pause;
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

export type Label = String

export class Statement {
    constructor(private readonly text: string) {}

    toString(): string {
        return this.text;
    }
}

export class Expect extends Statement {}
export class Goto extends Statement {}

export class Output extends Statement {
    constructor(text: string) {
        super(text.replace(/([\s]) +/g, '$1'));
    }
}

export class Say extends Output {}
export class Ask extends Output {}

export type Script = Array<Label | Statement | ResponseHandler>

export function say(template: TemplateStringsArray, ...substitutions: any[]): Say {
    return new Say(String.raw(template, ...substitutions));
}

export function ask(template: TemplateStringsArray, ...substitutions: string[]): Ask {
    return new Ask(String.raw(template, ...substitutions));
}

export function expect(template: TemplateStringsArray, ...substitutions: string[]): Expect {
    return new Expect(String.raw(template, ...substitutions));
}

export function goto(template: TemplateStringsArray, ...substitutions: string[]): Goto {
    return new Goto(String.raw(template, ...substitutions));
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


type Processor = { onLast: (handler: ResponseHandler) => void | Goto, onNext: (output: Output[], expect: Expect, handler: ResponseHandler) => Promise<string[]>, onComplete: (output: Output[]) => Promise<string[]> }


export class Dialogue<T> {
    private readonly script: Script
    private readonly state: State
    private readonly keywords: Map<string, () =>  void | Goto>
    private outputType: typeof Output

    constructor(builder: DialogueBuilder<T>, storage: Storage, ...context: T[]) {
        this.script = builder(...context);
        this.keywords = new Map();
        this.outputType = Output;
        const labels = new Map();
        const expects = new Set();
        const gotos: {line: number, label: string}[] = [];
        for(let line = 0; line < this.script.length; line++) {
            const value = this.script[line];
            if(value instanceof Expect) {
                if(expects.has(value.toString())) throw new Error(`Duplicate expect statement found on line ${line}: expect \`${value}\``);
                expects.add(value.toString());   
                const handler = this.script[++line];
                if(!handler || handler instanceof Statement) throw new Error("Expect statement must be followed by a response handler on line ${line}: expect \`${value}\``");
                if(handler.hasOwnProperty(location) && handler.hasOwnProperty(onLocation)) throw new Error("Both location and onLocation implemented in the same response handler on line ${line}: expect \`${value}\``");
            } else if(typeof value === 'string') {
                if(labels.has(value)) throw new Error(`Duplicate label found on line ${line}: '${value}'`);
                labels.set(value, line);
            } else if(value instanceof Goto) {
                gotos.push({line: line, label: value.toString()});
            } else if(!(value instanceof Output)) {
                throw new Error("Response handler must be preceeded by an expect statement on line ${line}: expect \`${value}\``")
            }
        }
        if(labels.size == this.script.length) throw new Error('Dialogue cannot be empty');
        const goto = gotos.find(g => !labels.has(g.label));
        if(goto) new Error(`Could not find label referenced on line ${goto.line}: goto \`${goto.label}\``);
        this.state = new State(storage, labels);
    }

    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)) {
        const keys = keywords instanceof Array ? keywords : [keywords];
        const undo = () => { 
            this.outputType = Ask; 
            this.state.undo();  
        }
        const h = handler === 'restart' ? () => this.state.restart() : handler === 'undo' ? undo : handler;
        keys.forEach(k => this.keywords.set(k, h));
    }
    
    private async process(dialogue: Script, processor: Processor): Promise<string[]> {
        const output: Output[] = []
        for(let i = this.state.startLine; i < dialogue.length; i++) {
            const element = dialogue[i];
            //if element is an inline goto
            if(element instanceof Goto) {
                i = this.state.jump(element, i);
                continue;
            }
            //skip messages
            if(element instanceof Output) {
                output.push(element)
            } else if(element instanceof Expect) {
                const handler = dialogue[++i];
                //if has already been asked
                if(this.state.isAsked(element)) {
                    try {
                        if(this.state.isLastAsked(element)) {
                            const goto = processor.onLast(handler);
                            i = goto ? this.state.jump(goto, i) : i;
                        }
                        output.length = 0;
                        continue;
                    } catch(e) {
                        if(!(e instanceof UnexpectedInputError)) throw e;
                        output.unshift(new Ask(e.message));
                        this.outputType = Ask;
                    }
                }
                return processor.onNext(output.filter(e => e instanceof this.outputType), element, handler);                             
            }
        }
        return processor.onComplete(output);
    }     

    private static handle<T>(handler: ResponseHandler, invoke: (method: Function) => T, ...keys: Array<string | symbol>): T | undefined {
        keys = keys.filter(key => handler.hasOwnProperty(key));
        if(keys.length == 0) throw new UndefinedHandlerError(handler);
        return handler[keys[0]] ? invoke(handler[keys[0]]) : undefined;
    }

    async consume(message: Message, onComplete?: () => void): Promise<string[]> {
        await this.state.retrieveState()
        const keyword = this.keywords.get(message.text.toLowerCase())
        if(keyword) {
            const goto = keyword();
            if(goto) this.state.jump(goto, message.text.toLowerCase());
        }
        if(this.state.isComplete) {
            throw [];
        }
        return this.process(this.script, {
            onLast: (handler: ResponseHandler) => {
                //if empty handler do nothing
                if(Object.getOwnPropertyNames(handler).length == 0 && Object.getOwnPropertySymbols(handler).length == 0) return;
                //handle any attachments
                for(let attachment of message.originalRequest.message.attachments || []) {
                    switch(attachment.type) {
                        case 'location':
                            const invoke = (m: Function) => m(attachment.payload.coordinates!.lat, attachment.payload.coordinates!.long, attachment.payload.title, attachment.payload.url);
                            return Dialogue.handle(handler, invoke, location, onLocation);
                        case 'image':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onImage);
                        case 'audio':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onAudio);
                        case 'video':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onVideo);
                        case 'file':
                            return Dialogue.handle(handler, m => m(attachment.payload.url), onFile);
                        default:
                            throw new Error(`Unsupported attachment type '${attachment.type}'`)
                    }
                }
                return Dialogue.handle(handler, m => m(message.text), message.text, onText);
            },
            onNext: async (output, expect, handler) => {
                //persist asking of this question
                await this.state.complete(expect);
                //send messages and quick replies if present
                const messages = output.reduce((r, e) => [...r, new Pause(), new Text(e.toString())], [] as Array<Pause|Text>) as Text[];
                if(handler[location]) messages[messages.length - 1].addQuickReplyLocation();
                Object.keys(handler).forEach(key => messages[messages.length - 1].addQuickReply(key, key));
                return messages.map(text => text.get());
            },
            onComplete: async (output) => {
                //persist completion 
                await this.state.complete();
                onComplete && onComplete();
                //send remaining messages
                return output.reduce((r, e) => [...r, new Pause(), new Text(e.toString())], [] as Array<Pause|Text>).map(text => text.get());
            }
        })
    }
}

class State {
    private state: Array<{ type: 'label'|'expect'|'complete', name?: string }>
    private asked: Set<string>
    private completed: boolean
    private lastAsked: string | undefined
    private startLabel: string | undefined
    private jumpCount = 0;

    constructor(private storage: Storage, private labels: Map<string, number>) {
    }

    async retrieveState() {
        if(!this.state) {
            this.state = await this.storage.retrieve() as any || [];
            this.lastAsked = this.stateChanged();
        }
    }

    private stateChanged(): string | undefined {
        const asked = this.state.filter(s => s.type !== 'label').map(s => s.name!)
        this.asked = new Set(asked);
        const label = this.state.find(s => s.type == 'label');
        this.startLabel = label && label.name;
        this.completed = this.state.some(s => s.type == 'complete');
        return asked[0];
    }

    isAsked(expect: Expect): boolean {
        assert(this.state);
        return this.asked.has(expect.toString());
    }

    isLastAsked(expect: Expect): boolean {
        assert(this.state);
        return expect.toString() === this.lastAsked;
    }

    get isComplete(): boolean {
        assert(this.state);
        return this.completed;
    }

    get startLine(): number {
        assert(this.state);
        return this.labels.get(this.startLabel!) || 0;
    }

    jump(goto: Goto, lineOrKeyword: number|string): number {
        assert(this.state);
        const index = this.labels.get(goto.toString());
        if(!index) throw new Error(`Could not find label referenced ${typeof lineOrKeyword == 'number' ? 'on line' : 'by keyword'} '${lineOrKeyword}': goto \`${goto.toString()}\``);
        if(++this.jumpCount > 10) throw new Error(`Endless loop detected ${typeof lineOrKeyword == 'number' ? 'on line' : 'by keyword'} '${lineOrKeyword}': goto \`${goto.toString()}\``);
        // console.log(`Jumping to label '${goto.toString()}' on line ${index}`);
        this.state.unshift({ type: 'label', name: goto.toString()})
        this.startLabel = goto.toString();
        return index;
    }

    async complete(expect?: Expect) {
        assert(this.state);
        this.state.unshift(expect ? { type: 'expect', name: expect.toString()} : { type: 'complete'});
        this.lastAsked = this.stateChanged();
        await this.storage.store(this.state);
    }
    
    restart() {
        assert(this.state);
        this.lastAsked = undefined;
        this.state.length = 0;
        this.stateChanged();
    }

    undo() {
        assert(this.state);
        this.state.splice(0, this.state.findIndex((s, i) => s.type === 'expect' && s.name !== this.lastAsked || i + 1 === this.state.length) + 1);
        this.lastAsked = undefined;
        this.stateChanged();
    }
}
