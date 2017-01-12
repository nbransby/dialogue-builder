import builder = require('claudia-bot-builder');
import Message = builder.Message;
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
export declare type Label = String;
export declare class Statement {
    private readonly text;
    constructor(text: string);
    toString(): string;
}
export declare class Expect extends Statement {
}
export declare class Goto extends Statement {
}
export declare class Output extends Statement {
    constructor(text: string);
}
export declare class Say extends Output {
}
export declare class Ask extends Output {
}
export declare type Script = Array<Label | Statement | ResponseHandler>;
export declare function say(template: TemplateStringsArray, ...substitutions: any[]): Say;
export declare function ask(template: TemplateStringsArray, ...substitutions: string[]): Ask;
export declare function expect(template: TemplateStringsArray, ...substitutions: string[]): Expect;
export declare function goto(template: TemplateStringsArray, ...substitutions: string[]): Goto;
export declare function dialogue<T>(name: string, script: (...context: T[]) => Script): DialogueBuilder<T>;
export interface DialogueBuilder<T> {
    (...context: T[]): Script;
    dialogueName: string;
}
export interface Storage {
    store(state: Object): void;
    retrieve(): Object;
}
export declare class Dialogue<T> {
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
