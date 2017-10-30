
import { Dialogue, Script, goto, rollback, say, ask, expect as expect_, onText, location, onLocation, onFile, onAudio, onImage, onVideo, image, audio, buttons, list, defaultAction, UnexpectedInputError, mock, onUndo } from './dialogue-builder'
import { fbTemplate } from 'claudia-bot-builder'


const build = function(
        script: (() => Script) | { [name: string]: () => Script }, 
        state: Array<{ type: 'label'|'expect'|'complete', path?: string, inline?: boolean }> 
    ): [Dialogue, { loadScript: jest.Mock<{}>, loadState: jest.Mock<{}>, saveState: jest.Mock<{}>}] {
    const delegate = { 
        saveState: jest.fn(), 
        loadState: jest.fn().mockReturnValueOnce(Promise.resolve(JSON.stringify(state))),
        loadScript: jest.fn().mockImplementation(name => script instanceof Function ? script() : script[name]())
    };
    return [new Dialogue(script instanceof Function ? 'mock' : Object.keys(script)[0], delegate), delegate];            
}

describe("Dialogue", () => {

    test("sends the first and only message in a single message dialogue", async () => {
        const [dialogue, delegate] = build(() => [
            say `Hi!`
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            expect.arrayContaining([expect.objectContaining({ text: 'Hi!' })])
        );
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }, { type: "label", path:"mock::", inline: false}]));
    });
        
    test("sends all messages with NO_PUSH notification type", async () => {
        const [dialogue] = build(() => [
            say `Hi!`
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            expect.arrayContaining([expect.objectContaining({ notification_type: 'NO_PUSH' })])
        );
    });
        
    test("returns empty array on consume when complete", async () => {
        const [dialogue, delegate] = build(() => [
            say `Hi!`
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest)
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }, { type: "label", path:"mock::", inline: false}]));
        await expect(dialogue.consume(mock.message('Hi'), mock.apiRequest)).resolves.toEqual([]);
        expect(delegate.saveState).toHaveBeenCalledTimes(1);
    });
        
    test("returns empty array on consume when previously hit a breaking label", async () => {
        const [dialogue, delegate] = build(() => [
            say `Hi!`,
            '!breaking_label',
            say `Bye!`
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest)
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }, { type: "label", path:"mock::", inline: false}]));
        await expect(dialogue.consume(mock.message('Hi'), mock.apiRequest)).resolves.toEqual([]);
        expect(delegate.saveState).toHaveBeenCalledTimes(1);
    });
        
    test("sends multiple messages at once with pauses and typing indicators in between", async () => {
        const [dialogue, delegate] = build(() => [
            say `Hi!`,
            ask `How are you?`,
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual([
            expect.objectContaining({ text: 'Hi!' }), 
            { sender_action: 'typing_on' }, 
            { claudiaPause: expect.anything() },
            expect.objectContaining({ text: `How are you?` }),
        ]);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }, { type: "label", path:"mock::", inline: false}]));
    });

        
    test("ensure total pauses are less then 10 seconds when sending multiple messages at once", async () => {
        const [dialogue, delegate] = build(() => [
            say `Lorem ipsum dolor sit amet, consectetur adipiscing elit`,
            say `sed do eiusmod tempor incididunt ut labore et dolore magna aliqua`,
            say `quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat`,
            say `Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur`,
            say `Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum`
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        expect(result.filter(m => m.claudiaPause).reduce((t, m) => t + m.claudiaPause, 0)).toBeLessThan(10 * 1000);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete' }, { type: "label", path:"mock::", inline: false}]));
    });


    test("trims extraneous whitespace in messages", async () => {
        const [dialogue] = build(() => [
            say `Hi   
            there!`
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            expect.arrayContaining([expect.objectContaining({ text: 'Hi \nthere!' })])
        );
    });

    test("supports bot builder template class instances inline", async () => {
        const [dialogue] = build(() => [
            new fbTemplate.List("compact").addBubble('Bubble 1').addBubble('Bubble 2')
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ attachment: 
                    expect.objectContaining({ payload: 
                        expect.objectContaining({ template_type: 'list' })})})])
        );
    });

    test("supports null lines", async () => {
        const [dialogue] = build(() => [
            say `Hi!`,
            null,
            ask `How are you?`
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ text: 'Hi!' }),
                expect.objectContaining({ text: 'How are you?' })
            ])
        );
    });
    
    test("throws an exception on script with duplicate expect statements", async () => {
        const [dialogue, delegate] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {},
            ask `How are you?`, 
            expect_ `I feel`, {},
        ], [])
        await expect(dialogue.consume(mock.postback(), mock.apiRequest)).rejects.toEqual(new Error('Duplicate expect statement (mock:4): expect `I feel`'));
        expect(delegate.saveState).not.toHaveBeenCalled();
    });

    test("throws an exception on script with duplicate template ids", async () => {
        const [dialogue, delegate] = build(() => [
            buttons('some buttons', 'Some buttons', {}),
            buttons('some buttons', 'Some more buttons', {}),
        ], [])
        await expect(dialogue.consume(mock.postback(), mock.apiRequest)).rejects.toEqual(new Error(`Duplicate identifier found (mock:1): buttons 'some buttons'`));
        expect(delegate.saveState).not.toHaveBeenCalled();
    });

    test("throws an exception on expect statement not followed by a response handler", async () => {
        const test = async (script: Script) => {
            const [dialogue, delegate] = build(() => script, [])
            await expect(dialogue.consume(mock.postback(), mock.apiRequest)).rejects.toEqual(new Error('Expect statement must be followed by a response handler (mock:1): expect `I feel`'));
            expect(delegate.saveState).not.toHaveBeenCalled();
        }
        //missing handler
        await test([
            expect_ `I feel`,
            say `Yo!`
        ]);
        //at end of script
        await test([
            expect_ `I feel`,
        ]);
    });

    test("throws an exception on a response handler not preceded by an expect statement", async () => {
        const [dialogue, delegate] = build(() => [
            say `Hi`, {
                "Hi": null
            }
        ], [])
        await expect(dialogue.consume(mock.postback(), mock.apiRequest)).rejects.toEqual(new Error('Response handler must be preceded by an expect statement (mock:1)'));
        expect(delegate.saveState).not.toHaveBeenCalled();
    });

    test("pauses on expect to wait for a response", async () => {
        const [dialogue, delegate] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {},
            say `Don't say this`
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'How are you?' })
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: 'mock::I feel'}, { type: "label", path:"mock::", inline: false}]));
    });

    test("resumes where it paused on receiving a response", async () => {
        const [dialogue, delegate] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                [onText](): void {}
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        expect(await dialogue.consume(mock.message('Amazing'), mock.apiRequest)).toEqual([]);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete'}, { type: 'expect', path: 'mock::I feel'}, { type: "label", path:"mock::", inline: false}]));
    });

    test("reevaluates a script after executing a response handler", async () => {
        const context = { foo: 'bar' };
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                [onText]: () => context.foo = 'baz'
            },
            say `${context.foo}`
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        expect(await dialogue.consume(mock.message('Amazing'), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'baz' }), 
        ]));
    });   

    test("reevaluates a script after executing a keyword handler", async () => {
        const context = { foo: 'bar' };
        const [dialogue] = build(() => [
            ask `How are you?`, 
            '!end',
            say `${context.foo}`
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        dialogue.setKeywordHandler('Amazing', () => {
            context.foo = 'baz'
            return goto `end`
        })
        expect(await dialogue.consume(mock.message('Amazing'), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'baz' }), 
        ]));
    });    
    
    test("reevaluates a script after executing a postback handler", async () => {
        const context = { foo: 'bar' };
        let button: fbTemplate.Button | undefined = undefined
        const [dialogue] = build(() => [
            button = buttons('some buttons', 'Some buttons', {
                'Amazing': () => {
                    context.foo = 'baz'
                    return goto `end`
                }
            }),
            '!end',
            say `${context.foo}`
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest);
        expect(await dialogue.consume(mock.postback(button!.postbacks![0][0]), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'baz' }), 
        ]));
    }); 
    
    test("attaches any quick replies defined in response handler to last message", async () => {
        const [dialogue] = build(() => [
            say `Hi!`,
            ask `How are you?`, 
            expect_ `I feel`, {
                'Great': () => {},
                'Crap': () => {}
            },
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Hi!' }), 
            expect.objectContaining({ text: `How are you?`, quick_replies:[
                expect.objectContaining({ title: 'Great' }), 
                expect.objectContaining({ title: 'Crap' })
            ]})
        ]));
    });

    test("attaches location quick reply if defined in response handler", async () => {
        const [dialogue] = build(() => [
            ask `Where are you?`, 
            expect_ `I am here`, {
                [location]: () => {}
            },
        ], []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Where are you?`, quick_replies:[
                expect.objectContaining({ content_type: 'location' }), 
            ]})
        ]));
    });

    test("supports promises being returned from response handlers", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                [defaultAction]: () => Promise.resolve(goto `blocking_label`)
            },
            '!blocking_label',
            say `Promised was resolved`

        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        expect(await dialogue.consume(mock.message('Blah'), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Promised was resolved' })
        ]));        
    });
    
    test("invokes a quick reply's handler on receiving the reply", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                'Amazing': handler
            }
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        expect(handler).toHaveBeenCalled();
    });

    test("invokes a button handler on receiving the postback", async () => {
        const handler = jest.fn();
        let button: fbTemplate.Button | undefined = undefined;
        const [dialogue] = build(() => [
            button = buttons('some buttons', 'Some buttons', {
                'Go': handler
            })
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest);
        await dialogue.consume(mock.postback(button!.postbacks![0][0]), mock.apiRequest).catch(
            () => expect(handler).toHaveBeenCalled()
        );
    });

    test("invokes a list bubble's button handler on receiving the postback", async () => {
        const handler = jest.fn();
        let myList: fbTemplate.List | undefined = undefined; 
        const [dialogue] = build(() => [
            myList = list('my list', 'compact', [        
                { title: 'Title', subtitle: 'Subtitle', image: 'image.jpeg', buttons: {
                    'Go': handler
                }},
                { title: 'Title', subtitle: 'Subtitle', image: 'image.jpeg'}
            ], {
                'Go': handler
            })        
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest);
        await dialogue.consume(mock.postback(myList!.postbacks![0][0]), mock.apiRequest).catch(
            () => expect(handler).toHaveBeenCalled()
        );
    });

    test("supports empty handlers", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {},
            say `I don't care much`, 
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.message('Great'), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `I don't care much` })
        ]));
    });

    test("supports null handlers", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                'Amazing': null,
            },
            ask `But why?`, 
            expect_ `I feel that way because`, {
                [onText]: null
            },
            ask `Where are you?`, 
            expect_ `I am at`, {
                [location]: null
            },
            ask `Where do you want to go to?`, 
            expect_ `I want to go to`, {
                [onLocation]: null
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest) //I feel
        await dialogue.consume(mock.message('My tests are passing'), mock.apiRequest) //I feel that way because
        await dialogue.consume(mock.location(50, 1, 'Work'), mock.apiRequest) //I am at        
        await dialogue.consume(mock.location(51, 1, 'The moon'), mock.apiRequest) //I want to go to
    });

    test("throws an error when both location and onLocation specified on a handler", async () => {
        const [dialogue, delegate] = build(() => [
                ask `Where are you?`, 
                expect_ `I am here`, {
                    [location]: null,
                    [onLocation]: null
                },
            ], [{ type: 'expect', path: `mock::I am here` }, { type: "label", path:"mock::", inline: false}]);
        await expect(dialogue.consume(mock.postback(), mock.apiRequest)).rejects.toEqual(new Error('Both location and onLocation implemented in the same response handler (mock:2): expect `I am here`'));
        expect(delegate.saveState).not.toHaveBeenCalled();
    });

    test("prefers a quick reply handler to the onText handler", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                'Amazing': null,
                [onText]: () => fail('Should not be called')
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
    });
    
    test("invokes the location handler on receiving a location quick reply", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `Where are you?`,
            expect_ `I am here`, {
                [location]: handler
            },
        ], [{ type: 'expect', path: `mock::I am here` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.location(50, 1, 'Mock', "localhost"), mock.apiRequest)
        expect(handler).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    test("invokes the onText handler on receiving a text response", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                [onText]: handler
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        expect(handler).toHaveBeenCalledWith('Amazing');
    });

    test("invokes the onLocation handler on receiving a location response", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `Where are you?`,
            expect_ `I am here`, {
                [onLocation]: handler
            },
        ], [{ type: 'expect', path: `mock::I am here` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.location(50, 1, 'Mock', "localhost"), mock.apiRequest)
        expect(handler).toHaveBeenCalledWith(50, 1, 'Mock', "localhost");
    });

    test("invokes the onImage handler on receiving an image response", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `What do you look like?`,
            expect_ `I look like`, {
                [onImage]: handler
            },
        ], [{ type: 'expect', path: `mock::I look like` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.multimedia("image", "photo.jpg"), mock.apiRequest);
        expect(handler).toHaveBeenCalledWith("photo.jpg");
    });

    test("invokes the onVideo handler on receiving an video response", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `What do you move like?`,
            expect_ `I move like`, {
                [onVideo]: handler
            },
        ], [{ type: 'expect', path: `mock::I move like` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.multimedia("video", "video.mpg"), mock.apiRequest);
        expect(handler).toHaveBeenCalledWith("video.mpg");
    });

    test("invokes the onAudio handler on receiving an audio response", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `What do you sound like?`,
            expect_ `I sound like`, {
                [onAudio]: handler
            },
        ], [{ type: 'expect', path: `mock::I sound like` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        expect(handler).toHaveBeenCalledWith("recording.wav");
    });

    test("invokes the onFile handler on receiving an file response", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `What do you write like?`,
            expect_ `I write like`, {
                [onFile]: handler
            },
        ], [{ type: 'expect', path: `mock::I write like` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.multimedia("file", "word.doc"), mock.apiRequest);
        expect(handler).toHaveBeenCalledWith("word.doc");
    });

    test("invokes the defaultAction handler if no other more suitable handler defined", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                [defaultAction]: handler,
                [onAudio]: () => null
            }
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Blah'), mock.apiRequest);
        expect(handler).toHaveBeenCalled();      
    });

    test("prefers any suitable handler over the defaultAction handler", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`, 
            expect_ `I feel`, {
                [onText]: () => null,
                [defaultAction]: () => fail('Should not be called')
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
    });
    
    test("handles unexpected response types by repeating only the ask statements", async () => {
        const [dialogue, delegate] = build(() => [
            ask `What do you sound like?`,
            expect_ `I sound like`, {
                [onAudio]: () => null
            },
            ask `What do you write like?`,
            say `This won't be repeated`,
            new fbTemplate.Text('Or this'),
            ask `Send us a word document`,
            expect_ `I write like`, {
                [onFile]: () => null
            },
            ask `How are you?`,
            expect_ `I feel`, {
                [onText]: () => null,
                [defaultAction]: () => fail('Should not be called')
            },            
        ], [{ type: 'expect', path: `mock::I write like` }, { type: 'expect', path: `mock::I sound like` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: `mock::I write like` }, { type: 'expect', path: `mock::I sound like` }, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Sorry, I didn't quite catch that, I was expecting a file` }),
            expect.objectContaining({ text: `What do you write like?` }),
            expect.objectContaining({ text: `Send us a word document` })
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `This won't be repeated` }),
        ]));
    });

    test("supports the throwing of UnexpectedInputError from response handlers", async () => {
        const [dialogue, delegate] = build(() => [
            ask `What do you sound like?`,
            expect_ `I sound like`, {
                [onAudio]: () => { throw new UnexpectedInputError('Your voice is too high pitched'); }
            },
            ask `How are you?`
        ], [{ type: 'expect', path: `mock::I sound like` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: `mock::I sound like` }, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Your voice is too high pitched` }),
            expect.objectContaining({ text: `What do you sound like?` }),
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` }),
        ]));
    });

    test("does not repeat the question when repeatQuestion arg to UnexpectedInputError constructor is false", async () => {
        const [dialogue] = build(() => [
            ask `What do you sound like?`,
            expect_ `I sound like`, {
                [onAudio]: () => { throw new UnexpectedInputError('Your voice is too high pitched', false); }
            }
        ], [{ type: 'expect', path: `mock::I sound like` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.multimedia("audio", "recording.wav"), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Your voice is too high pitched` }),
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `What do you sound like?` }),
        ]));
    });

    test("falls through a label not prefixed with an exclamation mark", async () => {
        const [dialogue] = build(() => [
            say `Hi!`,
            'label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Hi!' }), 
            expect.objectContaining({ text: `How are you?` })
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `label` })
        ]));
    });

    test("breaks on hitting a label prefixed with an exclamation mark", async () => {
        const [dialogue] = build(() => [
            say `Hi!`,
            '!label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Hi!' }), 
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `!label` })
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `label` })
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` })
        ]));
    });

    test("respects inline gotos", async () => {
        const [dialogue] = build(() => [
            say `Hi!`,
            goto `label`,
            say `Don't say this`,
            'label',
            ask `How are you?`,
        ], []);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Hi!' }), 
            expect.objectContaining({ text: `How are you?` })
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
    });

    test("respects rollback to start of script", async () => {
        let button: fbTemplate.Button | undefined;
        const [dialogue, delegate] = build(() => [
            say `Hi!`,
            '!subroutine',
            say `Running subroutine`,
            rollback `subroutine`,
            say `Don't say this`,
            button = buttons('some buttons', 'Some buttons', { 'Run': () => goto `subroutine` }),
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest);
        const result = await dialogue.consume(mock.postback(button!.postbacks![0][0]), mock.apiRequest);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete'}, { type: 'label', path: 'mock::', inline: false }, { type: 'label', path: 'mock::subroutine', inline: false }, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Running subroutine' }), 
            expect.objectContaining({ text: 'Hi!' }), 
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
    });

    test("respects rollback to previous label", async () => {
        let button: fbTemplate.Button | undefined;
        const [dialogue, delegate] = build(() => [
            say `Don't say this`,
            '!subroutine',
            say `Running subroutine`,
            rollback `subroutine`,
            button = buttons('some buttons', 'Some buttons', { 'Run': () => goto `subroutine` }),
            'previous_label',
            say `Hi!`,
        ], [{ type: 'label', path: 'mock::previous_label'}, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.postback(), mock.apiRequest);
        const result = await dialogue.consume(mock.postback(button!.postbacks![0][0]), mock.apiRequest);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete'}, { type: "label", path: "mock::previous_label" }, { type: "label", path: 'mock::subroutine', inline: false}, { type: 'label', path: 'mock::previous_label'}, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Running subroutine' }), 
            expect.objectContaining({ text: 'Hi!' }), 
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
    });

    test("respects rollback to previous expect", async () => {
        let button: fbTemplate.Button | undefined;
        const [dialogue, delegate] = build(() => [
            say `Don't say this`,
            '!subroutine',
            say `Running subroutine`,
            rollback `subroutine`,
            button = buttons('some buttons', 'Some buttons', { 'Run': () => goto `subroutine` }),
            say `How do you feel?`,
            expect_ `I feel`, {
                'Amazing': () => goto `label`
            },
            say `Goodbye!`,
        ], [{ type: 'expect', path: 'mock::I feel'}, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.postback(), mock.apiRequest);
        const result = await dialogue.consume(mock.postback(button!.postbacks![0][0]), mock.apiRequest);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'complete'}, { type: "expect", path: "mock::I feel" },{ type: "label", path: "mock::subroutine", inline: false }, { type: 'expect', path: 'mock::I feel'}, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Running subroutine' }), 
            expect.objectContaining({ text: 'Goodbye!' }), 
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
    });
    
    test("respects gotos executed on the dialogue instance", async () => {
        const [dialogue] = build(() => [
            say `Don't say this`,
            'label',
            ask `How are you?`,
        ], []);
        dialogue.execute(goto `label`);
        const result = await dialogue.consume(mock.postback(), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` })
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
    });

    test("jumps to an expect executed on the dialogue instance", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            say `Don't sa   y this`,
            expect_ `I feel`, {
                'Amazing': handler
            },
            say `Goodbye`
        ], []);
        dialogue.execute(expect_ `I feel`);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
        expect(handler).toHaveBeenCalled();
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Goodbye' }), 
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
    });

    test("respects gotos returned from response handlers", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': () => goto `label`
            },
            say `Don't say this`,
            'label',
            say `Goodbye`
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Goodbye' }), 
        ]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't say this` })
        ]));
    });
    
    test("throws an exception on calling goto with a missing label", async () => {
        const [dialogue, delegate] = build(() => [
            say `Hi!`,
            goto `label`,
            ask `How are you?`,
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest)
            .then(() => fail('Did not throw'))
            .catch((e) => {
                expect(e).toEqual(expect.stringMatching('Could not find label'));
                expect(delegate.saveState).not.toHaveBeenCalled();
            });
    });

    test("throws an exception on script with duplicate labels", async () => {
        const [dialogue, delegate] = build(() => [
                'label',
                say `Hi!`,
                'label',
                ask `How are you?`,
            ], []);
        await expect(dialogue.consume(mock.postback(), mock.apiRequest)).rejects.toEqual(new Error(`Duplicate label found (mock:2): 'label'`));
        expect(delegate.saveState).not.toHaveBeenCalled();
    });

    test("aborts a goto that causes an endless loop", async () => {
        const [dialogue, delegate] = build(() => [
            'label',
            ask `How are you?`,
            goto `label`,
        ], []);
        await dialogue.consume(mock.postback(), mock.apiRequest)
            .then(() => fail('Did not throw'))
            .catch(e => {
                expect(e).toEqual(expect.stringMatching('Endless loop detected'));
                expect(delegate.saveState).not.toHaveBeenCalled();
            });
    });
    
    test("resumes from the correct line when a goto skips a response handler", async () => {
        const [dialogue, delegate] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': () => goto `label`
            },
            ask `But why?`, 
            expect_ `I feel that way because`, {
                [onText]: null
            },
            'label',
            ask `Where are you?`, 
            expect_ `I am at`, {
                [location]: null
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        expect(delegate.saveState).not.toHaveBeenCalledWith(expect.arrayContaining([{ type: 'complete' }]));
        const result = await dialogue.consume(mock.location(50, 1), mock.apiRequest);
        expect(delegate.saveState).toHaveBeenCalledWith((expect.stringMatching(JSON.stringify([{ type: 'complete' }, { type: "label", path:"mock::", inline: false}]))));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `But why?` })
        ]));
    });

    test("resumes from the correct line when on unexpected input when a goto skips another goto", async () => {
        const [dialogue, delegate] = build(() => [
            'start',
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': () => goto `label`
            },
            goto `start`,
            'label',
            ask `Where are you?`, 
            expect_ `I am at`, {
                [location]: null
            }
        ], [{ type: 'expect', path: `mock::I am at`}, { type: 'label', path: `mock::label`, inline: false }, { type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.message('Wrong input'), mock.apiRequest)
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: `mock::I am at`}, { type: 'label', path: `mock::label`, inline: false }, { type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Where are you?` })
        ]));
    });

    test("supports expects returned from response handlers to delegate handling", async () => {
        const handler = jest.fn();
        const [dialogue] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': () => expect_ `I feel that way because`
            },
            ask `But why?`, 
            expect_ `I feel that way because`, {
                [onText]: handler
            },
            say `Goodbye`            
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
        expect(handler).toHaveBeenCalledWith('Amazing');    
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'But why?' }), 
        ]));
    });

    test("aborts an expect returned from response handler that causes an endless loop", async () => {
        const [dialogue, delegate] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': () => expect_ `I feel`
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
            .then(() => fail('Did not throw'))
            .catch(e => {
                expect(e).toEqual(expect.stringMatching('Endless loop detected'));
                expect(delegate.saveState).not.toHaveBeenCalled();
            });    
    });

    test("ignores return values from handlers if not gotos or expects", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': () => new Object()
            },
            say `Goodbye`
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        const result = await dialogue.consume(mock.message('Amazing'), mock.apiRequest);
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: 'Goodbye' }), 
        ]));
    });
    
    test("calls a keyword handler when message is received that matches insensitive of case", async () => {
        const [dialogue] = build(() => [
            say `Yo`,
        ], []);
        const handler = jest.fn();
        dialogue.setKeywordHandler('word', handler)
        await dialogue.consume(mock.message('Word'), mock.apiRequest)
        expect(handler).toHaveBeenCalled();
    });    

    test("calls a keyword handler matching a postback payload if no postback handler found", async () => {
        const [dialogue] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': null
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        const handler = jest.fn();
        dialogue.setKeywordHandler('postback_action', handler)
        await dialogue.consume(mock.postback('postback_action'), mock.apiRequest)
        expect(handler).toHaveBeenCalled();
    });

    test("prefers a matching keyword handler over the current response handler", async () => {
        const responseHandler = jest.fn();
        const [dialogue] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': responseHandler
            }
        ], [{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        const handler = jest.fn();
        dialogue.setKeywordHandler('Amazing', handler)
        await dialogue.consume(mock.message('Amazing'), mock.apiRequest)
        expect(responseHandler).not.toHaveBeenCalled();
        expect(handler).toHaveBeenCalled();
    });

    test("resets the dialogue when user sends a restart keyword", async () => {
        const [dialogue, delegate] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': null
            },
            ask `But why?`, 
            expect_ `I feel that way because`, {
                'Just cos': null
            },
        ], [{ type: 'expect', path: `mock::I feel` }, { type: 'expect', path: `mock::I feel that way because` }, { type: "label", path:"mock::", inline: false}]);
        dialogue.setKeywordHandler('start over', 'restart')
        const result = await dialogue.consume(mock.message('Start over'), mock.apiRequest)
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: 'mock::I feel' }, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` })
        ]));
    });

    test("returns to previously asked question when user sends a undo keyword", async () => {
        const undoHandler = jest.fn()
        const [dialogue, delegate] = build(() => [
            say `Don't repeat this on undo`,
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': null,
                [onUndo]: () => undoHandler()
            },
            ask `But why?`, 
            expect_ `I feel that way because`, {
                'Just cos': null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
        ], [{ type: 'expect', path: `mock::I feel that way because` }, { type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(mock.message('back'), mock.apiRequest)
        expect(undoHandler).toHaveBeenCalledTimes(1);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]));
        expect(result).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `Don't repeat this on undo` })
        ]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` })
        ]));
    });

    test("returns to last asked question when user sends a undo keyword when complete", async () => {
        const undoHandler = jest.fn()
        const [dialogue, delegate] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
            ask `But why?`, 
            expect_ `I feel that way because`, {
                'Just cos': null,
                [onUndo]: () => undoHandler()
            },
        ], [{type: 'complete'}, { type: 'expect', path: `mock::I feel that way because` }, { type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(mock.message('back'), mock.apiRequest)
        expect(undoHandler).toHaveBeenCalledTimes(1);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: `mock::I feel that way because` }, { type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `But why?` })
        ]));
    });

    test("accounts for skipped questions due to goto statements when user sends a undo keyword", async () => {
        const undoHandler = jest.fn()
        const [dialogue, delegate] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': goto `why`,
                [onUndo]: () => undoHandler()
            },
            ask `Where are you?`, 
            expect_ `I am at`, {
                [location]: null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
            'why',
            ask `But why?`, 
            expect_ `I feel that way because`, {
                'Just cos': null,
                [onUndo]: () => fail('Wrong undo handler called')
            },
        ], [{ type: 'expect', path: `mock::I feel that way because` }, { type: 'label', path: `mock::why` }, { type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]);
        dialogue.setKeywordHandler('back', 'undo')
        const result = await dialogue.consume(mock.message('back'), mock.apiRequest)
        expect(undoHandler).toHaveBeenCalledTimes(1);
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([{ type: 'expect', path: `mock::I feel` }, { type: "label", path:"mock::", inline: false}]));
        expect(result).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` })
        ]));
    });

    test("supports a user sending an undo or restart keyword at the start of a dialogue", async () => {
        const [dialogue, delegate] = build(() => [
            ask `How are you?`,
            expect_ `I feel`, {
                'Amazing': null,
                [onUndo]: () => fail('Undo handler called')
            },
        ], []);
        dialogue.setKeywordHandler('start over', 'restart')
        dialogue.setKeywordHandler('back', 'undo')
        expect(await dialogue.consume(mock.message('start over'), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` })
        ]));
        expect(delegate.saveState).not.toHaveBeenCalledWith(expect.arrayContaining([{ type: 'complete' }]));
        expect(await dialogue.consume(mock.message('back'), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ text: `How are you?` })
        ]));
        expect(delegate.saveState).not.toHaveBeenCalledWith(expect.arrayContaining([{ type: 'complete' }]));
    });

    test("prefixes uris with the baseUrl but leaves full urls as is", async () => {
        const [dialogue] = build(() => [
            image `/image.jpg`,
            audio `http://google.com/audio.wav`
        ], []);
        dialogue.baseUrl = "http://localhost";
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(expect.arrayContaining([
            expect.objectContaining({ attachment: expect.objectContaining({ payload: { url: "http://localhost/image.jpg" }})}),
            expect.objectContaining({ attachment: expect.objectContaining({ payload: { url: "http://google.com/audio.wav" }})})
        ]));
    });

    test("goto a label works across scripts", async () => {
        const [dialogue, delegate] = build({ 
            first: () => [
                goto `second::hi`
            ],
            second: () => [
                'hi',
                say `Hi!`
            ]
        }, []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            expect.arrayContaining([expect.objectContaining({ text: 'Hi!' })])
        );
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([
            { type: 'complete' },
            { type: "label", path: "second::hi", inline: true },
            { type: "label", path:"first::", inline: false}
        ]));
    });
    
    test("goto supports going to the beginning of a script with script::", async () => {
        const [dialogue, delegate] = build({ 
            first: () => [
                goto `second::`
            ],
            second: () => [
                say `Hi!`
            ]
        }, []);
        expect(await dialogue.consume(mock.postback(), mock.apiRequest)).toEqual(
            expect.arrayContaining([expect.objectContaining({ text: 'Hi!' })])
        );
        expect(delegate.saveState).toHaveBeenCalledWith(JSON.stringify([
            { type: 'complete' },
            { type: "label", path: "second::", inline: true },
            { type: "label", path:"first::", inline: false}            
        ]));
    });
    
});