
import { Dialogue, dialogue, Storage, Script, goto, say, ask, expect, onText, location, onLocation, onFile, onAudio, onImage, onVideo, image, audio, buttons, list } from './dialogue-builder'
import { Request } from 'claudia-api-builder'
import { Message, fbTemplate } from 'claudia-bot-builder'

Object.defineProperty(global, 'jasmineRequire', {
    value: { interface: () => {} },
    configurable: true
});
import 'jasmine-promises'

describe("Dialogue", () => {
    
    interface This {
        build<T>(script: (context: T) => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string }>, storage?: Storage, context?: T): [Dialogue<T>, Storage]
        message(text: string, payload?: string): Message
        multimedia(type: 'image'|'audio'|'video'|'file'|'location', url: string): Message
        location(lat: number, long: number, title?: string, url?: string): Message
        postback(payload?: string): Message
        apiRequest: Request
    }

    beforeEach(function(this: This) {
        this.build = function<T>(script: () => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string }>, storage = jasmine.createSpyObj('storage', ['store', 'retrieve']), ...context: T[]): [Dialogue<T>, Storage] {
            storage.retrieve.and.callFake(() => Promise.resolve(state));
            return [new Dialogue<T>(dialogue("Mock", script), storage, ...context), storage];            
        }        
        this.message = (text, payload) => { return {
            postback: payload !== undefined, 
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
                    text: "Get Started" 
                },
                postback: (payload && {
                    payload: payload!
                }) as {payload: string}
            }
        }}
        this.multimedia = (type: 'image'|'audio'|'video'|'file'|'location', url: string) => { return {
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
        }}
        this.location = (lat: number, long: number, title?: string, url?: string) => { return {
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
        }}
        this.postback = (payload?: string) => this.message('Get Started', payload || 'Get Started')
        this.apiRequest = {
            queryString: {},
            env: {},
            headers: {},
            normalizedHeaders: {},
            lambdaContext: { 
                callbackWaitsForEmptyEventLoop: false,
                getRemainingTimeInMillis: () => 15
            }            
        }
    });
    
    it("passes the supplied context to the script method", async function(this: This) {
        const [dialogue] = this.build(context => {
            jasmine.expect(context).toBe('mycontext');
            return [ say `Hi!`]
        }, [], undefined, 'mycontext');
        await dialogue.consume(this.postback(), this.apiRequest)
    });

    it("throws an exception on empty script given", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(
            () => this.build(() => [], [], storage)
        ).toThrow(jasmine.stringMatching('Dialogue cannot be empty'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("throws an exception on script only containing labels", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => [
                'start',
                'end'
            ], [], storage)).toThrow(jasmine.stringMatching('Dialogue cannot be empty'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("sends the first and only message in a single message dialogue", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`
        ], []);
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual(
            jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi!' })])
        );
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
    });
        
    it("sends all messages with NO_PUSH notification type", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`
        ], []);
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual(
            jasmine.arrayContaining([jasmine.objectContaining({ notification_type: 'NO_PUSH' })])
        );
    });
        
    it("throws empty array on consume when complete", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`
        ], []);
        await dialogue.consume(this.postback(), this.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
        await dialogue.consume(this.message('Hi'), this.apiRequest)
            .then(() => fail('Did not throw'))
            .catch(() => jasmine.expect(storage.store).toHaveBeenCalledTimes(1))
    });
        
    it("sends muliple messages at once surrounded with typing indicators with pauses inbetween", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`,
            ask `How are you?`,
        ], []);
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual([
            { sender_action: 'typing_on' }, 
            jasmine.objectContaining({ text: 'Hi!' }), 
            { claudiaPause: jasmine.anything() },
            jasmine.objectContaining({ text: `How are you?` }),
            { sender_action: 'typing_off' }
        ]);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
    });

    it("trims extranous whitespace in messages", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi   
            there!`
        ], []);
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual(
            jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi \nthere!' })])
        );
    });

    it("supports bot builder template class instances inline", async function(this: This) {
        const [dialogue] = this.build(() => [
            new fbTemplate.List("compact").addBubble('Bubble 1').addBubble('Bubble 2')
        ], []);
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual(
            jasmine.arrayContaining([
                jasmine.objectContaining({ attachment: 
                    jasmine.objectContaining({ payload: 
                        jasmine.objectContaining({ template_type: 'list' })})})])
        );
    });

    it("throws an exception on script with duplicate expect statements", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => [
                ask `How are you?`, 
                expect `I feel`, {},
                ask `How are you?`, 
                expect `I feel`, {},
            ], [], storage)
        ).toThrow(jasmine.stringMatching('Duplicate expect statement found'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("throws an exception on script with duplicate template ids", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => [
                buttons('some buttons', 'Some buttons', {}),
                buttons('some buttons', 'Some more buttons', {}),
            ], [], storage)
        ).toThrow(jasmine.stringMatching('Duplicate identifier found'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("throws an exception on expect statement not followed by a response handler", async function(this: This) {
        const test = (script: Script) => {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => script, [], storage))
            .toThrow(jasmine.stringMatching('Expect statement must be followed by a response handler'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
        //missing handler
        test([
            expect `I feel`,
            say `Yo!`
        ]);
        //at end of script
        test([
            expect `I feel`,
        ]);
    });

    it("throws an exception on a response handler not preceeded by an expect statement", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => [
                say `Hi`, {
                    "Hi": null
                }
            ], [], storage)
        ).toThrow(jasmine.stringMatching('Response handler must be preceeded by an expect statement'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("pauses on expect to wait for a response", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `Don't say this`
        ], []);
        const result = await dialogue.consume(this.postback(), this.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'How are you?' })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: 'I feel'}]);
    });

    it("resumes where it paused on recieving a response", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                [onText](text: string): void {}
            },
        ], [{ type: 'expect', name: `I feel` }]);
        jasmine.expect(await dialogue.consume(this.message('Amazing'), this.apiRequest)).toEqual([]);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete'}, { type: 'expect', name: 'I feel'}]);
    });
    
    it("attaches any quick replies defined in response handler to last message", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            ask `How are you?`, 
            expect `I feel`, {
                'Great': () => {},
                'Crap': () => {}
            },
        ], []);
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?`, quick_replies:[
                jasmine.objectContaining({ title: 'Great' }), 
                jasmine.objectContaining({ title: 'Crap' })
            ]})
        ]));
    });

    it("attaches location quick reply if defined in response handler", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `Where are you?`, 
            expect `I am here`, {
                [location]: () => {}
            },
        ], []);
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Where are you?`, quick_replies:[
                jasmine.objectContaining({ content_type: 'location' }), 
            ]})
        ]));
    });

    it("invokes a quick reply's handler on recieving the reply", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['Amazing'])
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, 
            handler
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(this.message('Amazing'), this.apiRequest)
        jasmine.expect(handler.Amazing).toHaveBeenCalled();
    });

    it("invokes a button handler on recieving the postback", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['Go']);
        const button = buttons('some buttons', 'Some buttons', handler);
        const [dialogue] = this.build(() => [
            button
        ], []);
        await dialogue.consume(this.postback(button.postbacks![0][0]), this.apiRequest);
        jasmine.expect(handler.Go).toHaveBeenCalled();
    });

    it("invokes a list bubble's button handler on recieving the postback", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['Go']);
        const mylist = list('my list', 'compact', [        
            ['Title', 'Subtitle', 'image.jpeg', {
                ['Go']: () => handler.Go()
            }],
            ['Title', 'Subtitle', 'image.jpeg', {}]
        ], handler);
        const [dialogue] = this.build(() => [
            mylist
        ], []);
        await dialogue.consume(this.postback(mylist.postbacks![0][0]), this.apiRequest);
        jasmine.expect(handler.Go).toHaveBeenCalled();
    });

    it("supports empty handlers", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `I don't care much`, 
        ], [{ type: 'expect', name: `I feel` }]);
        const result = await dialogue.consume(this.message('Great'), this.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `I don't care much` })
        ]));
    });

    it("supports null handlers", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                'Amazing': null,
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                [onText]: null
            },
            ask `Where are you?`, 
            expect `I am at`, {
                [location]: null
            },
            ask `Where do you want to go to?`, 
            expect `I want to go to`, {
                [onLocation]: null
            },
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(this.message('Amazing'), this.apiRequest) //I feel
        await dialogue.consume(this.message('My tests are passing'), this.apiRequest) //I feel that way because
        await dialogue.consume(this.location(50, 1, 'Work'), this.apiRequest) //I am at        
        await dialogue.consume(this.location(51, 1, 'The moon'), this.apiRequest) //I want to go to
    });

    it("throws an error when both location and onLocation specified on a handler", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => [
                ask `Where are you?`, 
                expect `I am here`, {
                    [location]: null,
                    [onLocation]: null
                },
            ], [{ type: 'expect', name: `I am here` }], storage)
        ).toThrow(jasmine.stringMatching('Both location and onLocation implemented in the same response handler'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("prefers a quick reply handler to the onText handler", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                'Amazing': null,
                [onText]: () => fail('Should not be called')
            },
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(this.message('Amazing'), this.apiRequest)
    });
    
    it("invokes the location handler on recieving a location quick reply", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['location'])
        const [dialogue] = this.build(() => [
            ask `Where are you?`,
            expect `I am here`, {
                [location]: (lat: number, long: number, title?: string, url?: string) => handler.location(lat, long, title, url)
            },
        ], [{ type: 'expect', name: `I am here` }]);
        await dialogue.consume(this.location(50, 1, 'Mock', "localhost"), this.apiRequest)
        jasmine.expect(handler.location).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    it("invokes the onText handler on recieving a text response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onText'])
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                [onText]: (text: string) => handler.onText(text)
            },
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(this.message('Amazing'), this.apiRequest)
        jasmine.expect(handler.onText).toHaveBeenCalledWith('Amazing');
    });

    it("invokes the onLocation handler on recieving a location response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onLocation'])
        const [dialogue] = this.build(() => [
            ask `Where are you?`,
            expect `I am here`, {
                [onLocation]: (lat: number, long: number, title?: string, url?: string) => handler.onLocation(lat, long, title, url)
            },
        ], [{ type: 'expect', name: `I am here` }]);
        await dialogue.consume(this.location(50, 1, 'Mock', "localhost"), this.apiRequest)
        jasmine.expect(handler.onLocation).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    it("invokes the onImage handler on recieving an image response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onImage'])
        const [dialogue] = this.build(() => [
            ask `What do you look like?`,
            expect `I look like`, {
                [onImage]: (url: string) => handler.onImage(url)
            },
        ], [{ type: 'expect', name: `I look like` }]);
        await dialogue.consume(this.multimedia("image", "photo.jpg"), this.apiRequest);
        jasmine.expect(handler.onImage).toHaveBeenCalledWith("photo.jpg");
    });

    it("invokes the onVideo handler on recieving an video response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onVideo'])
        const [dialogue] = this.build(() => [
            ask `What do you move like?`,
            expect `I move like`, {
                [onVideo]: (url: string) => handler.onVideo(url)
            },
        ], [{ type: 'expect', name: `I move like` }]);
        await dialogue.consume(this.multimedia("video", "video.mpg"), this.apiRequest);
        jasmine.expect(handler.onVideo).toHaveBeenCalledWith("video.mpg");
    });

    it("invokes the onAudio handler on recieving an audio response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onAudio'])
        const [dialogue] = this.build(() => [
            ask `What do you sound like?`,
            expect `I sound like`, {
                [onAudio]: (url: string) => handler.onAudio(url)
            },
        ], [{ type: 'expect', name: `I sound like` }]);
        await dialogue.consume(this.multimedia("audio", "recording.wav"), this.apiRequest);
        jasmine.expect(handler.onAudio).toHaveBeenCalledWith("recording.wav");
    });

    it("invokes the onFile handler on recieving an file response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onFile'])
        const [dialogue] = this.build(() => [
            ask `What do you write like?`,
            expect `I write like`, {
                [onFile]: (url: string) => handler.onFile(url)
            },
        ], [{ type: 'expect', name: `I write like` }]);
        await dialogue.consume(this.multimedia("file", "word.doc"), this.apiRequest);
        jasmine.expect(handler.onFile).toHaveBeenCalledWith("word.doc");
    });

    it("handles unexpected response types by repeating only the ask statements", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `What do you sound like?`,
            expect `I sound like`, {
                [onAudio]: (url: string) => null
            },
            ask `What do you write like?`,
            say `This won't be repeated`,
            ask `Send us a word document`,
            expect `I write like`, {
                [onFile]: (url: string) => null
            },
        ], [{ type: 'expect', name: `I write like` }, { type: 'expect', name: `I sound like` }]);
        const result = await dialogue.consume(this.multimedia("audio", "recording.wav"), this.apiRequest);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: `I write like` }, { type: 'expect', name: `I sound like` }]);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Sorry, I didn't quite catch that, I was expecting a file` }),
            jasmine.objectContaining({ text: `What do you write like?` }),
            jasmine.objectContaining({ text: `Send us a word document` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `This won't be repeated` }),
        ]));
    });

    it("falls through a label not prefixed with an explanation mark", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            'label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(this.postback(), this.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `label` })
        ]));
    });

    it("breaks on hitting a label prefixed with an explanation mark", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            '!label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(this.postback(), this.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `!label` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `label` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("respects inline gotos", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            goto `label`,
            say `Don't say this`,
            'label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(this.postback(), this.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
    });

    it("respects gotos retuned from response handlers", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => goto `label`
            },
            say `Don't say this`,
            'label',
            say `Goodbye`,
        ], [{ type: 'expect', name: `I feel` }]);
        const result = await dialogue.consume(this.message('Amazing'), this.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Goodbye' }), 
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
    });
    
    it("throws an exception on calling goto with a missing label", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        const [dialogue] = this.build(() => [
            say `Hi!`,
            goto `label`,
            ask `How are you?`,
        ], [], storage);
        await dialogue.consume(this.postback(), this.apiRequest)
            .then(() => fail('Did not throw'))
            .catch((e) => {
                jasmine.expect(e).toEqual(jasmine.stringMatching('Could not find label'));
                jasmine.expect(storage.store).not.toHaveBeenCalled();
            });
    });

    it("throws an exception on script with duplicate labels", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => [
                'label',
                say `Hi!`,
                'label',
                ask `How are you?`,
            ], [], storage)
        ).toThrow(jasmine.stringMatching('Duplicate label found'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("aborts a goto that causes an endless loop", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            'label',
            ask `How are you?`,
            goto `label`,
        ], []);
        await dialogue.consume(this.postback(), this.apiRequest)
            .then(() => fail('Did not throw'))
            .catch(e => {
                jasmine.expect(e).toEqual(jasmine.stringMatching('Endless loop detected'));
                jasmine.expect(storage.store).not.toHaveBeenCalled();
            });
    });
    
    it("resumes from the correct line when a goto skips a response handler", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => goto `label`
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                [onText]: null
            },
            'label',
            ask `Where are you?`, 
            expect `I am at`, {
                [location]: null
            },
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(this.message('Amazing'), this.apiRequest)
        jasmine.expect(storage.store).not.toHaveBeenCalledWith(jasmine.arrayContaining([{ type: 'complete' }]));
        const result = await dialogue.consume(this.location(50, 1), this.apiRequest);
        jasmine.expect(storage.store).toHaveBeenCalledWith(jasmine.arrayContaining([{ type: 'complete' }]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `But why?` })
        ]));
    });

    it("resets the dialogue when user sends a restart keyword", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': null
            },
        ], [{ type: 'expect', name: `I feel` }, { type: 'expect', name: `I feel that way because` }]);
        dialogue.setKeywordHandler('start over', 'restart')
        const result = await dialogue.consume(this.message('Start over'), this.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: 'I feel' }]);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("returns to previously asked question when user sends a undo keyword", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Don't repeat this on undo`,
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': null
            },
        ], [{ type: 'expect', name: `I feel that way because` }, { type: 'expect', name: `I feel` }]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(this.message('back'), this.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: `I feel` }]);
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't repeat this on undo` })
        ]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("returns to last asked question when user sends a undo keyword when complete", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': null
            },
        ], [{type: 'complete'}, { type: 'expect', name: `I feel that way because` }, { type: 'expect', name: `I feel` }]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(this.message('back'), this.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: `I feel that way because` }, { type: 'expect', name: `I feel` }]);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `But why?` })
        ]));
    });

    it("accounts for skipped questions due to goto statements when user sends a undo keyword", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': goto `why`
            },
            ask `Where are you?`, 
            expect `I am at`, {
                [location]: null
            },
            'why',
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': goto `end`
            },
        ], [{ type: 'expect', name: `I feel that way because` }, { type: 'label', name: `why` }, { type: 'expect', name: `I feel` }]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(this.message('back'), this.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: `I feel` }]);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("supports a user sending an undo or restart keyword at the start of a dialogue", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
        ], []);
        dialogue.setKeywordHandler('starft over', 'restart')
        dialogue.setKeywordHandler('back', 'undo')
        jasmine.expect(await dialogue.consume(this.message('start over'), this.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(storage.store).not.toHaveBeenCalledWith(jasmine.arrayContaining([{ type: 'complete' }]));
        jasmine.expect(await dialogue.consume(this.message('back'), this.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(storage.store).not.toHaveBeenCalledWith(jasmine.arrayContaining([{ type: 'complete' }]));
    });

    it("prefixes uris with the baseUrl but leaves full urls as is", async function(this: This) {
        const [dialogue] = this.build(() => [
            image `/image.jpg`,
            audio `http://google.com/audio.wav`
        ], []);
        dialogue.baseUrl = "http://localhost";
        jasmine.expect(await dialogue.consume(this.postback(), this.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ attachment: jasmine.objectContaining({ payload: { url: "http://localhost/image.jpg" }})}),
            jasmine.objectContaining({ attachment: jasmine.objectContaining({ payload: { url: "http://google.com/audio.wav" }})})
        ]));
    });
});