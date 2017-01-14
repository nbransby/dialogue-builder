# Dialogue Builder [![npm version][version-image]][package-url] [![Coverage Status][coverage-image]][coverage-url] [![Build status][ci-image]][ci-url]

[package-url]: https://www.npmjs.com/package/dialogue-builder
[version-image]: https://badge.fury.io/js/dialogue-builder.svg
[downloads-image]: https://img.shields.io/npm/dt/dialogue-builder.svg
[ci-image]: https://circleci.com/gh/nbransby/dialogue-builder.svg?style=shield&circle-token=39554b5870ebd54924230c17c9e79751ee788e40
[ci-url]: https://circleci.com/gh/nbransby/dialogue-builder
[coverage-image]:https://codecov.io/gh/nbransby/dialogue-builder/branch/master/graph/badge.svg
[coverage-url]:https://codecov.io/gh/nbransby/dialogue-builder

The goal of this library is to enable you to write a static bot dialogue in a highly readable way that allows you to review the dialogue at a glance:

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

## Guide

Dialogue builder is built on top of the excellent [bot-builder](https://github.com/claudiajs/claudia-bot-builder) by [claudia.js](https://claudiajs.com/) 

## Extra reading 

*  [Full reference](https://github.com/crossrails/compiler/wiki/reference)
