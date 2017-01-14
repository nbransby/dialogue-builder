# Dialogue Builder [![npm version][version-image]][package-url] [![Coverage Status][coverage-image]][coverage-url] [![Build status][ci-image]][ci-url]

[package-url]: https://www.npmjs.com/package/dialogue-builder
[version-image]: https://badge.fury.io/js/dialogue-builder.svg
[downloads-image]: https://img.shields.io/npm/dt/dialogue-builder.svg
[ci-image]: https://circleci.com/gh/nbransby/dialogue-builder.svg?style=shield&circle-token=39554b5870ebd54924230c17c9e79751ee788e40
[ci-url]: https://circleci.com/gh/nbransby/dialogue-builder
[coverage-image]:https://codecov.io/gh/nbransby/dialogue-builder/branch/master/graph/badge.svg
[coverage-url]:https://codecov.io/gh/nbransby/dialogue-builder

The goal of this library is to enable you to write a static bot dialogue in a highly readable way that allows you to review the dialogue at a glance, it currently has only been designed to work with Facebook Messenger bots. 


```javascript
exports.default = dialogue('Onboarding ', (name) => [ 
    say `Hi ${name}, welcome to nosy bot!`, 
    say `This inquisitive little bot will ask a bunch of questions for no reason`, 
    say `It will log your answers pointlessly to the console`, 
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

## Intro

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
    const messages = dialogue.consume(message);
    if(dialogue.isComplete) {
        //do something
    }
    return messages;
});
````

Dialogue builder is built on top of the excellent [bot-builder](https://github.com/claudiajs/claudia-bot-builder) by [claudia.js](https://claudiajs.com/) and the code above is the entry point for a bot builder project. Each invocation of the function above is caused by an incoming message from the user. The `consume` method called above would continue the dialogue where it left off, calling any responses handlers for the incoming message and returning the next set of outgoing messages to sent. 

Except in the example above the bot would simply repeat the beginning of the dialog each time the user sent a message because the state handler (`store` and `retrieve` methods) is not persisting the internal dialogue state (which is a plain old json object. You would normally store this state under your user record in a persistence storage mechanism on your choosing. 

## Reference

The dialogue-builder module exports the following:
* `dialogue` function
* `Dialogue` class

### `dialogue` function

### `Dialogue` class

The `Dialogue` class has two required args, the first is the dialogue (the return value from the `dialogue` function in the first  

## Extra reading 

*  [Test examples](https://github.com/crossrails/compiler/wiki/reference)
