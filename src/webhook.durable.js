import { HyperDurable } from '@ticketbridge/hyper-durable'

const clone = (x) => JSON.parse(JSON.stringify(x))

export class WebhookDurable extends HyperDurable {
  constructor(state, env) {
    super(state, env)

    this.meta = {} // For storing metadata about this webhook.
    this.repeat_queue = []
  }

  log(msg) {
    console.log(`[WebhookDurable] ${msg}`)

    fetch(
      `https://websockets.do/webhooks-do/emit?log=${msg}&from=WebhookDurable`
    )
  }

  set_meta(meta) { this.meta = meta }

  async trigger(evt, opt) {
    const event = {
      ...evt
    }

    this.log(
      `Triggering event ${event.event} for ${event.id} with options ${JSON.stringify(event)}`
    )

    const previous = this.repeat_queue.find(e => e.id == event.id) || {}

    if (previous.id) {
      // This event is a repeat send.
      event.repeat_count = previous.repeat_count + 1
    } else {
      event.repeat_count = 0
    }

    delete event.userID // Don't send the userID to the webhook.

    // Using the secret as a starting point, we should create a signature that can be verified by the webhook.
    var enc = new TextEncoder("utf-8")

    const ts = new Date().getTime()

    const signature = await crypto.subtle.importKey(
        "raw", // raw format of the key - should be Uint8Array
        enc.encode(this.meta.secret),
        { // algorithm details
            name: "HMAC",
            hash: {name: "SHA-256"}
        },
        false, // export = false
        ["sign", "verify"] // what this key can do
    ).then(async key => {
        return await crypto.subtle.sign(
            "HMAC",
            key,
            enc.encode(`${ts}.${JSON.stringify(event)}`) // We use a timestamp to prevent replay attacks.
        ).then(signature => {
          return Array.prototype.map.call(new Uint8Array(signature), x => x.toString(16).padStart(2, '0')).join("")
        })
    })

    this.log(
      `Signature: ${signature}`
    )

    // Verify the signature.
    // For users who want to verify the signature, they can use the following code:

    // const test = await crypto.subtle.importKey(
    //   "raw", // raw format of the key - should be Uint8Array
    //   enc.encode(WebHookSecret),
    //   { // algorithm details
    //     name: "HMAC",
    //     hash: {name: "SHA-512"}
    //   },
    //   false,
    //   ["sign", "verify"]
    // ).then(async key => {
    //   // Convert the signature to a Uint8Array.
    //   const sig = new Uint8Array(signature.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))

    //   return await crypto.subtle.verify(
    //     "HMAC",
    //     key,
    //     sig,
    //     enc.encode(JSON.stringify(event))
    //   )
    // })

    const resp = await fetch(this.meta.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': `t=${ts},v1=${signature}`,
        'X-Webhook-Id': this.meta.id,
      },
      body: JSON.stringify(event),
    })

    this.log(
      `Response: ${resp.status}`
    )

    if (resp.status == 200) {
      // Success
      this.repeat_queue = clone(this.repeat_queue.filter(e => e.id != event.id).filter(x => x))
    } else {
      // Failed
      if (event.repeat_count < 5) {
        if (previous.id) {
          this.repeat_queue = this.repeat_queue.filter(e => e.id != event.id).filter(x => x)
          this.repeat_queue.push(event)
        }

        this.repeat_queue.push(event)
         
        if (!await this.state.storage.getAlarm()) {
          // We have no alarm currently set.
          await this.state.storage.setAlarm(Date.now() + 1000 * 120) // 2 minutes
        }
      } else {
        this.repeat_queue = this.repeat_queue.filter(e => e.id != event.id).filter(x => x)
      }
    }

    const report = {
      createdAt: new Date().toISOString(),
      status: resp.status,
      event,
      response: resp.headers.get('Content-Type').includes('json') ? await resp.json() : ( resp.headers.get('Content-Type').includes('text/') ? await resp.text() : null ),
    }

    await this.env.STORAGE.put(
      `webhook:${this.meta.id}:${event.event} -> ${event.id}`,
      JSON.stringify(report),
      {
        expirationTtl: 60 * 60 * 24 * 30, // 1 month
      }
    )

    return report
  }

  async logs(webhook_id, prefix, cursor) {
    const data = await this.env.STORAGE.list({
      prefix: `webhook:${webhook_id}:${prefix}`,
      limit: 15,
      cursor
    })

    return {
      logs: await Promise.all(data.keys.map(async key => {
        const value = await this.env.STORAGE.get(key.name)
        return {
          ...JSON.parse(value),
          key: key.name,
        }
      })),
      cursor: data.cursor,
    }
  }

  async alarm() {
    await this.initialize()

    console.log(
      `[WebhookDurable] Alarm triggered. Repeat queue: ${JSON.stringify(this.repeat_queue)}`
    )

    console.log(
      this.meta
    )

    for (const event of this.repeat_queue) {
      await this.trigger(event)
    }
  }
}