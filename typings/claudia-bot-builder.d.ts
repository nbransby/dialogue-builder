declare module "claudia-bot-builder" {

    import { Request } from 'claudia-api-builder'

    function builder(callback: builder.Callback, options?: builder.Options): void;

    namespace builder {
        type Callback = (message: Message, originalApiRequest: Request) => string | string[] | Promise<string | string[]>

        interface Options {
            platforms: Array<'facebook'|'slackSlashCommand'|'skype'|'telegram'|'twilio'|'alexa'|'viber'|'kik'|'groupme'>
        }

        interface Message {
            text: string,
            type: 'facebook'|'slack-slash-command'|'skype'|'telegram'|'twilio'|'alexa'|'viber'|'kik'|'groupme'
            originalRequest: fbTemplate.Request
            sender: string
            postback: boolean
        }

        namespace fbTemplate {
            class Text {
                constructor(text: string)
                addQuickReply(title: string, payload: string, image?: string): Text
                addQuickReplyLocation(): Text
                get(): string 
            }

            class Pause {
                constructor(duration?: number)
                get(): string 
            }

            interface Request {
                sender: { id: string }
                recipient: { id: string }
                timestamp: number
                message: Message
            }

            interface Message {
                mid: string
                seq: number
                text: string
                quick_reply?: { payload: string }
                attachments?: Attachment[]
           }

           interface Attachment {
                type: 'image'|'audio'|'video'|'file'|'location'
                payload: { title?: string, url?: string, coordinates?: { lat: number, long: number} }
            }
        }
        
    }

    export = builder;
}
