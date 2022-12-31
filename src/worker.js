import { Router } from 'itty-router'
import { proxyHyperDurables } from '@ticketbridge/hyper-durable'
import { StorageDurable } from './storage.durable.js'
import { WebhookDurable } from './webhook.durable.js'
import { nanoid } from 'nanoid'

// import Stripe from 'stripe/lib/stripe.js'
// export const webCrypto = Stripe.createSubtleCryptoProvider()

// const stripe = Stripe('', {
//   httpClient: Stripe.createFetchHttpClient()
// })

export { StorageDurable, WebhookDurable }

export const api = {
  icon: '🚀',
  name: 'webhooks.do',
  description: 'Webhook management for your APIs',
  url: 'https://webhooks.do/api',
  type: 'https://apis.do/templates',
  endpoints: {
    createWebhook: 'POST https://webhooks.do/api/webhooks',
    listWebhooks: 'https://webhooks.do/api/webhooks',
    deleteWebhook: 'https://webhooks.do/api/webhooks/:id/delete',
    triggerTest: 'https://webhooks.do/api/webhooks/:id/trigger-test',
    logs: 'https://webhooks.do/api/webhooks/:id/logs'
  },
  site: 'https://webhooks.do',
  login: 'https://webhooks.do/login',
  signup: 'https://webhooks.do/signup',
  subscribe: 'https://webhooks.do/subscribe',
  repo: 'https://github.com/drivly/webhooks.do',
}

export const gettingStarted = [
  `If you don't already have a JSON Viewer Browser Extension, get that first:`,
  `https://extensions.do`,
]

export const examples = {
}

export default {
  fetch: async (req, env, ctx) => {
    const patch = new Request(
      req.url,
      {
        // headers are unpacked headers from req
        headers: {
          Authorization: req.headers.get('Authorization'),
          'Content-Type': req.headers.get('Content-Type'),
          'X-Forwarded-Proto': req.headers.get('X-Forwarded-Proto'),
          'X-Forwarded-For': req.headers.get('X-Forwarded-For'),
        },
        method: req.method,
        cf: req.cf,
      }
    )

    const body = req.method === 'GET' ? undefined : await req.json()

    console.log(
      Object.fromEntries(req.headers.entries()),
      body
    )

    // For some unknown reason, the body is not readable in ctx.do.
    // This is the only primitive that does this and im genuinely so confused.
    // So for now, we are recreating the request *without* the body.
    // Since we can just read the text direct in this Worker.
    const { user, hostname, pathname, rootPath, pathSegments, query } = await env.CTX.fetch(patch).then(res => res.json())
    if (rootPath) return json({ api, gettingStarted, examples, user })
    
    const router = Router()

    const create_storage = (type, id) => {
      const object = proxyHyperDurables(env, {
        'StorageDurable': StorageDurable,
        'WebhookDurable': WebhookDurable
       })[type]

      return object.get(object.idFromName(`${id}`))
    }

    // The concept is that we scan all webhooks from a user matching a regex provided by the webhook.
    // This matches the event type e.g. airtable.tableID.records.created
    // But can also match airtable.*.records.* - which would match all record events for all tables.

    const requires_auth = async (req) => {
      if (!user) {
        return Response.redirect(`https://${hostname}/login`)
      }
    }

    console.log(
      user
    )

    router.post('/incoming-test', async () => {
      const storage = create_storage('StorageDurable', '25571984')
      //const body = await req.json()
      const signature = req.headers.get('X-Signature')

      const webhook = (await storage.list_webhooks()).find(wb => wb.id === req.headers.get('X-Webhook-Id'))

      const event = await stripe.webhooks.constructEventAsync(
        await req.text(), // raw request body
        sig, // signature header
        env.STRIPE_ENDPOINT_SECRET,
        undefined,
        webCrypto
      );

      const enc = new TextEncoder("utf-8")

      const test = await crypto.subtle.importKey(
        "raw", // raw format of the key - should be Uint8Array
        enc.encode(webhook.secret),
        { // algorithm details
          name: "HMAC",
          hash: {name: "SHA-512"}
        },
        false,
        ["sign", "verify"]
      ).then(async key => {
        // Convert the signature to a Uint8Array.
        const sig = new Uint8Array(signature.split('.')[1].match(/.{1,2}/g).map(byte => parseInt(byte, 16)))

        return await crypto.subtle.verify(
          "HMAC",
          key,
          sig,
          enc.encode(
            `${signature.split('.')[0]}.${JSON.stringify(body)}`
          )
        )
      })

      console.log(
        'TEST EVENT\n',
        test,
        body,
        signature,
      )

      return json({ api, body })
    })

    router.get('/api/webhooks', requires_auth, async () => {
      // List all of this users webhooks.
      const storage = create_storage('StorageDurable', user.id)

      const data = await storage.list_webhooks()

      const webhooks = await Promise.all(data.map(async (webhook) => {
        const wb = create_storage('WebhookDurable', webhook.id)
        
        return {
          ...webhook,
          pending: await wb.repeat_queue,
          deleteWebhook: `https://${hostname}/api/webhooks/${webhook.id}/delete`,
          triggerTest: `https://${hostname}/api/webhooks/${webhook.id}/trigger-test`,
          logs: `https://${hostname}/api/webhooks/${webhook.id}/logs`, 
        }
      }))

      return json({ api, data: webhooks, user })
    })

    router.post('/api/webhooks/create', requires_auth, async (req) => {
      console.log(body)
      const storage = create_storage('StorageDurable', user.id)

      // Create a webhook for this user.
      const webhook = {
        id: `wbhk_` + nanoid(8),
        userID: user.id,
        url: body.url,
        events: body.events,
        secret: `wbhk_sec_` + nanoid(12),
        createdAt: new Date().toISOString(),
        lastExecuted: null,
        lastStatus: null // 200, 400, 500, etc.
      }

      await storage.create_webhook(webhook)

      const wb = create_storage('WebhookDurable', webhook.id)
      await wb.set_meta(webhook)

      return json({ api, data: webhook, user })
    })

    router.get('/api/webhooks/:id/delete', requires_auth, async (req) => {
      const storage = create_storage('StorageDurable', user.id)

      await storage.delete_webhook(req.params.id)

      return Response.redirect(`https://${hostname}/api/webhooks`)
    })

    router.get('/api/webhooks/:id/logs', requires_auth, async ({ params }) => {
      const storage = create_storage('StorageDurable', user.id)
      const wb = create_storage('WebhookDurable', params.id)

      const meta = await wb.meta

      if (meta.userID != user.id) {
        return Response.redirect(`https://${hostname}/api/webhooks`)
      }

      const data = await wb.logs(
        req.params.id,
        query.prefix || ''
      )

      return json({
        api,
        data: {
          next: `https://${hostname}/api/webhooks/${params.id}/logs?cursor=${data.cursor}`,
          ...data,
        },
        user
      })
    })

    router.get('/api/webhooks/:id/trigger-test', requires_auth, async ({ params }) => {
      const storage = create_storage('StorageDurable', user.id)
      const wb = create_storage('WebhookDurable', params.id)
      const meta = await wb.meta

      if (meta.userID != user.id) {
        return Response.redirect(`https://${hostname}/api/webhooks`)
      }

      const report = await wb.trigger({
        id: `wbhk_` + nanoid(8),
        userID: user.id,
        event: 'testEvent.created',
        object: {
          hello: 'world',
          createdAt: new Date().toISOString(),
        }
      })

      return json({
        api,
        data: report,
        user
      })
    })

    router.post('/api/trigger', async () => {
      const options = Object.assign({
        'requires-ack': false, // If true, the function will not respond until at least one response is a 200.
      }, query)

      //const body = await req.json()
      const domain_list = await fetch('https://cdn.jsdelivr.net/gh/drivly/apis.do/_data/domains.csv').then(res => res.text()).then(text => text.split('\n').map(line => line.split(',')[0]))
      domain_list.push('embeds.roled.org')

      // Check if the domain is allowed to trigger this webhook.
      const domain = req.headers.get('CF-Worker') || hostname

      if (!domain_list.includes(domain)) {
        return new Response('Unauthorized, can only submit events via one of Driv.ly\'s services', { status: 401 })
      }

      // Body contains the event object AND the customer ID its intended for.
      const storage = create_storage('StorageDurable', body.userID)

      const webhooks = await storage.list_webhooks(body.event)

      body.id = `evt_` + nanoid(8)

      const tasks = webhooks.map(async (webhook) => {
        const wb = create_storage('WebhookDurable', webhook.id)
        await wb.set_meta(webhook) // Incase this webhook is new.

        const report = await wb.trigger(body)

        await storage.set_webhook_status(webhook.id, report.status)
      })

      if (options['requires-ack']) {
        await Promise.all(tasks)
      } else {
        ctx.waitUntil(Promise.all(tasks))
      }

      return json({
        success: true,
        webhooks: webhooks.map(wb => wb.id),
      })
    })

    const r = await router.handle(req)
    
    if (!r) {
      return new Response(
        JSON.stringify({ error: 'Not Found' }, null, 2),
        { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' }}
      )
    }

    return r 
  }
}

const json = obj => new Response(JSON.stringify(obj, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
