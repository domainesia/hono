import { HTTPException } from '../../http-exception'
import type { HonoRequest } from '../../request'
import type { MiddlewareHandler } from '../../types'
import { timingSafeEqual } from '../../utils/buffer'
import { decodeBase64 } from '../../utils/encode'

const CREDENTIALS_REGEXP = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$/
const USER_PASS_REGEXP = /^([^:]*):(.*)$/
const utf8Decoder = new TextDecoder()
const auth = (req: HonoRequest) => {
  const match = CREDENTIALS_REGEXP.exec(req.headers.get('Authorization') || '')
  if (!match) {
    return undefined
  }

  const userPass = USER_PASS_REGEXP.exec(utf8Decoder.decode(decodeBase64(match[1])))

  if (!userPass) {
    return undefined
  }

  return { username: userPass[1], password: userPass[2] }
}

export const basicAuth = (
  options: { username: string; password: string; realm?: string; hashFunction?: Function },
  ...users: { username: string; password: string }[]
): MiddlewareHandler => {
  if (!options) {
    throw new Error('basic auth middleware requires options for "username and password"')
  }

  if (!options.realm) {
    options.realm = 'Secure Area'
  }
  users.unshift({ username: options.username, password: options.password })

  return async (ctx, next) => {
    const requestUser = auth(ctx.req)
    if (requestUser) {
      for (const user of users) {
        const usernameEqual = await timingSafeEqual(
          user.username,
          requestUser.username,
          options.hashFunction
        )
        const passwordEqual = await timingSafeEqual(
          user.password,
          requestUser.password,
          options.hashFunction
        )
        if (usernameEqual && passwordEqual) {
          await next()
          return
        }
      }
    }
    const res = new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="' + options.realm?.replace(/"/g, '\\"') + '"',
      },
    })
    throw new HTTPException(401, { res })
  }
}
