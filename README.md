# Dialogue Builder [![npm version][version-image]][package-url] [![Build status][ci-image]][ci-url] [![Coverage Status][coverage-image]][coverage-url] [![npm](https://img.shields.io/npm/l/dialogue-builder.svg)](/LICENSE)

[package-url]: https://www.npmjs.com/package/dialogue-builder
[version-image]: https://badge.fury.io/js/dialogue-builder.svg
[downloads-image]: https://img.shields.io/npm/dt/dialogue-builder.svg
[ci-image]: https://circleci.com/gh/nbransby/dialogue-builder.svg?style=shield&circle-token=39554b5870ebd54924230c17c9e79751ee788e40
[ci-url]: https://circleci.com/gh/nbransby/dialogue-builder
[coverage-image]:https://codecov.io/gh/nbransby/dialogue-builder/branch/master/graph/badge.svg
[coverage-url]:https://codecov.io/gh/nbransby/dialogue-builder

The goal of this library is to enable you to write bot dialogue in JavaScript or TypeScript. It utilizes template literals to enable you to write dialogue in a highly readable way, making it easier to review the dialogue at a glance, it currently has been designed to work with Facebook Messenger bots only. See [dialogue-builder-example](https://github.com/nbransby/dialogue-builder-example) for a working example.

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

module.exports = botBuilder(function (message, apiRequest) {
    const dialogue = new Dialogue(onboarding, {
        store(state: Object) => console.log('Need to persist this somewhere')
        retrieve() => return Promise.resolve(new Object())
    }, 'Dave');
    dialogue.setKeywordHandler('back', 'undo');
    return dialogue.consume(message, apiRequest);
});
````

Dialogue builder is built on top of the excellent [bot-builder](https://github.com/claudiajs/claudia-bot-builder) by [claudia.js](https://claudiajs.com/) and the code above is the entry point for a bot builder project. 

Each invocation of the function above is caused by an incoming message from the user. The `consume` method called above would continue the dialogue where it left off, calling any [responses handlers](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols) for the incoming message and returning the next set of outgoing messages. 

Except, in the example above, the bot would simply repeat the beginning of the dialogue each time the user sent a message because the storage handler (the `store` and `retrieve` methods) is not persisting the internal dialogue state (which is a JSON object). You would normally store this state under your user record in the persistence storage mechanism on your choosing. See [dialogue-builder-example](https://github.com/nbransby/dialogue-builder-example) for an example on how to implement this using DynamoDB.

## API

The `dialogue-builder` module exports the following interface:
* [`dialogue` function](#dialogue-function)
* [`say`, `ask`, `audio`, `video`, `image`, `file`, `expect`, `goto` template literal tag functions](#say-ask-audio-video-image-file-expect-goto-template-literal-tag-functions)
* [`buttons`, `list` functions](#buttons-list-functions)
* [`onText`, `location`, `onLocation`, `onImage`, `onAudio`, `onVideo`, `onFile`, `defaultAction` symbols](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols)
* [`UnexpectedInputError` class](#unexpectedinputerror-class)
* [`Dialogue` class](#dialogue-class)
* [`mock` namespace](#mock-namespace)

### `dialogue` function
````typescript
dialogue(name: string, script: (...context: any) => Array<BaseTemplate | Label | Expect | Goto | ResponseHandler>): DialogueBuilder`
````
This function is used to define your script, the first arg is the name of your dialogue (not shown to the user) and the second is your script function which should return an array (the lines of your script). This function is passed any custom args you passed to the [Dialogue constructor](#dialogue-class).

### `say`, `ask`, `audio`, `video`, `image`, `file`, `expect`, `goto` template literal tag functions

The array passed to the dialogue function form the lines of your script, an element in this array has to be one of:
* `say` _string_: Your bot will simply repeat the string passed in 
* `ask` _string_: Identical to `say` except only `ask` statements are repeated on [undo](#undo) or an unhandled response
* `audio` _string_: Send an audio file, the string passed in should be a url
* `video` _string_: Send a video file, the string passed in should be a url
* `image` _string_: Send an image file, the string passed in should be a url
* `file` _string_: Send a file, the string passed in should be a url
* `expect` _string_: This statement marks a break in the dialogue to wait for a user response. The _string_ you pass is the response you expect from the user, it's used as a key when persisting the state of the conversation and so *must* be a string unique amongst all expect statements. An expect statement must always be immediately followed by a [`ResponseHandler`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols)
* `goto` _string_: A goto statement will cause the dialogue to jump to another location in the script. The string you pass in specifies the label to jump to. `goto` statements can also be returned from a [`ResponseHandler's`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols) methods
* _string_: Any untagged strings in the array are treated as labels which serve as the destination of goto statements. When gathering the next set of outgoing messages, the dialogue will fall through labels by default. You can override this behavior by prefixing your label with an exclamation mark (!) - this causes the dialogue to break at the label. Once dialogue has stopped at a label only a goto statement will restart it (use this feature when you want to wait for a postback)
* `fbTemplate.BaseTemplate`: You can embed any facebook message type supported by bot builder directly in your script, see [Facebook Template Builder](https://github.com/claudiajs/claudia-bot-builder/blob/master/docs/FB_TEMPLATE_MESSAGE_BUILDER.md) for more info

### `buttons`, `list` functions
````typescript
type ButtonHandler = { [title: string]: () => Goto | void }
type Bubble = [string, string, string, ButtonHandler]

function buttons(id: string, text: string, handler: ButtonHandler): Button
function list(id: string, type: 'compact' | 'large', bubbles: Bubble[], handler: ButtonHandler): List
````

The `buttons` function allows you to send a [Button Template](https://developers.facebook.com/docs/messenger-platform/send-api-reference/button-template) in your script. The first arg *must* be a string unique amongst all templates defined in your script, the second is the title to display to the user,and the third is your button handler object which defines the buttons names and handler functions in the same way as quick replies in a [`ResponseHandler`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols), it returns a [Button](https://github.com/claudiajs/claudia-bot-builder/blob/master/docs/FB_TEMPLATE_MESSAGE_BUILDER.md)

The `list` function allows you to send a [List Template](https://developers.facebook.com/docs/messenger-platform/send-api-reference/list-template) in your script. The first arg *must* be a string unique amongst all templates defined in your script, the second is the list type, the third is an array of bubbles in your list, and the forth is a button handler object which defines the button names and handler function in the same way as quick replies in a [`ResponseHandler`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols), it returns a [List](https://github.com/claudiajs/claudia-bot-builder/blob/master/docs/FB_TEMPLATE_MESSAGE_BUILDER.md)


### `location`, `onText`, `onLocation`, `onImage`, `onAudio`, `onVideo`, `onFile`, `defaultAction` symbols

A `ResponseHandler` is an object who's methods are called on receiving a message from the user to handle the response to the immediately preceding `expect` statement. The supported methods are:
* _string_`(text?: string)`: A string property causes a quick reply to be attached to the last outgoing message, the function is called on the user selecting the reply, the text passed in will always be the same as the function name
* `[location](lat: number, long: number, title?: string, url?: string)`: The `location` symbol property causes a location quick reply to be attached to the last outgoing message, the function is called on the user selecting the reply
* `[onText](text: string)`: The `onText` symbol property is called when the user types a text response that doesn't match any of the quick replies
* `[onLocation](lat: number, long: number, title?: string, url?: string)`: The `onLocation` symbol property is called when the user sends a location, you cannot define both `location` and `onLocation` properties on the same response handler
* `[onImage](url: string)`: The `onImage` symbol property is called when the user sends an image
* `[onAudio](url: string)`: The `onAudio` symbol property is called when the user sends an audio recording
* `[onVideo](url: string)`: The `onVideo` symbol property is called when the user sends a video
* `[onFile](url: string)`: The `onFile` symbol property is called when the user sends a file
* `[defaultAction]()`: The `defaultAction` symbol property is called if no other mathod matches the user's response so can be used as a catch all. It is also used to specify the default action on [buttons and lists](#buttons-list-functions)

All response handler methods support returning one of `Goto | Expect | void`, you can also return a promise resolving to one of the same set of types: `Promise<Goto | Expect | void>`

Returning a [goto statement](#say-ask-audio-video-image-file-expect-goto-template-literal-tag-functions) from a `ResponseHandler` method will cause the dialogue to jump to the specified label

Returning a [expect statement](#say-ask-audio-video-image-file-expect-goto-template-literal-tag-functions) from a `ResponseHandler` method will delegate the handling of the response to the relevant handler function of the response handler defined for the expect statement specified

### `UnexpectedInputError` class
````typescript
class UnexpectedInputError {
    constructor(message: string, repeatQuestion?: boolean)
}
````
When a [`ResponseHandler`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols) recieves a message from the user for which is does not contain a handler method for an instance of `UnexpectedInputError` is thrown, this will cause the question to be repeated. You can invoke this behaviour in a handled response by throwing this error from the handler method. 

The string you pass to the constructor will be sent to the user followed by repeating the question (the ask statements). If you don't want to repeat the question, pass `true` as the second constructor arg

### `Dialogue` class
````typescript
class Dialogue {
    constructor(builder: DialogueBuilder, storage: Storage, ...context: any)
    baseUrl: string
    execute(directive: Goto | Expect)
    consume(message: Message, apiRequest: Request): Promise<any[]>
    setKeywordHandler(keywords: string | string[], handler: 'restart' | 'undo' | (() => void | Goto)): void
}
````
The `Dialogue` class constructor has two required args, the first is the dialogue (the return value from the [`dialogue` function](#dialogue-function) and the second is the storage handler, you need to pass an object conforming to the following interface to store the dialogue state, typically under your user record in a persistence storage mechanism on your choosing:
````typescript
interface Storage {
    store(state: Object): Promise<void>
    retrieve(): Promise<Object>
}
````
Any additional args passed to the constructor are passed to the [`dialogue` function](#dialogue-function) this would typically be used to pass through the user's details to customize the dialogue plus any object needed in the [`ResponseHandlers`](#location-ontext-onlocation-onimage-onaudio-onvideo-onfile-defaultaction-symbols) to act on user responses.

Setting the `baseUrl` property allows you to pass uris into functions that would normally expect a full url, such as [`audio`, `video`, `image`, `file` template literal tag functions](#say-ask-audio-video-image-file-expect-goto-template-literal-tag-functions) and the [`buttons`, `list` functions](#buttons-list-functions)

Call the `execute` method to jump to another location in the script specified by a [`goto` or `expect` statement](#say-ask-audio-video-image-file-expect-goto-template-literal-tag-functions). This is useful for writing unit tests in combination with the [`mock` namespace](#mock-namespace)

Call the `consume` method to process the input from the user, you need pass in the message and apiRequest from your bot builder handler method, you can return the result of this method directly from your bot builder handler method.

Call the `setKeywordHandler` method to create a keyword which will trigger the callback passed in whenever the user sends any of the keywords passed as the first arg, at any point in the conversation. The callback can return a [goto statement](#say-ask-audio-video-image-file-expect-goto-template-literal-tag-functions) to cause the dialogue to jump to the specified label. 

Two built-in keyword handlers exist, which you can assign keywords to by replacing the callback with either `undo` or `restart`

#### `undo`
The undo keyword handler will repeat the last question asked in the dialogue, allowing the user to correct a mistake
####  `restart`
The restart keyword handler will reset the dialogue to the beginning and is useful to enable during development: *TIP:* Set your restart keyword to match your [Get Started button call to action payload](https://developers.facebook.com/docs/messenger-platform/thread-settings/get-started-button) so when users delete the conversation and initiate a new one your dialogue will begin from the start

### `mock` namespace
````typescript
export namespace mock {
    const apiRequest: Request
    function message(text: string): Message
    function postback(payload?: string): Message
    function location(lat: number, long: number, title?: string, url?: string): Message
    function multimedia(type: 'image' | 'audio' | 'video' | 'file' | 'location', url: string): Message
}
````
The constants and functions defined in the `mock` namespace allow you to easily mock input when calling the [`consume` method of the `Dialogue` class](#dialogue-class), for example:

````typescript
dialogue.consume(mock.message('Hi'), mock.apiRequest)
````

## Behavioral specifications

* [it passes the supplied context to the script method](/tests.ts#L24)
* [it throws an exception on empty script given](/tests.ts#L32)
* [it throws an exception on script only containing labels](/tests.ts#L40)
* [it sends the first and only message in a single message dialogue](/tests.ts#L49)
* [it sends all messages with NO_PUSH notification type](/tests.ts#L59)
* [it throws empty array on consume when complete](/tests.ts#L68)
* [it sends multiple messages at once with pauses and typing indicators in between](/tests.ts#L79)
* [it ensure total pauses are less then 10 seconds when sending multiple messages at once](/tests.ts#L94)
* [it trims extraneous whitespace in messages](/tests.ts#L108)
* [it supports bot builder template class instances inline](/tests.ts#L118)
* [it supports null lines](/tests.ts#L130)
* [it throws an exception on script with duplicate expect statements](/tests.ts#L144)
* [it throws an exception on script with duplicate template ids](/tests.ts#L156)
* [it throws an exception on expect statement not followed by a response handler](/tests.ts#L166)
* [it throws an exception on a response handler not preceded by an expect statement](/tests.ts#L184)
* [it pauses on expect to wait for a response](/tests.ts#L195)
* [it resumes where it paused on receiving a response](/tests.ts#L211)
* [it reevaluates a script after executing a response handler](/tests.ts#L222)
* [it reevaluates a script after executing a keyword handler](/tests.ts#L236)
* [it reevaluates a script after executing a postback handler](/tests.ts#L252)
* [it attaches any quick replies defined in response handler to last message](/tests.ts#L270)
* [it attaches location quick reply if defined in response handler](/tests.ts#L288)
* [it supports promises being returned from response handlers](/tests.ts#L302)
* [it invokes a quick reply's handler on receiving the reply](/tests.ts#L317)
* [it invokes a button handler on receiving the postback](/tests.ts#L328)
* [it invokes a list bubble's button handler on receiving the postback](/tests.ts#L338)
* [it supports empty handlers](/tests.ts#L353)
* [it supports null handlers](/tests.ts#L365)
* [it throws an error when both location and onLocation specified on a handler](/tests.ts#L390)
* [it prefers a quick reply handler to the onText handler](/tests.ts#L403)
* [it invokes the location handler on receiving a location quick reply](/tests.ts#L414)
* [it invokes the onText handler on receiving a text response](/tests.ts#L426)
* [it invokes the onLocation handler on receiving a location response](/tests.ts#L438)
* [it invokes the onImage handler on receiving an image response](/tests.ts#L450)
* [it invokes the onVideo handler on receiving an video response](/tests.ts#L462)
* [it invokes the onAudio handler on receiving an audio response](/tests.ts#L474)
* [it invokes the onFile handler on receiving an file response](/tests.ts#L486)
* [it invokes the defaultAction handler if no other more suitable handler defined](/tests.ts#L498)
* [it invokes the defaultAction handler if no other more suitable handler defined](/tests.ts#L511)
* [it prefers any suitable handler over the defaultAction handler](/tests.ts#L524)
* [it handles unexpected response types by repeating only the ask statements](/tests.ts#L535)
* [it supports the throwing of UnexpectedInputError from response handlers](/tests.ts#L562)
* [it does not repeat the question when repeatQuestion arg to UnexpectedInputError constructor is false](/tests.ts#L581)
* [it falls through a label not prefixed with an exclamation mark](/tests.ts#L597)
* [it breaks on hitting a label prefixed with an exclamation mark](/tests.ts#L613)
* [it respects inline gotos](/tests.ts#L634)
* [it respects gotos executed on the dialogue instance](/tests.ts#L652)
* [it jumps to an expect executed on the dialogue instance](/tests.ts#L668)
* [it respects gotos returned from response handlers](/tests.ts#L687)
* [it throws an exception on calling goto with a missing label](/tests.ts#L706)
* [it throws an exception on script with duplicate labels](/tests.ts#L721)
* [it aborts a goto that causes an endless loop](/tests.ts#L733)
* [it resumes from the correct line when a goto skips a response handler](/tests.ts#L747)
* [it supports expects returned from response handlers to delegate handling](/tests.ts#L772)
* [it aborts an expect returned from response handler that causes an endless loop](/tests.ts#L788)
* [it ignores return values from handlers if not gotos or expects](/tests.ts#L803)
* [it calls a keyword handler when message is received that matches insensitive of case](/tests.ts#L817)
* [it calls a keyword handler matching a postback payload if no postback handler found](/tests.ts#L827)
* [it prefers a matching keyword handler over the current response handler](/tests.ts#L840)
* [it resets the dialogue when user sends a restart keyword](/tests.ts#L854)
* [it returns to previously asked question when user sends a undo keyword](/tests.ts#L873)
* [it returns to last asked question when user sends a undo keyword when complete](/tests.ts#L896)
* [it accounts for skipped questions due to goto statements when user sends a undo keyword](/tests.ts#L915)
* [it supports a user sending an undo or restart keyword at the start of a dialogue](/tests.ts#L939)
* [it prefixes uris with the baseUrl but leaves full urls as is](/tests.ts#L958)
