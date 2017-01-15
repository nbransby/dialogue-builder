# Dialogue Builder [![npm version][version-image]][package-url] [![Coverage Status][coverage-image]][coverage-url] [![Build status][ci-image]][ci-url]

[package-url]: https://www.npmjs.com/package/dialogue-builder
[version-image]: https://badge.fury.io/js/dialogue-builder.svg
[downloads-image]: https://img.shields.io/npm/dt/dialogue-builder.svg
[ci-image]: https://circleci.com/gh/nbransby/dialogue-builder.svg?style=shield&circle-token=39554b5870ebd54924230c17c9e79751ee788e40
[ci-url]: https://circleci.com/gh/nbransby/dialogue-builder
[coverage-image]:https://codecov.io/gh/nbransby/dialogue-builder/branch/master/graph/badge.svg
[coverage-url]:https://codecov.io/gh/nbransby/dialogue-builder

The goal of this library is to enable you to write a static bot dialogue in JavaScript or TypeScript. It utilises template literals to enable you to write dialogue in a highly readable way making it easier to review the dialogue at a glance, it currently has been designed to work with Facebook Messenger bots only.

```javascript
exports.default = dialogue('Onboarding ', (name) => [ 
    say `Hi ${name}, welcome to nosy bot!`, 
    say `This inquisitive little bot will ask a bunch of questions for no reason`, 
    say `It will log your answers pointlessly to the console`, 
    say `You can always type back if you make mistake`, 
    ask `How old are you?`,
    expect `My age is`, {
        [onText]: (text) => console.log(`${name}'s age is ${text}`)
    },
    
    ask `What length is your hair?`,
    expect `My hair length is`, {
        'Long': (text) => console.log(`${name}'s hair is ${text}`),
        'Short': (text) => console.log(`${name}'s hair is ${text}`),
        'Shaved': (text) => {
            console.log(`${name}'s hair is ${text}`);
            return goto `after_hair_colour`;
        },
    },
    
    ask `What colour is your hair?`,
    expect `My hair colour is`, {
        'Black': (text) => console.log(`${name}'s hair colour is ${text}`),
        'Brown': (text) => console.log(`${name}'s hair colour is ${text}`),
        'Blonde': (text) => console.log(`${name}'s hair colour is ${text}`),
    },
    
    'after_hair_colour',
    
    ask `Where do you live?`, 
    expect `I live at`, {
        [location]: (lat, long, title, url) => console.log(`User located at ${lat}, ${long}`)
    },
    
    say `Thanks ${name}, have a nice day`,
]);
```
## Installing

```shell
npm install dialogue-builder
```

## How it works

If the example dialogue above was defined in a file called `onboarding.js` you would write the following to get your bot to follow it:

````javascript
const botBuilder = require('claudia-bot-builder');
const { Dialogue } = require("dialogue-builder");

const onboarding = require('onboarding');

module.exports = botBuilder(function (message) {
    const dialogue = new Dialogue(onboarding, {
        store(state: Object) => console.log('Need to persist this somewhere')
        retrieve() => return new Object()
    }, 'Dave');
    dialogue.setKeywordHandler('back', 'undo');
    const messages = dialogue.consume(message);
    if(dialogue.isComplete) {
        //do something
    }
    return messages;
});
````

Dialogue builder is built on top of the excellent [bot-builder](https://github.com/claudiajs/claudia-bot-builder) by [claudia.js](https://claudiajs.com/) and the code above is the entry point for a bot builder project. 

Each invocation of the function above is caused by an incoming message from the user. The `consume` method called above would continue the dialogue where it left off, calling any responses handlers for the incoming message and returning the next set of outgoing messages to send. 

Except, in the example above, the bot would simply repeat the beginning of the dialogue each time the user sent a message because the storage handler (the `store` and `retrieve` methods) is not persisting the internal dialogue state (which is a JSON object). You would normally store this state under your user record in a persistence storage mechanism on your choosing. 

## API

The `dialogue-builder` module exports the following interface:
* [`dialogue` function](#dialogue-function)
* [`say`, `ask`, `expect`, `goto` template literal tag functions](#say-ask-expect-goto-tags-functions)
* [`location`, `onText`, `onLocation`, `onImage`, `onAudio`, `onVideo`, `onFile` symbols](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-symbols)
* [`UnexpectedInputError` class](#unexpectedinputerror-class)
* [`Dialogue` class](#dialogue-class)

### `dialogue` function
````typescript
dialogue(name: string, script: (...context: any) => Array<Label | Expect | Goto | Say | Ask | ResponseHandler>): DialogueBuilder`
````
This function is used to define your script, the first arg is the name of your dialogue (not shown to the user) and the second is your script function which should return an array (the lines of your script). This function is passed any custom args you passed to the [Dialogue contructor](#Dialogue-class).

### `say`, `ask`, `expect`, `goto` tags functions

The array passed to the dialogue function form the lines of your script, an element in this array has to be one of:
* `say` _string_: Your bot will simply repeat the string passed in 
* `ask` _string_: Identical to `say` except only `ask` statements are repeated on [undo](#undo) or an unhandled response
* `expect` _string_: This statement marks a break in the dialogue to wait for a user response. The _string_ you pass is the response you expect from the user, it's used as a key when persisting the state of the conversation and so *must* be a string unique amongst all expect statements. An expect statement must always be immediately followed by a [`ResponseHandler`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-symbols)
* `goto` _string_: A goto statement will cause the dialogue to jump to another location in the script. The string you pass in specifies the label to jump to. `goto` statements can also be returned from a [`ResponseHandler's`](#location-onText-onLocation-onImage-onAudio-onVideo-onFile-symbols) methods
* _string_: Any untagged strings in the array are treated as labels which serve as the destination of goto statements.

### `location`, `onText`, `onLocation`, `onImage`, `onAudio`, `onVideo`, `onFile` symbols

A `ResponseHandler` is an object who's methods are called on receiving a message from the user to handle the response to the immediately preceding `expect` statement. The supported methods are:
* _string_`: () => Goto | void`: A string property causes a quick reply to be attached to the last outgoing message, the function is called on the user selecting the reply
* `[location]: (lat: number, long: number, title?: string, url?: string) => Goto | void`: The `location` symbol property causes a location quick reply to be attached to the last outgoing message, the function is called on the user selecting the reply
* `[onText]: (text: string) => Goto | void`: The `onText` symbol property is called when the user types a text response that doesn't match any of the quick replies
* `[onLocation]: (lat: number, long: number, title?: string, url?: string) => Goto | void`: The `onLocation` symbol property is called when the user types a sends a location, you cannot define both `location` and `onLocation` properties on the same response handler
* `[onImage]: (url: string) => Goto | void`: The `onImage` symbol property is called when the user sends an image
* `[onAudio]: (url: string) => Goto | void`: The `onAudio` symbol property is called when the user sends an audio recording
* `[onVideo]: (url: string) => Goto | void`: The `onVideo` symbol property is called when the user sends a video
* `[onFile]: (url: string) => Goto | void`: The `onFile` symbol property is called when the user sends a file

Returning a [goto statement](#say-ask-expect-goto-tags-functions) from a `ResponseHandler` method will cause the dialogue to jump to the specified label

### `UnexpectedInputError` class

When a [`ResponseHandler`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-symbols) recieves a message from the user for which is does not contain a handler method for an instance of `UnexpectedInputError` is thrown, this will cause the question to be repeated. You can invoke this behaviour in a handled response by throwing this error from the handler method

### `Dialogue` class
````typescript
class Dialogue {
    constructor(builder: DialogueBuilder, storage: Storage, ...context: any);
    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)): void;
    readonly isComplete: boolean;
    consume(message: Message): string[];
}
````
The `Dialogue` class constructor has two required args, the first is the dialogue (the return value from the [`dialogue` function](#dialogue-function) and the second is the storage handler, you need to pass an object conforming to the following interface to store the dialogue state, typically under your user record in a persistence storage mechanism on your choosing:
````typescript
interface Storage {
    store(state: Object): void;
    retrieve(): Object;
}
````
Any additional args passed to the contructor are passed to the [`dialogue` function](#dialogue-function) this would typically be used to pass through the user's details to customise the dialogue plus any object needed in the [`ResponseHandlers`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-symbols) to act on user responses.

Call the `setKeywordHandler` method to create a keyword which will trigger the callback passed in whenever the user sends any of the keywords passed as the first arg, at any point in the conversation. The callback can return a [goto statement](#say-ask-expect-goto-tags-functions) to cause the dialogue to jump to the specified label. 

Two built-in keyword handlers exist which you can assigned keyword to by replacing the callback with either `undo` or `restart`

#### `undo`
The undo keyword handler will repeat the last question asked in the dialogue, allowing the user to correct a mistake
####  `restart`
The restart keyword handler will reset the dialogue to the beginning and is useful to enable during development

## Full Reference

* [it passes the supplied context to the script method](/tests.ts#L89)
* [it throws an exception on empty script given](/tests.ts#L97)
* [it throws an exception on script only containing labels](/tests.ts#L108)
* [it sends the first and only message in a single message dialogue](/tests.ts#L122)
* [it return no messages on consume when complete](/tests.ts#L132)
* [it sends muliple say or ask messages at once](/tests.ts#L143)
* [it trims extranous whitespace](/tests.ts#L156)
* [it throws an exception on script with duplicate expect statements](/tests.ts#L164)
* [it throws an exception on expect statement not followed by a response handler](/tests.ts#L180)
* [it throws an exception on a response handler not preceeded by an expect statement](/tests.ts#L202)
* [it pauses on expect to wait for a response](/tests.ts#L217)
* [it resumes where it paused on recieving a response](/tests.ts#L234)
* [it attaches any quick replies defined in response handler to last message](/tests.ts#L247)
* [it attaches location quick reply if defined in response handler](/tests.ts#L265)
* [it invokes a quick reply's handler on recieving the reply](/tests.ts#L279)
* [it supports empty handlers](/tests.ts#L290)
* [it supports null handlers](/tests.ts#L303)
* [it throws an error when both location and onLocation specified on a handler](/tests.ts#L328)
* [it prefers a quick reply handler to the onText handler](/tests.ts#L345)
* [it invokes the location handler on recieving a location quick reply](/tests.ts#L356)
* [it invokes the onText handler on recieving a text response](/tests.ts#L368)
* [it invokes the onLocation handler on recieving a location response](/tests.ts#L380)
* [it invokes the onImage handler on recieving an image response](/tests.ts#L392)
* [it invokes the onVideo handler on recieving an video response](/tests.ts#L404)
* [it invokes the onAudio handler on recieving an audio response](/tests.ts#L416)
* [it invokes the onFile handler on recieving an file response](/tests.ts#L428)
* [it handles unexpected response types by repeating only the ask statements](/tests.ts#L440)
* [it does not send labels as messages](/tests.ts#L458)
* [it respects inline gotos](/tests.ts#L474)
* [it respects gotos retuned from response handlers](/tests.ts#L492)
* [it throws an exception on calling goto with a missing label](/tests.ts#L511)
* [it throws an exception on script with duplicate labels](/tests.ts#L527)
* [it aborts a goto that causes an endless loop](/tests.ts#L543)
* [it resumes from the correct line when a goto skips a response handler](/tests.ts#L559)
* [it resets the dialogue when user sends a restart keyword](/tests.ts#L583)
* [it returns to previously asked question when user sends a undo keyword](/tests.ts#L603)
* [it supports a user sending an undo or restart keyword at the start of a dialogue](/tests.ts#L632)
