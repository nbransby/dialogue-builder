import { Dialogue, dialogue, Storage, Script, goto, say, ask, expect, onText, location, onLocation, onFile, onAudio, onImage, onVideo } from './dialogue-builder'
import { Message } from 'claudia-bot-builder'

describe("Dialogue", () => {
    
    interface This {
        build<T>(script: (context: T) => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string }>, storage?: Storage, context?: T): [Dialogue<T>, Storage]
        message(text: string, postback?: boolean): Message
        multimedia(type: 'image'|'audio'|'video'|'file'|'location', url: string): Message
        location(lat: number, long: number, title?: string, url?: string): Message
        postback: Message
    }

    beforeEach(function(this: This) {
        this.build = function<T>(script: () => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string }>, storage = jasmine.createSpyObj('storage', ['store', 'retrieve']), ...context: T[]): [Dialogue<T>, Storage] {
            storage.retrieve.and.callFake(() => state);
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
    });
    
    it("passes the supplied context to the script method", function(this: This) {
        const [dialogue] = this.build(context => {
            jasmine.expect(context).toBe('mycontext');
            return [ say `Hi!`]
        }, [], undefined, 'mycontext');
        dialogue.consume(this.postback)
    });

    it("throws an exception on empty script given", function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        try {
            this.build(() => [], [], storage);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Dialogue cannot be empty'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("throws an exception on script only containing labels", function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        try {
            this.build(() => [
                'start',
                'end'
            ], [], storage);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Dialogue cannot be empty'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("sends the first and only message in a single message dialogue", function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`
        ], []);
        jasmine.expect(dialogue.isComplete).toBe(false);
        jasmine.expect(dialogue.consume(this.postback)).toEqual(jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi!' })]));
        jasmine.expect(dialogue.isComplete).toBe(true);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
    });
        
    it("return no messages on consume when complete", function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`
        ], []);
        dialogue.consume(this.postback)
        jasmine.expect(dialogue.isComplete).toBe(true);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
        jasmine.expect(dialogue.consume(this.message('Hi'))).toEqual([]);
        jasmine.expect(storage.store).toHaveBeenCalledTimes(1);
    });
        
    it("sends muliple say or ask messages at once", function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`,
            ask `How are you?`,
        ], []);
        jasmine.expect(dialogue.consume(this.postback)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(dialogue.isComplete).toBe(true);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete' }]);
    });

    it("trims extranous whitespace", function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi   
            there!`
        ], []);
        jasmine.expect(dialogue.consume(this.postback)).toEqual(jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi \nthere!' })]));
    });

    it("throws an exception on script with duplicate expect statements", function(this: This) {
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

    it("throws an exception on expect statement not followed by a response handler", function(this: This) {
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

    it("throws an exception on a response handler not preceeded by an expect statement", function(this: This) {
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

    it("pauses on expect to wait for a response", function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `Don't say this`
        ], []);
        const result = dialogue.consume(this.postback);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'How are you?' })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
        jasmine.expect(dialogue.isComplete).toBe(false);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: 'I feel'}]);
    });

    it("resumes where it paused on recieving a response", function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                [onText](text: string): void {}
            },
        ], [{ type: 'expect', name: `I feel` }]);
        jasmine.expect(dialogue.isComplete).toBe(false);
        jasmine.expect(dialogue.consume(this.message('Amazing'))).toEqual([]);
        jasmine.expect(dialogue.isComplete).toBe(true);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'complete'}, { type: 'expect', name: 'I feel'}]);
    });
    
    it("attaches any quick replies defined in response handler to last message", function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            ask `How are you?`, 
            expect `I feel`, {
                'Great': () => {},
                'Crap': () => {}
            },
        ], []);
        jasmine.expect(dialogue.consume(this.postback)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?`, quick_replies:[
                jasmine.objectContaining({ title: 'Great' }), 
                jasmine.objectContaining({ title: 'Crap' })
            ]})
        ]));
    });

    it("attaches location quick reply if defined in response handler", function(this: This) {
        const [dialogue] = this.build(() => [
            ask `Where are you?`, 
            expect `I am here`, {
                [location]: () => {}
            },
        ], []);
        jasmine.expect(dialogue.consume(this.postback)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Where are you?`, quick_replies:[
                jasmine.objectContaining({ content_type: 'location' }), 
            ]})
        ]));
    });

    it("invokes a quick reply's handler on recieving the reply", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['Amazing'])
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, 
            handler
        ], [{ type: 'expect', name: `I feel` }]);
        dialogue.consume(this.message('Amazing'))
        jasmine.expect(handler.Amazing).toHaveBeenCalled();
    });

    it("supports empty handlers", function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `I don't care much`, 
        ], [{ type: 'expect', name: `I feel` }]);
        const result = dialogue.consume(this.message('Great'));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `I don't care much` })
        ]));
        jasmine.expect(dialogue.isComplete).toBe(true);
    });

    it("supports null handlers", function(this: This) {
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
        dialogue.consume(this.message('Amazing')) //I feel
        dialogue.consume(this.message('My tests are passing')) //I feel that way because
        dialogue.consume(this.location(50, 1, 'Work')) //I am at        
        dialogue.consume(this.location(51, 1, 'The moon')) //I want to go to
    });

    it("throws an error when both location and onLocation specified on a handler", function(this: This) {
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

    it("prefers a quick reply handler to the onText handler", function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                'Amazing': null,
                [onText]: () => fail('Should not be called')
            },
        ], [{ type: 'expect', name: `I feel` }]);
        dialogue.consume(this.message('Amazing'))
    });
    
    it("invokes the location handler on recieving a location quick reply", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['location'])
        const [dialogue] = this.build(() => [
            ask `Where are you?`,
            expect `I am here`, {
                [location]: (lat: number, long: number, title?: string, url?: string) => handler.location(lat, long, title, url)
            },
        ], [{ type: 'expect', name: `I am here` }]);
        dialogue.consume(this.location(50, 1, 'Mock', "localhost"))
        jasmine.expect(handler.location).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    it("invokes the onText handler on recieving a text response", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onText'])
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                [onText]: (text: string) => handler.onText(text)
            },
        ], [{ type: 'expect', name: `I feel` }]);
        dialogue.consume(this.message('Amazing'))
        jasmine.expect(handler.onText).toHaveBeenCalledWith('Amazing');
    });

    it("invokes the onLocation handler on recieving a location response", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onLocation'])
        const [dialogue] = this.build(() => [
            ask `Where are you?`,
            expect `I am here`, {
                [onLocation]: (lat: number, long: number, title?: string, url?: string) => handler.onLocation(lat, long, title, url)
            },
        ], [{ type: 'expect', name: `I am here` }]);
        dialogue.consume(this.location(50, 1, 'Mock', "localhost"))
        jasmine.expect(handler.onLocation).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    it("invokes the onImage handler on recieving an image response", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onImage'])
        const [dialogue] = this.build(() => [
            ask `What do you look like?`,
            expect `I look like`, {
                [onImage]: (url: string) => handler.onImage(url)
            },
        ], [{ type: 'expect', name: `I look like` }]);
        dialogue.consume(this.multimedia("image", "photo.jpg"));
        jasmine.expect(handler.onImage).toHaveBeenCalledWith("photo.jpg");
    });

    it("invokes the onVideo handler on recieving an video response", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onVideo'])
        const [dialogue] = this.build(() => [
            ask `What do you move like?`,
            expect `I move like`, {
                [onVideo]: (url: string) => handler.onVideo(url)
            },
        ], [{ type: 'expect', name: `I move like` }]);
        dialogue.consume(this.multimedia("video", "video.mpg"));
        jasmine.expect(handler.onVideo).toHaveBeenCalledWith("video.mpg");
    });

    it("invokes the onAudio handler on recieving an audio response", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onAudio'])
        const [dialogue] = this.build(() => [
            ask `What do you sound like?`,
            expect `I sound like`, {
                [onAudio]: (url: string) => handler.onAudio(url)
            },
        ], [{ type: 'expect', name: `I sound like` }]);
        dialogue.consume(this.multimedia("audio", "recording.wav"));
        jasmine.expect(handler.onAudio).toHaveBeenCalledWith("recording.wav");
    });

    it("invokes the onFile handler on recieving an file response", function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onFile'])
        const [dialogue] = this.build(() => [
            ask `What do you write like?`,
            expect `I write like`, {
                [onFile]: (url: string) => handler.onFile(url)
            },
        ], [{ type: 'expect', name: `I write like` }]);
        dialogue.consume(this.multimedia("file", "word.doc"));
        jasmine.expect(handler.onFile).toHaveBeenCalledWith("word.doc");
    });

    it("handles unexpected response types by repeating only the ask statements", function(this: This) {
        const [dialogue] = this.build(() => [
            ask `What do you write like?`,
            say `This won't be repeated`,
            ask `Send us a word document`,
            expect `I write like`, {
                [onFile]: (url: string) => null
            },
        ], [{ type: 'expect', name: `I write like` }]);
        const result = dialogue.consume(this.multimedia("audio", "recording.wav"));
        jasmine.expect(dialogue.isComplete).toBe(false);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Sorry, I didn't quite catch that, I was expecting a file` }),
            jasmine.objectContaining({ text: `What do you write like?` }),
            jasmine.objectContaining({ text: `Send us a word document` })
        ]));
    });

    it("does not send labels as messages", function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            'label',
            ask `How are you?`,
        ], []);
        const result = dialogue.consume(this.postback);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `label` })
        ]));
    });

    it("respects inline gotos", function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            goto `label`,
            say `Don't say this`,
            'label',
            ask `How are you?`,
        ], []);
        const result = dialogue.consume(this.postback);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
    });

    it("respects gotos retuned from response handlers", function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => goto `label`
            },
            say `Don't say this`,
            'label',
            say `Goodbye`,
        ], [{ type: 'expect', name: `I feel` }]);
        const result = dialogue.consume(this.message('Amazing'));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Goodbye' }), 
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
    });
    
    it("throws an exception on calling goto with a missing label", function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        try {
            const [dialogue] = this.build(() => [
                say `Hi!`,
                goto `label`,
                ask `How are you?`,
            ], [], storage);
            dialogue.consume(this.postback);
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Could not find label'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });

    it("throws an exception on script with duplicate labels", function(this: This) {
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

    it("aborts a goto that causes an endless loop", function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`,
            'label',
            ask `How are you?`,
            goto `label`,
        ], []);
        try {
            dialogue.consume(this.postback)
            fail('Did not throw')
        } catch(e) {
            jasmine.expect(e).toEqual(jasmine.stringMatching('Endless loop detected'));
            jasmine.expect(storage.store).not.toHaveBeenCalled();
        }
    });
    
    it("resumes from the correct line when a goto skips a response handler", function(this: This) {
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
        dialogue.consume(this.message('Amazing'))
        const result = dialogue.consume(this.location(50, 1));
        jasmine.expect(dialogue.isComplete).toBe(true);
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `But why?` })
        ]));
    });

    it("resets the dialogue when user sends a restart keyword", function(this: This) {
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
        const result = dialogue.consume(this.message('Start over'))
        jasmine.expect(dialogue.isComplete).toBe(false);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: 'I feel' }]);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("returns to previously asked question when user sends a undo keyword", function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Don't repeat this on undo`,
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': goto `end`
            },
            ask `Where are you?`, 
            expect `I am at`, {
                [location]: null
            },
            'end',
        ], [{ type: 'complete'}, { type: 'label', name: `end` }, { type: 'expect', name: `I feel that way because` }, { type: 'expect', name: `I feel` }]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = dialogue.consume(this.message('back'))
        jasmine.expect(dialogue.isComplete).toBe(false);
        jasmine.expect(storage.store).toHaveBeenCalledWith([{ type: 'expect', name: `I feel` }]);
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't repeat this on undo` })
        ]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("supports a user sending an undo or restart keyword at the start of a dialogue", function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
        ], []);
        dialogue.setKeywordHandler('start over', 'restart')
        dialogue.setKeywordHandler('back', 'undo')
        jasmine.expect(dialogue.consume(this.message('start over'))).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(dialogue.isComplete).toBe(false);
        jasmine.expect(dialogue.consume(this.message('back'))).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(dialogue.isComplete).toBe(false);
    });
});