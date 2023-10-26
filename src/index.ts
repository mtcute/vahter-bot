import { Dispatcher, filters, MessageContext } from '@mtcute/dispatcher'
import { BotKeyboard, html, NodeTelegramClient, tl } from '@mtcute/node'
import { links } from '@mtcute/node/utils.js'

import * as env from './env.js'

const tg = new NodeTelegramClient({
    apiId: env.API_ID,
    apiHash: env.API_HASH,
    storage: 'bot-data/session',
    updates: {
        catchUp: true,
    },
})

const dp = Dispatcher.for(tg)

dp.onNewMessage(filters.start, async (msg) => {
    await msg.answerText(
        html`
            <b>Hello, ${msg.sender.displayName}</b>
            <br /><br />
            I am a bot that will help keep your comments... well, comments.
            <br /><br />
            To do this, add me to your discussion group as an admin, and I will automatically remove all non-comment
            messages, as well as disallow joining the group.
            <br /><br />
            Source code: <a href="//github.com/mtcute/vahter-bot">GitHub</a><br />
            Powered by <a href="//github.com/mtcute/mtcute">mtcute</a>
        `,
        {
            replyMarkup: BotKeyboard.inline([
                [
                    BotKeyboard.url(
                        'Add me to a group',
                        links.botAddToGroup({
                            bot: tg.getMyUsername()!,
                            parameter: 'group',
                            admin: ['banUsers', 'deleteMessages'],
                        }),
                    ),
                ],
            ]),
            disableWebPreview: true,
        },
    )
})

dp.onChatMemberUpdate(filters.and(filters.chatMemberSelf, filters.chatMember('added')), async (upd) => {
    if (upd.chat.chatType !== 'supergroup') {
        await upd.client.leaveChat(upd.chat)
    }

    const self = await upd.client.getChatMember({ chatId: upd.chat, userId: 'self' })

    if (!self?.permissions?.banUsers || !self?.permissions?.deleteMessages) {
        await upd.client.sendText(
            upd.chat,
            html`
                <b>❗ Oops!</b>
                <br /><br />
                It seems like I don't have enough permissions to work. Please make sure to give me the following
                permissions:
                <br />
                • Ban users<br />
                • Delete messages<br />
                <br />
                I'll leave the group now.
            `,
        )
        await upd.client.leaveChat(upd.chat)

        return
    }

    const full = await upd.client.getFullChat(upd.chat)

    if (full.linkedChat?.chatType !== 'channel') {
        await upd.client.sendText(
            upd.chat,
            html`
                <b>❗ Oops!</b>
                <br /><br />
                It seems like this group is not linked to a channel. Please make sure to link the group to a channel,
                and then add me again.
                <br /><br />
                I'll leave the group now.
            `,
        )
        await upd.client.leaveChat(upd.chat)

        return
    }
})

dp.onChatMemberUpdate(
    filters.and(
        filters.not(filters.chatMemberSelf),
        filters.chatMember(['joined', 'added']),
        filters.chat('supergroup'),
    ),
    async (upd) => {
        let msg

        try {
            msg = await upd.client.kickChatMember({ chatId: upd.chat, userId: upd.actor })
        } catch (e) {
            if (tl.RpcError.is(e, 'USER_ADMIN_INVALID')) return
            throw e
        }

        if (msg) {
            await upd.client.deleteMessages([msg])
        }
    },
)

dp.onNewMessage(
    filters.and(
        filters.chat('supergroup'),
        (msg: MessageContext) => msg.replyToMessageId === null && !msg.isAutomaticForward,
    ),
    async (msg) => {
        try {
            await msg.delete()
        } catch (e) {
            if (!tl.RpcError.is(e, 'MESSAGE_DELETE_FORBIDDEN')) {
                throw e
            }
        }
    },
)

tg.run({ botToken: env.BOT_TOKEN }, (user) => {
    console.log('Logged in as', user.username)
})
