import type { MessageContext } from '@mtcute/dispatcher'
import { readFileSync, writeFileSync } from 'node:fs'
import { Dispatcher, filters } from '@mtcute/dispatcher'
import { BotKeyboard, html, TelegramClient, tl } from '@mtcute/node'
import { links } from '@mtcute/node/utils.js'

import * as env from './env.js'

const tg = new TelegramClient({
  apiId: env.API_ID,
  apiHash: env.API_HASH,
  storage: 'bot-data/session',
  updates: {
    catchUp: true,
  },
})

const badChats = new Set<number>()
const badChatsFile = 'bot-data/bad-chats.json'

try {
  const data = readFileSync(badChatsFile, 'utf-8')
  const chats = JSON.parse(data)

  for (const chat of chats) {
    badChats.add(chat)
  }
} catch (e) {
  console.log('Failed to load bad chats', e)
}

const dp = Dispatcher.for(tg)

dp.onNewMessage(filters.start, async (msg) => {
  await msg.answerText(
    html`
      <b>hello, ${msg.sender.displayName}</b>
      <br /><br />
      i am a bot that will help keep your comments... well, comments.
      <br /><br />
      to do this, add me to your discussion group as an admin, and I will automatically remove all non-comment
      messages, as well as disallow joining the group.
      <br /><br />
      source code: <a href="//github.com/mtcute/vahter-bot">github</a><br />
      powered by <a href="//github.com/mtcute/mtcute">mtcute</a>
    `,
    {
      replyMarkup: BotKeyboard.inline([
        [
          BotKeyboard.url(
            'Add me to a group',
            links.botAddToGroup({
              bot: (await tg.getMyUsername())!,
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
  if (upd.chat.chatType !== 'supergroup' || badChats.has(upd.chat.id)) {
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
    filters.not(filters.or(filters.replyOrigin('same_chat'), filters.replyOrigin('other_chat'))),
    (msg: MessageContext) => !msg.isAutomaticForward,
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

dp.onNewMessage(
  filters.and(
    filters.chat('user'),
    filters.userId(1787945512),
    filters.command('/badchat'),
  ),
  async (msg) => {
    const chatId = msg.command[1]

    if (!chatId) {
      await msg.answerText('Usage: /badchat <chat id>')
      return
    }

    badChats.add(Number(chatId))
    writeFileSync(badChatsFile, JSON.stringify(Array.from(badChats)))

    // try to leave the chat
    try {
      await tg.leaveChat(Number(chatId))
    } catch (e) {
      console.error('Failed to leave chat', e)
    }

    await msg.answerText('Chat added to bad chats')
  },
)

tg.run({ botToken: env.BOT_TOKEN }, (user) => {
  console.log('Logged in as', user.username)
})
