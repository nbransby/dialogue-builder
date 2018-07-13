"use strict";

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

Object.defineProperty(exports, "__esModule", { value: true });

require("core-js/modules/es7.object.values");

require("core-js/modules/es7.object.entries");

require("core-js/modules/es7.object.get-own-property-descriptors");

require("core-js/modules/es7.string.pad-start");

require("core-js/modules/es7.string.pad-end");

const emojiRegex = require('emoji-regex');
const assert = require("assert");
const builder = require("claudia-bot-builder");
var BaseTemplate = builder.fbTemplate.BaseTemplate;
var Text = builder.fbTemplate.Text;
var Pause = builder.fbTemplate.Pause;
var List = builder.fbTemplate.List;
var Button = builder.fbTemplate.Button;
var Generic = builder.fbTemplate.Generic;
var Attachment = builder.fbTemplate.Attachment;
var ChatAction = builder.fbTemplate.ChatAction;
exports.location = Symbol("a location");
exports.onText = Symbol("a typed response");
exports.onLocation = Symbol("a location");
exports.onImage = Symbol("an image");
exports.onAudio = Symbol("a voice recording");
exports.onVideo = Symbol("a video");
exports.onFile = Symbol("a file");
exports.defaultAction = Symbol();
exports.onUndo = Symbol();
// export interface ResponseHandler {
//     readonly [quickReply: string]: () => Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [location]?(lat: number, long: number, title?: string, url?: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onText]?(text: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onLocation]?(lat: number, long: number, title?: string, url?: string): Goto | Expect | void | Promise<Goto | Expect | void>
//     readonly [onImage]?(url: string): Goto | Expect | void;
// }
const ordinals = ['first', 'second', 'third', 'forth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
class UnexpectedInputError extends Error {
    constructor(localizedMessage = `Sorry, I didn't quite catch that`, repeatQuestion = true, showQuickReplies = true) {
        super(localizedMessage);
        this.localizedMessage = localizedMessage;
        this.repeatQuestion = repeatQuestion;
        this.showQuickReplies = showQuickReplies;
    }
}
exports.UnexpectedInputError = UnexpectedInputError;
class UndefinedHandlerError extends UnexpectedInputError {
    constructor(handler) {
        const keys = Object.getOwnPropertySymbols(handler).map(symbol => /Symbol\((.*)\)/.exec(symbol.toString())[1]).filter(k => k.length > 0);
        super(`Sorry, I didn't quite catch that${keys.length === 0 ? '' : `, I was expecting ${keys.join(' or ')}`}`);
    }
}
class Directive {
    constructor(text) {
        this.text = text;
        const index = text.indexOf('::');
        if (index < 0) {
            this.name = text;
        } else {
            this.script = text.substring(0, index);
            this.name = text.substring(index + 2);
        }
    }
    path(script) {
        return `${this.script || script}::${this.name}`;
    }
    toString() {
        return this.text;
    }
    static assertEqual(a, b) {
        if (a && b && (Object.getPrototypeOf(a) != Object.getPrototypeOf(b) || a.script != b.script || a.name != b.name)) throw new Error('Opposing directives given');
    }
}
exports.Directive = Directive;
class Expect extends Directive {}
exports.Expect = Expect;
class Goto extends Directive {}
exports.Goto = Goto;
class Rollback extends Goto {}
exports.Rollback = Rollback;
class Ask extends Text {}
function say(template, ...substitutions) {
    return new Text(String.raw(template, ...substitutions).replace(/([\s]) +/g, '$1'));
}
exports.say = say;
function ask(template, ...substitutions) {
    return new Ask(String.raw(template, ...substitutions).replace(/([\s]) +/g, '$1'));
}
exports.ask = ask;
function expect(template, ...substitutions) {
    return new Expect(String.raw(template, ...substitutions));
}
exports.expect = expect;
function goto(template, ...substitutions) {
    return new Goto(String.raw(template, ...substitutions));
}
exports.goto = goto;
function rollback(template, ...substitutions) {
    return new Rollback(String.raw(template, ...substitutions));
}
exports.rollback = rollback;
function audio(template, ...substitutions) {
    return new Attachment(String.raw(template, ...substitutions), 'audio');
}
exports.audio = audio;
function video(template, ...substitutions) {
    return new Attachment(String.raw(template, ...substitutions), 'video');
}
exports.video = video;
function image(template, ...substitutions) {
    return new Attachment(String.raw(template, ...substitutions), 'image');
}
exports.image = image;
function file(template, ...substitutions) {
    return new Attachment(String.raw(template, ...substitutions), 'file');
}
exports.file = file;
class TemplateBuilder {
    constructor(identifier, builder) {
        this.identifier = identifier;
        this.builder = builder;
        this.postbacks = [];
    }
    build(script) {
        return this.builder(script);
    }
}
exports.TemplateBuilder = TemplateBuilder;
function buttons(id, text, handler) {
    const builder = new TemplateBuilder(`buttons '${id}'`, script => {
        const buttons = new Button(text);
        Object.entries(handler).forEach(([k, v]) => buttons.addButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in buttons '${id}'`, toOptions(v)));
        return buttons;
    });
    Object.entries(handler).forEach(([k, v]) => typeof v == "function" && builder.postbacks.push([`'${k}' button in buttons '${id}'`, v]));
    return builder;
}
exports.buttons = buttons;
function toOptions(button) {
    return typeof button === "function" ? undefined : {
        webview_height_ratio: button.height,
        webview_share_button: button.shareable ? undefined : 'hide'
    };
}
function list(id, type, bubbles, handler) {
    const builder = new TemplateBuilder(`list '${id}'`, script => {
        const list = new List(type);
        bubbles.forEach((bubble, index) => {
            list.addBubble(bubble.title, bubble.subtitle);
            if (bubble.image) list.addImage(bubble.image);
            if (bubble.buttons && bubble.buttons[exports.defaultAction]) {
                const button = bubble.buttons[exports.defaultAction];
                list.addDefaultAction(typeof button !== "function" ? button.url : `${script}::default action of ${ordinals[index]} bubble of list '${id}'`, toOptions(button));
            }
            bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) => list.addButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in ${ordinals[index]} bubble of list '${script}::${id}'`, undefined, toOptions(v)));
        });
        handler && Object.entries(handler).forEach(([k, v]) => list.addListButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in list '${id}'`, undefined, toOptions(v)));
        return list;
    });
    bubbles.forEach((bubble, index) => {
        if (bubble.buttons && bubble.buttons[exports.defaultAction]) {
            const button = bubble.buttons[exports.defaultAction];
            typeof button == "function" && builder.postbacks.push([`default action of ${ordinals[index]} bubble of list '${id}'`, button]);
        }
        bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) => typeof v == "function" && builder.postbacks.push([`'${k}' button in ${ordinals[index]} bubble of list '${id}'`, v]));
    });
    handler && Object.entries(handler).forEach(([k, v]) => typeof v == "function" && builder.postbacks.push([`'${k}' button in list '${id}'`, v]));
    return builder;
}
exports.list = list;
function generic(id, type, bubbles) {
    const builder = new TemplateBuilder(`generic '${id}'`, script => {
        const generic = new Generic();
        if (type == 'square') generic.useSquareImages();
        bubbles.forEach((bubble, index) => {
            generic.addBubble(bubble.title, bubble.subtitle);
            if (bubble.image) generic.addImage(bubble.image);
            if (bubble.buttons && bubble.buttons[exports.defaultAction]) {
                const button = bubble.buttons[exports.defaultAction];
                generic.addUrl(typeof button !== "function" ? button.url : `${script}::default action of ${ordinals[index]} bubble of generic '${id}'`);
            }
            bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) => generic.addButton(k, typeof v !== "function" ? v.url : `${script}::'${k}' button in ${ordinals[index]} bubble of generic '${script}::${id}'`, toOptions(v)));
        });
        return generic;
    });
    bubbles.forEach((bubble, index) => {
        if (bubble.buttons && bubble.buttons[exports.defaultAction]) {
            const button = bubble.buttons[exports.defaultAction];
            typeof button == "function" && builder.postbacks.push([`default action of ${ordinals[index]} bubble of generic '${id}'`, button]);
        }
        bubble.buttons && Object.entries(bubble.buttons).forEach(([k, v]) => typeof v == "function" && builder.postbacks.push([`'${k}' button in ${ordinals[index]} bubble of generic '${id}'`, v]));
    });
    return builder;
}
exports.generic = generic;
class Dialogue {
    constructor(defaultScript, delegate) {
        this.defaultScript = defaultScript;
        this.handlers = new Map();
        const labels = new Map();
        const expects = new Map();
        const jumps = [];
        const loaded = new Set();
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
                            if (handler.hasOwnProperty(exports.location) && handler.hasOwnProperty(exports.onLocation)) throw new Error(`Both location and onLocation implemented in the same response handler (${name}:${line}): expect \`${value}\``);
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
                            throw new Error(`Response handler must be preceded by an expect statement (${name}:${line})`);
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
    execute(directive) {
        var _this = this;

        return _asyncToGenerator(function* () {
            yield _this.state.retrieveState();
            _this.state.jump(directive, `Dialogue.execute(${directive.constructor.name.toLowerCase()} \`${directive}\`)`);
        })();
    }
    setKeywordHandler(keywords, handler) {
        const keys = keywords instanceof Array ? keywords : [keywords];
        const undo = () => {
            this.outputFilter = o => o instanceof Ask;
            this.state.undo();
            const line = this.state.startLine - 1;
            const handler = this.script[line];
            handler && handler[exports.onUndo] && handler[exports.onUndo]();
            this.state.repeat();
        };
        const h = handler === 'restart' ? () => this.state.restart() : handler === 'undo' ? undo : handler;
        keys.forEach(k => this.handlers.set(`keyword '${k.toLowerCase()}'`, h));
    }
    resume(lambdaContext) {
        var _this2 = this;

        return _asyncToGenerator(function* () {
            return _this2.send(lambdaContext, 'REGULAR');
        })();
    }
    send(lambdaContext, notificationType, unexpectedInput) {
        var _this3 = this;

        return _asyncToGenerator(function* () {
            yield _this3.state.retrieveState();
            const insertPauses = function (output) {
                //calculate pauses between messages
                const remaining = Math.min(10 * 1000, lambdaContext.getRemainingTimeInMillis() - 5);
                const factor = Math.min(1, remaining / output.reduce(function (total, o) {
                    return total + o.getReadingDuration();
                }, 0));
                //get output and insert pauses
                const messages = [];
                output.forEach(function (message) {
                    return messages.push(message.setBaseUrl(_this3.baseUrl).setNotificationType(notificationType), new ChatAction('typing_on'), new Pause(message.getReadingDuration() * factor));
                });
                messages.length -= 2;
                return messages;
            };
            const output = unexpectedInput && unexpectedInput.localizedMessage ? [new Text(unexpectedInput.localizedMessage)] : [];
            //gather output
            for (let i = _this3.state.startLine; i < _this3.script.length; i++) {
                const element = _this3.script[i] instanceof TemplateBuilder ? _this3.script[i].build(_this3.state.currentScript) : _this3.script[i];
                //if element is output
                if (element instanceof BaseTemplate) {
                    if (!_this3.outputFilter || _this3.outputFilter(element)) output.push(element);
                } else if (element instanceof Goto) {
                    i = _this3.state.jump(element, `${_this3.state.currentScript}::${i}`, true) - 1;
                } else if (typeof element === 'string') {
                    //if element is a breaking label
                    if (element.startsWith('!')) break;
                } else if (element instanceof Expect) {
                    //persist asking of this question
                    yield _this3.state.complete(element);
                    if (output.length == 0) return [];
                    if (!unexpectedInput || unexpectedInput.showQuickReplies) {
                        //add quick replies if present
                        if (_this3.script[i + 1][exports.location]) output[output.length - 1].addQuickReplyLocation();
                        Object.keys(_this3.script[i + 1]).forEach(function (key) {
                            return output[output.length - 1].addQuickReply(key, key);
                        });
                    }
                    return insertPauses(output).map(function (e) {
                        return e.get();
                    });
                }
            }
            //persist completion 
            yield _this3.state.complete();
            return output.length == 0 ? [] : insertPauses(output).map(function (e) {
                return e.get();
            });
        })();
    }
    consume(message, apiRequest) {
        var _this4 = this;

        return _asyncToGenerator(function* () {
            let unexpectedInput = undefined;
            try {
                yield _this4.state.retrieveState();
                const consumePostback = (() => {
                    var _ref = _asyncToGenerator(function* (identifier) {
                        _this4.handlers.has(identifier) || _this4.delegate.loadScript(identifier.includes('::') ? identifier.substr(0, identifier.indexOf('::')) : _this4.defaultScript);
                        const handler = _this4.handlers.get(identifier);
                        if (!handler) return false;
                        const goto = yield handler();
                        goto instanceof Goto && _this4.state.jump(goto, identifier);
                        return true;
                    });

                    return function consumePostback(_x) {
                        return _ref.apply(this, arguments);
                    };
                })();
                const consumeKeyword = function (keyword) {
                    return consumePostback(`keyword '${keyword.toLowerCase()}'`);
                };
                //process input
                if (message.originalRequest.postback) {
                    const payload = message.originalRequest.postback.payload;
                    (yield consumePostback(payload)) || (yield consumeKeyword(payload)) || console.log(`Postback received with unknown payload '${payload}'`);
                } else if (!(yield consumeKeyword(message.text))) {
                    const processResponse = (() => {
                        var _ref2 = _asyncToGenerator(function* (line) {
                            const handler = _this4.script[line - 1];
                            //if empty handler do nothing
                            if (Object.getOwnPropertyNames(handler).length == 0 && Object.getOwnPropertySymbols(handler).length == 0) return;
                            //handle any attachments
                            const handle = function (handler, invoke, ...keys) {
                                keys = keys.filter(function (key) {
                                    return handler.hasOwnProperty(key);
                                });
                                if (keys.length == 0) throw new UndefinedHandlerError(handler);
                                return handler[keys[0]] ? invoke(handler[keys[0]]) : undefined;
                            };
                            let results = [];
                            for (const attachment of message.originalRequest.message.attachments || []) {
                                switch (attachment.type) {
                                    case 'location':
                                        const invoke = function (m) {
                                            return m.call(handler, attachment.payload.coordinates.lat, attachment.payload.coordinates.long, attachment.payload.title, attachment.payload.url);
                                        };
                                        results.push(handle(handler, invoke, exports.location, exports.onLocation, exports.defaultAction));
                                        break;
                                    case 'image':
                                        results.push(handle(handler, function (m) {
                                            return m.call(handler, attachment.payload.url);
                                        }, exports.onImage, exports.defaultAction));
                                        break;
                                    case 'audio':
                                        results.push(handle(handler, function (m) {
                                            return m.call(handler, attachment.payload.url);
                                        }, exports.onAudio, exports.defaultAction));
                                        break;
                                    case 'video':
                                        results.push(handle(handler, function (m) {
                                            return m.call(handler, attachment.payload.url);
                                        }, exports.onVideo, exports.defaultAction));
                                        break;
                                    case 'file':
                                        results.push(handle(handler, function (m) {
                                            return m.call(handler, attachment.payload.url);
                                        }, exports.onFile, exports.defaultAction));
                                        break;
                                    default:
                                        throw new Error(`Unsupported attachment type '${attachment.type}'`);
                                }
                            }
                            const result = yield results.length ? Promise.all(results).then(function (r) {
                                return r.reduce(function (p, c) {
                                    return Directive.assertEqual(p, c) || p || c;
                                });
                            }) : handle(handler, function (m) {
                                return m.call(handler, message.text);
                            }, message.text, exports.onText, exports.defaultAction);
                            if (!(result instanceof Directive)) return;
                            line = _this4.state.jump(result, `${_this4.state.currentScript}::expect \`${_this4.script[line - 2].toString()}\``, false, false);
                            result instanceof Expect && (yield processResponse(line));
                        });

                        return function processResponse(_x2) {
                            return _ref2.apply(this, arguments);
                        };
                    })();
                    if (_this4.state.currentType == 'expect') yield processResponse(_this4.state.startLine);
                }
            } catch (error) {
                if (!(error instanceof UnexpectedInputError)) throw error;
                _this4.state.repeat();
                _this4.outputFilter = function (o) {
                    return error.repeatQuestion ? o instanceof Ask : false;
                };
                unexpectedInput = error;
            }
            return _this4.state.currentType == 'complete' ? [] : _this4.send(apiRequest.lambdaContext, 'NO_PUSH', unexpectedInput);
        })();
    }
}
exports.Dialogue = Dialogue;
class State {
    constructor(defaultScript, labels, expects, delegate) {
        this.defaultScript = defaultScript;
        this.labels = labels;
        this.expects = expects;
        this.delegate = delegate;
        this.jumpCount = 0;
    }
    retrieveState() {
        var _this5 = this;

        return _asyncToGenerator(function* () {
            if (!_this5.state) {
                const json = yield _this5.delegate.loadState();
                _this5.state = typeof json === 'string' ? JSON.parse(json) : [];
                _this5.state.length == 0 && _this5.restart();
            }
        })();
    }
    get currentType() {
        assert(this.state);
        return this.state[0].type;
    }
    get currentScript() {
        assert(this.state);
        return this.state[0] && this.state[0].path && this.state[0].path.substr(0, this.state[0].path.indexOf('::')) || this.defaultScript;
    }
    get startLine() {
        assert(this.state);
        const path = this.state[0].path;
        switch (this.currentType) {
            case 'expect':
                this.delegate.loadScript(path.substr(0, path.indexOf('::')));
                return this.expects.get(path) + 2 || 0;
            case 'label':
                this.delegate.loadScript(path.substr(0, path.indexOf('::')));
                return this.labels.get(path) + 1 || 0;
            default:
                throw new Error(`Unexpected state ${this.state[0].type}`);
        }
    }
    jump(location, source, fromInlineGoto = false, persistExpect = true) {
        assert(this.state);
        this.delegate.loadScript(location.script || this.currentScript);
        if (++this.jumpCount > 10) throw new Error(`Endless loop detected (${source}): ${location.constructor.name.toLowerCase()} \`${location}\``);
        if (this.currentType == 'complete') this.state.shift();
        if (location instanceof Expect) {
            const line = this.expects.get(location.path(this.currentScript));
            if (line === undefined) throw new Error(`Could not find expect (${source}): expect \`${location}\``);
            if (persistExpect) this.state.unshift({ type: 'expect', path: location.path(this.currentScript) });
            return line + 2 || 0;
        }
        if (!this.labels.has(location.path(this.currentScript))) throw new Error(`Could not find label (${source}): ${location instanceof Rollback ? 'rollback' : 'goto'} \`${location}\``);
        console.log(`${location instanceof Rollback ? 'Rolling back past' : 'Jumping to'} label '${location.path(this.currentScript)}' (${source}): ${location.constructor.name.toLowerCase()} \`${location}\``);
        if (location instanceof Rollback) {
            this.state.unshift(this.state[this.state.findIndex(s => s.type === 'label' && s.path === location.path(this.currentScript)) + 1]);
            return this.startLine;
        }
        this.state.unshift({ type: 'label', path: location.path(this.currentScript), inline: fromInlineGoto });
        return this.startLine;
    }
    complete(expect) {
        var _this6 = this;

        return _asyncToGenerator(function* () {
            assert(_this6.state);
            _this6.state.unshift(expect ? { type: 'expect', path: expect.path(_this6.currentScript) } : { type: 'complete' });
            yield _this6.delegate.saveState(JSON.stringify(_this6.state));
        })();
    }
    restart() {
        assert(this.state);
        this.state = [{ type: 'label', path: this.defaultScript + '::', inline: false }];
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
var mock;
(function (mock) {
    mock.sender = {
        id: 'user'
    };
    mock.apiRequest = {
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
    function message(text) {
        return {
            postback: false,
            text: text,
            sender: mock.sender.id,
            type: 'facebook',
            originalRequest: {
                sender: mock.sender,
                recipient: { id: "bot" },
                timestamp: 0,
                message: {
                    mid: "1",
                    seq: 1,
                    text: text
                }
            }
        };
    }
    mock.message = message;
    function postback(payload = 'USER_DEFINED_PAYLOAD', text = '') {
        return {
            postback: true,
            text: text,
            sender: mock.sender.id,
            type: 'facebook',
            originalRequest: {
                sender: mock.sender,
                recipient: { id: "bot" },
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
    mock.postback = postback;
    function location(lat, long, title, url) {
        return {
            postback: false,
            text: title || "",
            sender: mock.sender.id,
            type: 'facebook',
            originalRequest: {
                sender: mock.sender,
                recipient: { id: "bot" },
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
        };
    }
    mock.location = location;
    function multimedia(type, urls, text = '') {
        return {
            postback: false,
            text: text,
            sender: mock.sender.id,
            type: 'facebook',
            originalRequest: {
                sender: mock.sender,
                recipient: { id: "bot" },
                timestamp: 0,
                message: {
                    mid: "1",
                    seq: 1,
                    text: text,
                    attachments: (typeof urls == 'string' ? [urls] : urls).map(url => ({
                        type: type,
                        payload: {
                            url: url
                        }
                    }))
                }
            }
        };
    }
    mock.multimedia = multimedia;
})(mock = exports.mock || (exports.mock = {}));
BaseTemplate.prototype.getReadingDuration = () => 1000;
Text.prototype.getReadingDuration = function () {
    const words = this.template.text.match(/\w+/g);
    const emojis = this.template.text.match(emojiRegex());
    return (words ? words.length * 250 : 0) + (emojis ? Math.max(words ? 0 : 2000, emojis.length * 500) : 0);
};
BaseTemplate.prototype.setBaseUrl = function () {
    return this;
};
List.prototype.setBaseUrl = function (url) {
    this.bubbles.forEach(b => b.image_url = !b.image_url || b.image_url.indexOf('://') >= 0 ? b.image_url : url + b.image_url);
    return this;
};
Generic.prototype.setBaseUrl = function (url) {
    this.bubbles.forEach(b => b.image_url = !b.image_url || b.image_url.indexOf('://') >= 0 ? b.image_url : url + b.image_url);
    return this;
};
Attachment.prototype.setBaseUrl = function (baseUrl) {
    const url = this.template.attachment.payload.url;
    if (url.indexOf('://') < 0) this.template.attachment.payload.url = baseUrl + url;
    return this;
};
//# sourceMappingURL=dialogue-builder.js.map
