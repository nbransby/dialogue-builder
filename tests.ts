
import { Dialogue, dialogue, Storage, Script, goto, say, ask, expect, onText, location, onLocation, onFile, onAudio, onImage, onVideo, image, audio, buttons, list, defaultAction, UnexpectedInputError, mock, onUndo } from './dialogue-builder'
import { fbTemplate } from 'claudia-bot-builder'

Object.defineProperty(global, 'jasmineRequire', {
    value: { interface: () => {} },
    configurable: true
});
import 'jasmine-promises'

describe("Dialogue", () => {
    
    interface This {
        build<T>(script: (context: T) => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string, inline?: boolean }>, storage?: Storage, context?: T): [Dialogue<T>, Storage]
    }

    beforeEach(function(this: This) {
        this.build = function<T>(script: () => Script, state: Array<{ type: 'label'|'expect'|'complete', name?: string }>, storage = jasmine.createSpyObj('storage', ['store', 'retrieve']), ...context: T[]): [Dialogue<T>, Storage] {
            storage.retrieve.and.callFake(() => Promise.resolve(JSON.stringify(state)));
            return [new Dialogue<T>(dialogue("Mock", script), storage, ...context), storage];            
        }        
    });
    
    it("passes the supplied context to the script method", async function(this: This) {
        const [dialogue] = this.build(context => {
            jasmine.expect(context).toBe('context');
            return [ say `Hi!`]
        }, [], undefined, 'context');
        await dialogue.consume(mock.postback(), mock.apiRequest)
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
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi!' })])
        );
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }]));
    });
        
    it("sends all messages with NO_PUSH notification type", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`
        ], []);
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            jasmine.arrayContaining([jasmine.objectContaining({ notification_type: 'NO_PUSH' })])
        );
    });
        
    it("throws empty array on consume when complete", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }]));
        await dialogue.consume(mock.message('Hi'), mock.apiRequest)
            .then(() => fail('Did not throw'))
            .catch(() => jasmine.expect(storage.store).toHaveBeenCalledTimes(1))
    });
        
    it("sends multiple messages at once with pauses and typing indicators in between", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Hi!`,
            ask `How are you?`,
        ], []);
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual([
            jasmine.objectContaining({ text: 'Hi!' }), 
            { sender_action: 'typing_on' }, 
            { claudiaPause: jasmine.anything() },
            jasmine.objectContaining({ text: `How are you?` }),
        ]);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }]));
    });

        
    it("ensure total pauses are less then 10 seconds when sending multiple messages at once", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            say `Lorem ipsum dolor sit amet, consectetur adipiscing elit`,
            say `sed do eiusmod tempor incididunt ut labore et dolore magna aliqua`,
            say `quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat`,
            say `Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur`,
            say `Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum`
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        jasmine.expect(result.filter(m => m.claudiaPause).reduce((t, m) => t + m.claudiaPause, 0)).toBeLessThan(10 * 1000);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }]));
    });


    it("trims extraneous whitespace in messages", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi   
            there!`
        ], []);
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            jasmine.arrayContaining([jasmine.objectContaining({ text: 'Hi \nthere!' })])
        );
    });

    it("supports bot builder template class instances inline", async function(this: This) {
        const [dialogue] = this.build(() => [
            new fbTemplate.List("compact").addBubble('Bubble 1').addBubble('Bubble 2')
        ], []);
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            jasmine.arrayContaining([
                jasmine.objectContaining({ attachment: 
                    jasmine.objectContaining({ payload: 
                        jasmine.objectContaining({ template_type: 'list' })})})])
        );
    });

    it("supports null lines", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            null,
            ask `How are you?`
        ], []);
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            jasmine.arrayContaining([
                jasmine.objectContaining({ text: 'Hi!' }),
                jasmine.objectContaining({ text: 'How are you?' })
            ])
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

    it("throws an exception on a response handler not preceded by an expect statement", async function(this: This) {
        const storage: Storage = jasmine.createSpyObj('storage', ['store', 'retrieve']);
        jasmine.expect(() => this.build(() => [
                say `Hi`, {
                    "Hi": null
                }
            ], [], storage)
        ).toThrow(jasmine.stringMatching('Response handler must be preceded by an expect statement'));
        jasmine.expect(storage.store).not.toHaveBeenCalled();
    });

    it("pauses on expect to wait for a response", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `Don't say this`
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'How are you?' })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: 'I feel'}]));
    });

    it("resumes where it paused on receiving a response", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                [onText](): void {}
            },
        ], [{ type: 'expect', name: `I feel` }]);
        jasmine.expect(await dialogue.consume(mock.message('Amazing'), mock.apiRequest)).toEqual([]);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete'}, { type: 'expect', name: 'I feel'}]));
    });

    it("reevaluates a script after executing a response handler", async function(this: This) {
        const context = { foo: 'bar' };
        const [dialogue] = this.build((context: { foo: string }) => [
            ask `How are you?`, 
            expect `I feel`, {
                [onText]: () => context.foo = 'baz'
            },
            say `${context.foo}`
        ], [{ type: 'expect', name: `I feel` }], undefined, context);
        jasmine.expect(await dialogue.consume(mock.message('Amazing'), mock.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'baz' }), 
        ]));
    });   

    it("reevaluates a script after executing a keyword handler", async function(this: This) {
        const context = { foo: 'bar' };
        const [dialogue] = this.build((context: { foo: string }) => [
            ask `How are you?`, 
            '!end',
            say `${context.foo}`
        ], [{ type: 'expect', name: `I feel` }], undefined, context);
        dialogue.setKeywordHandler('Amazing', () => {
            context.foo = 'baz'
            return goto `end`
        })
        jasmine.expect(await dialogue.consume(mock.message('Amazing'), mock.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'baz' }), 
        ]));
    });    
    
    it("reevaluates a script after executing a postback handler", async function(this: This) {
        const context = { foo: 'bar' };
        const button = buttons('some buttons', 'Some buttons', {
            'Amazing': () => {
                context.foo = 'baz'
                return goto `end`
            }
        })
        const [dialogue] = this.build((context: { foo: string }) => [
            button,
            '!end',
            say `${context.foo}`
        ], [{ type: 'complete' }], undefined, context);
        jasmine.expect(await dialogue.consume(mock.postback(button.postbacks![0][0]), mock.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'baz' }), 
        ]));
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
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(jasmine.arrayContaining([
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
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Where are you?`, quick_replies:[
                jasmine.objectContaining({ content_type: 'location' }), 
            ]})
        ]));
    });

    it("supports promises being returned from response handlers" , async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                [defaultAction]: () => Promise.resolve(goto `blocking_label`)
            },
            '!blocking_label',
            say `Promised was resolved`

        ], [{ type: 'expect', name: `I feel` }]);
        jasmine.expect(await dialogue.consume(mock.message('Blah'), mock.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Promised was resolved' })
        ]));        
    });
    
    it("invokes a quick reply's handler on receiving the reply", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['Amazing'])
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, 
            handler
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        jasmine.expect(handler.Amazing).toHaveBeenCalled();
    });

    it("invokes a button handler on receiving the postback", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['Go']);
        const button = buttons('some buttons', 'Some buttons', handler);
        const [dialogue] = this.build(() => [
            button
        ], []);
        await dialogue.consume(mock.postback(button.postbacks![0][0]), mock.apiRequest);
        jasmine.expect(handler.Go).toHaveBeenCalled();
    });

    it("invokes a list bubble's button handler on receiving the postback", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['Go']);
        const myList = list('my list', 'compact', [        
            { title: 'Title', subtitle: 'Subtitle', image: 'image.jpeg', buttons: {
                'Go': () => handler.Go()
            }},
            { title: 'Title', subtitle: 'Subtitle', image: 'image.jpeg'}
        ], handler);
        const [dialogue] = this.build(() => [
            myList
        ], []);
        await dialogue.consume(mock.postback(myList.postbacks![0][0]), mock.apiRequest);
        jasmine.expect(handler.Go).toHaveBeenCalled();
    });

    it("supports empty handlers", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {},
            say `I don't care much`, 
        ], [{ type: 'expect', name: `I feel` }]);
        const result = await dialogue.consume(mock.message('Great'), mock.apiRequest);
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
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest) //I feel
        await dialogue.consume(mock.message('My tests are passing'), mock.apiRequest) //I feel that way because
        await dialogue.consume(mock.location(50, 1, 'Work'), mock.apiRequest) //I am at        
        await dialogue.consume(mock.location(51, 1, 'The moon'), mock.apiRequest) //I want to go to
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
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
    });
    
    it("invokes the location handler on receiving a location quick reply", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['location'])
        const [dialogue] = this.build(() => [
            ask `Where are you?`,
            expect `I am here`, {
                [location]: (lat: number, long: number, title?: string, url?: string) => handler.location(lat, long, title, url)
            },
        ], [{ type: 'expect', name: `I am here` }]);
        await dialogue.consume(mock.location(50, 1, 'Mock', "localhost"), mock.apiRequest)
        jasmine.expect(handler.location).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    it("invokes the onText handler on receiving a text response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onText'])
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                [onText]: (text: string) => handler.onText(text)
            },
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        jasmine.expect(handler.onText).toHaveBeenCalledWith('Amazing');
    });

    it("invokes the onLocation handler on receiving a location response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onLocation'])
        const [dialogue] = this.build(() => [
            ask `Where are you?`,
            expect `I am here`, {
                [onLocation]: (lat: number, long: number, title?: string, url?: string) => handler.onLocation(lat, long, title, url)
            },
        ], [{ type: 'expect', name: `I am here` }]);
        await dialogue.consume(mock.location(50, 1, 'Mock', "localhost"), mock.apiRequest)
        jasmine.expect(handler.onLocation).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    it("invokes the onImage handler on receiving an image response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onImage'])
        const [dialogue] = this.build(() => [
            ask `What do you look like?`,
            expect `I look like`, {
                [onImage]: (url: string) => handler.onImage(url)
            },
        ], [{ type: 'expect', name: `I look like` }]);
        await dialogue.consume(mock.multimedia("image", "photo.jpg"), mock.apiRequest);
        jasmine.expect(handler.onImage).toHaveBeenCalledWith("photo.jpg");
    });

    it("invokes the onVideo handler on receiving an video response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onVideo'])
        const [dialogue] = this.build(() => [
            ask `What do you move like?`,
            expect `I move like`, {
                [onVideo]: (url: string) => handler.onVideo(url)
            },
        ], [{ type: 'expect', name: `I move like` }]);
        await dialogue.consume(mock.multimedia("video", "video.mpg"), mock.apiRequest);
        jasmine.expect(handler.onVideo).toHaveBeenCalledWith("video.mpg");
    });

    it("invokes the onAudio handler on receiving an audio response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onAudio'])
        const [dialogue] = this.build(() => [
            ask `What do you sound like?`,
            expect `I sound like`, {
                [onAudio]: (url: string) => handler.onAudio(url)
            },
        ], [{ type: 'expect', name: `I sound like` }]);
        await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        jasmine.expect(handler.onAudio).toHaveBeenCalledWith("recording.wav");
    });

    it("invokes the onFile handler on receiving an file response", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onFile'])
        const [dialogue] = this.build(() => [
            ask `What do you write like?`,
            expect `I write like`, {
                [onFile]: (url: string) => handler.onFile(url)
            },
        ], [{ type: 'expect', name: `I write like` }]);
        await dialogue.consume(mock.multimedia("file", "word.doc"), mock.apiRequest);
        jasmine.expect(handler.onFile).toHaveBeenCalledWith("word.doc");
    });

    it("invokes the defaultAction handler if no other more suitable handler defined" , async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['defaultAction'])
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                [defaultAction]: () => handler.defaultAction(),
                [onAudio]: () => null
            }
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(mock.message('Blah'), mock.apiRequest);
        jasmine.expect(handler.defaultAction).toHaveBeenCalled();      
    });

    it("prefers any suitable handler over the defaultAction handler", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`, 
            expect `I feel`, {
                [onText]: () => null,
                [defaultAction]: () => fail('Should not be called')
            },
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
    });
    
    it("handles unexpected response types by repeating only the ask statements", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `What do you sound like?`,
            expect `I sound like`, {
                [onAudio]: () => null
            },
            ask `What do you write like?`,
            say `This won't be repeated`,
            new fbTemplate.Text('Or this'),
            ask `Send us a word document`,
            expect `I write like`, {
                [onFile]: () => null
            },
            ask `How are you?`,
            expect `I feel`, {
                [onText]: () => null,
                [defaultAction]: () => fail('Should not be called')
            },            
        ], [{ type: 'expect', name: `I write like` }, { type: 'expect', name: `I sound like` }]);
        const result = await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: `I write like` }, { type: 'expect', name: `I sound like` }]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Sorry, I didn't quite catch that, I was expecting a file` }),
            jasmine.objectContaining({ text: `What do you write like?` }),
            jasmine.objectContaining({ text: `Send us a word document` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `This won't be repeated` }),
        ]));
    });

    it("supports the throwing of UnexpectedInputError from response handlers", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `What do you sound like?`,
            expect `I sound like`, {
                [onAudio]: () => { throw new UnexpectedInputError('Your voice is too high pitched'); }
            },
            ask `How are you?`
        ], [{ type: 'expect', name: `I sound like` }]);
        const result = await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: `I sound like` }]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Your voice is too high pitched` }),
            jasmine.objectContaining({ text: `What do you sound like?` }),
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` }),
        ]));
    });

    it("does not repeat the question when repeatQuestion arg to UnexpectedInputError constructor is false", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `What do you sound like?`,
            expect `I sound like`, {
                [onAudio]: () => { throw new UnexpectedInputError('Your voice is too high pitched', false); }
            }
        ], [{ type: 'expect', name: `I sound like` }]);
        const result = await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Your voice is too high pitched` }),
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `What do you sound like?` }),
        ]));
    });

    it("falls through a label not prefixed with an exclamation mark", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            'label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `label` })
        ]));
    });

    it("breaks on hitting a label prefixed with an exclamation mark", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Hi!`,
            '!label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
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
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Hi!' }), 
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
    });

    it("respects gotos executed on the dialogue instance", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Don't say this`,
            'label',
            ask `How are you?`,
        ], []);
        dialogue.execute(goto `label`);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
    });

    it("jumps to an expect executed on the dialogue instance", async function(this: This) {
        const handler = jasmine.createSpyObj('handler', ['Amazing']);
        const [dialogue] = this.build(() => [
            say `Don't say this`,
            expect `I feel`, 
            handler,
            say `Goodbye`
        ], []);
        dialogue.execute(expect `I feel`);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
        jasmine.expect(handler.Amazing).toHaveBeenCalled();
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Goodbye' }), 
        ]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't say this` })
        ]));
    });

    it("respects gotos returned from response handlers", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => goto `label`
            },
            say `Don't say this`,
            'label',
            say `Goodbye`
        ], [{ type: 'expect', name: `I feel` }]);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
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
        await dialogue.consume(mock.postback(), mock.apiRequest)
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
        await dialogue.consume(mock.postback(), mock.apiRequest)
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
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        jasmine.expect(storage.store).not.toHaveBeenCalledWith(jasmine.arrayContaining([{ type: 'complete' }]));
        const result = await dialogue.consume(mock.location(50, 1), mock.apiRequest);
        jasmine.expect(storage.store).toHaveBeenCalledWith((jasmine.stringMatching(JSON.stringify([{ type: 'complete' }]))));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `But why?` })
        ]));
    });

    it("resumes from the correct line when on unexpected input when a goto skips another goto", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            'start',
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => goto `label`
            },
            goto `start`,
            'label',
            ask `Where are you?`, 
            expect `I am at`, {
                [location]: null
            }
        ], [{ type: 'expect', name: `I am at`}, { type: 'label', name: `label`, inline: false }, { type: 'expect', name: `I feel` }]);
        const result = await dialogue.consume(mock.message('Wrong input'), mock.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: `I am at`}, { type: 'label', name: `label`, inline: false }, { type: 'expect', name: `I feel` }]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Where are you?` })
        ]));
    });

    it("supports expects returned from response handlers to delegate handling", async function(this: This) {
        const handler = jasmine.createSpyObj('response', ['onText'])
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => expect `I feel that way because`
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                [onText]: (text: string) => handler.onText(text)
            },
            say `Goodbye`            
        ], [{ type: 'expect', name: `I feel` }]);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
        jasmine.expect(handler.onText).toHaveBeenCalledWith('Amazing');    
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Goodbye' }), 
        ]));
    });

    it("aborts an expect returned from response handler that causes an endless loop", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => expect `I feel`
            },
        ], [{ type: 'expect', name: `I feel` }]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
            .then(() => fail('Did not throw'))
            .catch(e => {
                jasmine.expect(e).toEqual(jasmine.stringMatching('Endless loop detected'));
                jasmine.expect(storage.store).not.toHaveBeenCalled();
            });    
    });

    it("ignores return values from handlers if not gotos or expects", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': () => new Object()
            },
            say `Goodbye`
        ], [{ type: 'expect', name: `I feel` }]);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: 'Goodbye' }), 
        ]));
    });
    
    it("calls a keyword handler when message is received that matches insensitive of case", async function(this: This) {
        const [dialogue] = this.build(() => [
            say `Yo`,
        ], []);
        const handler = jasmine.createSpy('handler')
        dialogue.setKeywordHandler('word', handler)
        await dialogue.consume(mock.message('Word'), mock.apiRequest)
        jasmine.expect(handler).toHaveBeenCalled();
    });    

    it("calls a keyword handler matching a postback payload if no postback handler found", async function(this: This) {
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null
            },
        ], [{ type: 'expect', name: `I feel` }]);
        const handler = jasmine.createSpy('handler')
        dialogue.setKeywordHandler('postback_action', handler)
        await dialogue.consume(mock.postback('postback_action'), mock.apiRequest)
        jasmine.expect(handler).toHaveBeenCalled();
    });

    it("prefers a matching keyword handler over the current response handler", async function(this: This) {
        const responseHandler = jasmine.createSpyObj('storage', ['Amazing'])
        const [dialogue] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, 
            responseHandler
        ], [{ type: 'expect', name: `I feel` }]);
        const handler = jasmine.createSpy('handler')
        dialogue.setKeywordHandler('Amazing', handler)
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        jasmine.expect(responseHandler.Amazing).not.toHaveBeenCalled();
        jasmine.expect(handler).toHaveBeenCalled();
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
        const result = await dialogue.consume(mock.message('Start over'), mock.apiRequest)
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: 'I feel' }]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("returns to previously asked question when user sends a undo keyword", async function(this: This) {
        const undoHandler = jasmine.createSpy('onUndo')
        const [dialogue, storage] = this.build(() => [
            say `Don't repeat this on undo`,
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null,
                [onUndo]: () => undoHandler()
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
        ], [{ type: 'expect', name: `I feel that way because` }, { type: 'expect', name: `I feel` }]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(mock.message('back'), mock.apiRequest)
        jasmine.expect(undoHandler).toHaveBeenCalledTimes(1);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: `I feel` }]));
        jasmine.expect(result).not.toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `Don't repeat this on undo` })
        ]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("returns to last asked question when user sends a undo keyword when complete", async function(this: This) {
        const undoHandler = jasmine.createSpy('onUndo')
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': null,
                [onUndo]: () => undoHandler()
            },
        ], [{type: 'complete'}, { type: 'expect', name: `I feel that way because` }, { type: 'expect', name: `I feel` }]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(mock.message('back'), mock.apiRequest)
        jasmine.expect(undoHandler).toHaveBeenCalledTimes(1);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: `I feel that way because` }, { type: 'expect', name: `I feel` }]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `But why?` })
        ]));
    });

    it("accounts for skipped questions due to goto statements when user sends a undo keyword", async function(this: This) {
        const undoHandler = jasmine.createSpy('onUndo')
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': goto `why`,
                [onUndo]: () => undoHandler()
            },
            ask `Where are you?`, 
            expect `I am at`, {
                [location]: null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
            'why',
            ask `But why?`, 
            expect `I feel that way because`, {
                'Just cos': null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
        ], [{ type: 'expect', name: `I feel that way because` }, { type: 'label', name: `why` }, { type: 'expect', name: `I feel` }]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(mock.message('back'), mock.apiRequest)
        jasmine.expect(undoHandler).toHaveBeenCalledTimes(1);
        jasmine.expect(storage.store).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', name: `I feel` }]));
        jasmine.expect(result).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
    });

    it("supports a user sending an undo or restart keyword at the start of a dialogue", async function(this: This) {
        const [dialogue, storage] = this.build(() => [
            ask `How are you?`,
            expect `I feel`, {
                'Amazing': null,
                [onUndo]: () => fail('Undo handler called')
            },
        ], []);
        dialogue.setKeywordHandler('start over', 'restart')
        dialogue.setKeywordHandler('back', 'undo')
        jasmine.expect(await dialogue.consume(mock.message('start over'), mock.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ text: `How are you?` })
        ]));
        jasmine.expect(storage.store).not.toHaveBeenCalledWith(jasmine.arrayContaining([{ type: 'complete' }]));
        jasmine.expect(await dialogue.consume(mock.message('back'), mock.apiRequest)).toEqual(jasmine.arrayContaining([
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
        jasmine.expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(jasmine.arrayContaining([
            jasmine.objectContaining({ attachment: jasmine.objectContaining({ payload: { url: "http://localhost/image.jpg" }})}),
            jasmine.objectContaining({ attachment: jasmine.objectContaining({ payload: { url: "http://google.com/audio.wav" }})})
        ]));
    });
});