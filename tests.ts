
import { Dialogue, dialogue, Storage, Script, goto, say, ask, expect, onText, location, onLocation, onFile, onAudio, onImage, onVideo } from './dialogue-builder'
import { Request } from 'claudia-api-builder'
import { Message } from 'claudia-bot-builder'

Object.defineProperty(global, 'jasmineRequire', {
    value: { interface: () => {} }
});
import 'jasmine-promises'

describe("Dialogue", () => {
    
    interface This {
        build<T>(script: (context: T) => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string }>, storage?: Storage, context?: T): [Dialogue<T>, Storage]
        message(text: string, postback?: boolean): Message
        multimedia(type: 'image'|'audio'|'video'|'file'|'location', url: string): Message
        location(lat: number, long: number, title?: string, url?: string): Message
        postback: Message
        apiRequest: Request
    }

    beforeEach(function(this: This) {
        this.build = function<T>(script: () => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string }>, storage = jasmine.createSpyObj('storage', ['store', 'retrieve']), ...context: T[]): [Dialogue<T>, Storage] {
            storage.retrieve.and.callFake(() => Promise.resolve(state));
            return [new Dialogue<T>(dialogue("Mock", script), storage, ...context), storage];            
        }        
        this.message = (text, postback) => { return {
            postback: Boolean(postback), 
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
                } 
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
        this.postback = this.message('Get Started', true)
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
        await dialogue.consume(this.postback, this.apiRequest)
    });

    it("throws an exception on empty script given", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        try {
            this.build(() => [], [], storage);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Dialogue cannot be empty'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("throws an exception on script only containing labels", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        try {
            this.build(() => [
                'start',
                'end'
            ], [], storage);
            fail('Did not throw');
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Dialogue cannot be empty'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("sends the first and only message in a single message dialogue", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`
        ], []);
        const onComplete = jasmine.createSpy('onComplete')
        jasmine.expect(await dialogue.consume(this.postback, this.apiRequest, onComplete)).toEqual(jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi!' })]));
        jasmine.expect(onComplete).toHaveBeenCalled();
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
    });
        
    it("throws empty array on consume when complete", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`
        ], []);
        const onComplete = jasmine.createSpy('onComplete')
        await dialogue.consume(this.postback, this.apiRequest, onComplete)
        jasmine.expect(onComplete).toHaveBeenCalled();
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
        try {
            await dialogue.consume(this.message('Hi'), this.apiRequest, onComplete);
            fail('Did not throw');
        } catch(e) {
            jasmine.expect(e).toEqual([]);
            jasmine.expect(onComplete).toHaveBeenCalledTimes(1);
            jasmine.expect(storage.store).toHaveBeenCalledTimes(1);
        }
    });
        
    it("sends muliple messages at once", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`,
            ask `How are you?`,
        ], []);
        const onComplete = jasmine.createSpy('onComplete')
        jasmine.expect(await dialogue.consume(this.postback, this.apiRequest, onComplete)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(onComplete).toHaveBeenCalled();
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
    });

    it("trims extranous whitespace", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi   
            there!`
        ], []);
        jasmine.expect(await dialogue.consume(this.postback, this.apiRequest)).toEqual(jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi \nthere!' })]));
    });

    it("throws an exception on script with duplicate expect statements", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        try {
            this.build(() => [
                ask `How are you?`, 
                expect `I feel`, {},
                ask `How are you?`, 
                expect `I feel`, {},
            ], [], storage);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Duplicate expect statement found'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("throws an exception on expect statement not followed by a response handler", async function(this: This) {
        const test = (script: Script) => {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
            try {
                this.build(() => script, [], storage)
                fail('Did not throw')
            } catch(e) {
                jasmine.expect(e).toEqual(jasmine.stringMatching('Expect statement must be followed by a response handler'));
                jasmine.expect(storage.store).not.toHaveBeenCalled();
            }
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
        try {
            this.build(() => [
                say `Hi`, {
                    "Hi": null
                }
            ], [], storage);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Response handler must be preceeded by an expect statement'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("pauses on expect to wait for a response", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `Don't say this`
        ], []);
        const onComplete = jasmine.createSpy('onComplete')
        const result = await dialogue.consume(this.postback, this.apiRequest, onComplete);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'How are you?' })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
        jasmine.expect(onComplete).not.toHaveBeenCalled();
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: 'I feel'}]);
    });

    it("resumes where it paused on recieving a response", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                [onText](text: string): void {}
            },
        ], [{ type: 'expect', name: `I feel` }]);
        const onComplete = jasmine.createSpy('onComplete')
        jasmine.expect(await dialogue.consume(this.message('Amazing'), this.apiRequest, onComplete)).toEqual([]);
        jasmine.expect(onComplete).toHaveBeenCalled();
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
        jasmine.expect(await dialogue.consume(this.postback, this.apiRequest)).toEqual(jasmine.arrayContaining([
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
        jasmine.expect(await dialogue.consume(this.postback, this.apiRequest)).toEqual(jasmine.arrayContaining([
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

    it("supports empty handlers", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `I don't care much`, 
        ], [{ type: 'expect', name: `I feel` }]);
        const onComplete = jasmine.createSpy('onComplete')
        const result = await dialogue.consume(this.message('Great'), this.apiRequest, onComplete);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `I don't care much` })
        ]));
        jasmine.expect(onComplete).toHaveBeenCalled();
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
        try {
            this.build(() => [
                ask `Where are you?`, 
                expect `I am here`, {
                    [location]: null,
                    [onLocation]: null
                },
            ], [{ type: 'expect', name: `I am here` }], storage);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Both location and onLocation implemented in the same response handler'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
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
        const [dialogue] = this.build(() => [
            ask `What do you write like?`,
            say `This won't be repeated`,
            ask `Send us a word document`,
            expect `I write like`, {
                [onFile]: (url: string) => null
            },
        ], [{ type: 'expect', name: `I write like` }]);
        const onComplete = jasmine.createSpy('onComplete')
        const result = await dialogue.consume(this.multimedia("audio", "recording.wav"), this.apiRequest, onComplete);
        jasmine.expect(onComplete).not.toHaveBeenCalled();
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Sorry, I didn't quite catch that, I was expecting a file` }),
            jasmine.objectContaining({ text: `What do you write like?` }),
            jasmine.objectContaining({ text: `Send us a word document` })
        ]));
    });

    it("does not send labels as messages", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            'label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(this.postback, this.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `label` })
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
        const result = await dialogue.consume(this.postback, this.apiRequest);
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
        try {
            const [dialogue] = this.build(() => [
                say `Hi!`,
                goto `label`,
                ask `How are you?`,
            ], [], storage);
            await dialogue.consume(this.postback, this.apiRequest);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Could not find label'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("throws an exception on script with duplicate labels", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        try {
            this.build(() => [
                'label',
                say `Hi!`,
                'label',
                ask `How are you?`,
            ], [], storage);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Duplicate label found'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("aborts a goto that causes an endless loop", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`,
            'label',
            ask `How are you?`,
            goto `label`,
        ], []);
        try {
            await dialogue.consume(this.postback, this.apiRequest)
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Endless loop detected'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });
    
    it("resumes from the correct line when a goto skips a response handler", async function(this: This) {
        const [dialogue] = this.build(() => [
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
        const onComplete = jasmine.createSpy('onComplete')
        await dialogue.consume(this.message('Amazing'), this.apiRequest, onComplete)
        jasmine.expect(onComplete).not.toHaveBeenCalled();
        const result = await dialogue.consume(this.location(50, 1), this.apiRequest, onComplete);
        jasmine.expect(onComplete).toHaveBeenCalled();
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
        const onComplete = jasmine.createSpy('onComplete')
        const result = await dialogue.consume(this.message('Start over'), this.apiRequest, onComplete)
        jasmine.expect(onComplete).not.toHaveBeenCalled();
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
        const onComplete = jasmine.createSpy('onComplete')
        const result = await dialogue.consume(this.message('back'), this.apiRequest, onComplete)
        jasmine.expect(onComplete).not.toHaveBeenCalled();
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
        const onComplete = jasmine.createSpy('onComplete')
        const result = await dialogue.consume(this.message('back'), this.apiRequest, onComplete)
        jasmine.expect(onComplete).not.toHaveBeenCalled();
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
        const onComplete = jasmine.createSpy('onComplete')
        const result = await dialogue.consume(this.message('back'), this.apiRequest, onComplete)
        jasmine.expect(onComplete).not.toHaveBeenCalled();
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: `I feel` }]);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("supports a user sending an undo or restart keyword at the start of a dialogue", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
        ], []);
        dialogue.setKeywordHandler('start over', 'restart')
        dialogue.setKeywordHandler('back', 'undo')
        const onComplete = jasmine.createSpy('onComplete')
        jasmine.expect(await dialogue.consume(this.message('start over'), this.apiRequest, onComplete)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(onComplete).not.toHaveBeenCalled();
        jasmine.expect(await dialogue.consume(this.message('back'), this.apiRequest, onComplete)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(onComplete).not.toHaveBeenCalled();
    });
});